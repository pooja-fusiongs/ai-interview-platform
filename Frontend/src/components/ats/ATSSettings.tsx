import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  IconButton,
  Alert,
  Tooltip,
  Fade,
  Grow,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Add,
  Sync,
  Delete,
  CheckCircle,
  // Error as ErrorIcon,
  Cable,
  Refresh,
  PlayArrow,
  CloudDone,
  // CloudOff,
  Schedule,
  Link,
  // LinkOff,
  // MoreVert,
  // Settings,
} from '@mui/icons-material';
import Navigation from '../layout/sidebar';
import atsService from '../../services/atsService';
import ATSConnectionForm from './ATSConnectionForm';

interface Connection {
  id: number;
  provider: string;
  is_active: boolean;
  last_sync_at: string | null;
  sync_status: string;
}

// Provider logos/colors mapping
const providerConfig: Record<string, { color: string; bg: string; icon: string }> = {
  greenhouse: { color: '#24a47f', bg: '#e6f7f1', icon: 'G' },
  lever: { color: '#5c5ce0', bg: '#eeeeff', icon: 'L' },
  workday: { color: '#0062ff', bg: '#e6f0ff', icon: 'W' },
  bamboohr: { color: '#73c41d', bg: '#f0f9e6', icon: 'B' },
  icims: { color: '#ff6b00', bg: '#fff3e6', icon: 'I' },
  taleo: { color: '#c74634', bg: '#fbeae8', icon: 'T' },
  default: { color: '#64748b', bg: '#f1f5f9', icon: 'A' },
};

const getProviderConfig = (provider: string) => {
  const key = provider.toLowerCase();
  return providerConfig[key] || providerConfig.default;
};

const getRelativeTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const ATSSettings: React.FC = () => {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState<number | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Connection | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchConnections = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await atsService.getConnections();
      setConnections(data);
      setError('');
    } catch (err) {
      setError('Failed to load ATS connections');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  const handleTest = async (id: number) => {
    setTesting(id);
    try {
      await atsService.testConnection(id);
      fetchConnections();
    } catch {
      setError('Connection test failed');
    } finally {
      setTesting(null);
    }
  };

  const handleDelete = async (conn: Connection) => {
    try {
      await atsService.deleteConnection(conn.id);
      setConnections((prev) => prev.filter((c) => c.id !== conn.id));
      setDeleteConfirm(null);
    } catch {
      setError('Failed to delete connection');
    }
  };

  const handleSync = async (id: number) => {
    setSyncing(id);
    try {
      await atsService.triggerSync(id, 'full');
      fetchConnections();
    } catch {
      setError('Sync trigger failed');
    } finally {
      setSyncing(null);
    }
  };

  // Stats
  const activeCount = connections.filter((c) => c.is_active).length;
  const successCount = connections.filter((c) => c.sync_status === 'success').length;

  // Card Skeleton
  const CardSkeleton = () => (
    <Card sx={{ borderRadius: '16px', border: '1px solid #e5e7eb', height: '100%' }}>
      <CardContent sx={{ padding: '24px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 3 }}>
          <Skeleton variant="rounded" width={56} height={56} sx={{ borderRadius: '14px' }} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width={120} height={28} />
            <Skeleton variant="text" width={80} height={20} />
          </Box>
        </Box>
        <Skeleton variant="rounded" height={60} sx={{ borderRadius: '10px', mb: 2 }} />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Skeleton variant="rounded" width={80} height={36} sx={{ borderRadius: '8px' }} />
          <Skeleton variant="rounded" width={80} height={36} sx={{ borderRadius: '8px' }} />
        </Box>
      </CardContent>
    </Card>
  );

  // Empty State
  const EmptyState = () => (
    <Fade in timeout={500}>
      <Box
        sx={{
          textAlign: 'center',
          py: 8,
          px: 4,
        }}
      >
        <Box
          sx={{
            width: 120,
            height: 120,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
          }}
        >
          <Cable sx={{ fontSize: 56, color: '#3b82f6' }} />
        </Box>
        <Typography
          sx={{
            fontSize: '20px',
            fontWeight: 600,
            color: '#1e293b',
            mb: 1,
          }}
        >
          No ATS Connections Yet
        </Typography>
        <Typography
          sx={{
            fontSize: '14px',
            color: '#64748b',
            maxWidth: 400,
            margin: '0 auto 24px',
            lineHeight: 1.6,
          }}
        >
          Connect your Applicant Tracking System to automatically sync candidates, jobs, and interview data.
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setDialogOpen(true)}
          sx={{
            borderRadius: '10px',
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '14px',
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)',
            '&:hover': {
              background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
            },
          }}
        >
          Add Your First Connection
        </Button>
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mt: 4 }}>
          {['Greenhouse', 'Lever', 'Workday', 'BambooHR'].map((name) => {
            const config = getProviderConfig(name);
            return (
              <Tooltip key={name} title={name} arrow>
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: '10px',
                    backgroundColor: config.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: config.color,
                    fontWeight: 700,
                    fontSize: '16px',
                    opacity: 0.7,
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                    '&:hover': {
                      opacity: 1,
                      transform: 'scale(1.1)',
                    },
                  }}
                >
                  {config.icon}
                </Box>
              </Tooltip>
            );
          })}
        </Box>
      </Box>
    </Fade>
  );

  return (
    <Navigation>
      <Box
        sx={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #F8F9FB 0%, #EEF2F6 100%)',
          padding: '24px',
        }}
      >
        {/* Page Header */}
        <Box sx={{ mb: '24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(59, 130, 246, 0.3)',
              }}
            >
              <Cable sx={{ color: '#fff', fontSize: '26px' }} />
            </Box>
            <Box>
              <Typography
                sx={{
                  fontSize: '26px',
                  fontWeight: 700,
                  color: '#1e293b',
                  letterSpacing: '-0.02em',
                }}
              >
                ATS Integrations
              </Typography>
              <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
                Manage your Applicant Tracking System connections
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: '12px' }}>
            <Tooltip title="Refresh" arrow>
              <IconButton
                onClick={() => fetchConnections(true)}
                disabled={refreshing}
                sx={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  width: 42,
                  height: 42,
                  '&:hover': { backgroundColor: '#f8fafc', borderColor: '#d1d5db' },
                }}
              >
                <Refresh
                  sx={{
                    fontSize: '20px',
                    color: '#64748b',
                    animation: refreshing ? 'spin 1s linear infinite' : 'none',
                    '@keyframes spin': {
                      '0%': { transform: 'rotate(0deg)' },
                      '100%': { transform: 'rotate(360deg)' },
                    },
                  }}
                />
              </IconButton>
            </Tooltip>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => setDialogOpen(true)}
               sx={{
                background: 'rgba(245, 158, 11, 0.1)',
                color: '#f59e0b',
                border: '2px solid #f59e0b',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 600,
                textTransform: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                minWidth: '120px',
                '&:hover': {
                  background: 'rgba(245, 158, 11, 0.1)',
                  borderColor: '#f59e0b',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 8px 25px rgba(99, 102, 241, 0.25)'
                }
              }}
            >
              Add Connection
            </Button>
          </Box>
        </Box>

        {error && (
          <Alert
            severity="error"
            sx={{ mb: 3, borderRadius: '12px', border: '1px solid #fecaca' }}
            onClose={() => setError('')}
          >
            {error}
          </Alert>
        )}

        {/* Quick Stats */}
        {!loading && connections.length > 0 && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
              gap: '16px',
              mb: '24px',
            }}
          >
            <Grow in timeout={300}>
              <Card
                sx={{
                  borderRadius: '12px',
                  border: '1px solid #e5e7eb',
                  boxShadow: 'none',
                  transition: 'all 0.2s ease',
                  '&:hover': { boxShadow: '0 4px 12px rgba(0, 0, 0, 0.06)' },
                }}
              >
                <CardContent sx={{ padding: '16px !important', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: '10px',
                      backgroundColor: '#eff6ff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Link sx={{ color: '#3b82f6', fontSize: '20px' }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>
                      {connections.length}
                    </Typography>
                    <Typography sx={{ fontSize: '13px', color: '#64748b' }}>Total Connections</Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grow>

            <Grow in timeout={400}>
              <Card
                sx={{
                  borderRadius: '12px',
                  border: '1px solid #e5e7eb',
                  boxShadow: 'none',
                  transition: 'all 0.2s ease',
                  '&:hover': { boxShadow: '0 4px 12px rgba(0, 0, 0, 0.06)' },
                }}
              >
                <CardContent sx={{ padding: '16px !important', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: '10px',
                      backgroundColor: '#f0fdf4',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CloudDone sx={{ color: '#22c55e', fontSize: '20px' }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>
                      {activeCount}
                    </Typography>
                    <Typography sx={{ fontSize: '13px', color: '#64748b' }}>Active</Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grow>

            <Grow in timeout={500}>
              <Card
                sx={{
                  borderRadius: '12px',
                  border: '1px solid #e5e7eb',
                  boxShadow: 'none',
                  transition: 'all 0.2s ease',
                  '&:hover': { boxShadow: '0 4px 12px rgba(0, 0, 0, 0.06)' },
                }}
              >
                <CardContent sx={{ padding: '16px !important', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: '10px',
                      backgroundColor: '#f0fdf4',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CheckCircle sx={{ color: '#22c55e', fontSize: '20px' }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>
                      {successCount}
                    </Typography>
                    <Typography sx={{ fontSize: '13px', color: '#64748b' }}>Synced Successfully</Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grow>
          </Box>
        )}

        {loading ? (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' },
              gap: '20px',
            }}
          >
            {[1, 2, 3].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </Box>
        ) : connections.length === 0 ? (
          <Card sx={{ borderRadius: '16px', border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)' }}>
            <EmptyState />
          </Card>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' },
              gap: '20px',
            }}
          >
            {connections.map((conn, index) => {
              const config = getProviderConfig(conn.provider);
              const isSuccess = conn.sync_status === 'success';

              return (
                <Grow in key={conn.id} timeout={300 + index * 100}>
                  <Card
                    sx={{
                      borderRadius: '16px',
                      border: conn.is_active ? '1px solid #e5e7eb' : '1px solid #fecaca',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)',
                      transition: 'all 0.25s ease',
                      overflow: 'hidden',
                      '&:hover': {
                        boxShadow: '0 8px 28px rgba(0, 0, 0, 0.1)',
                        transform: 'translateY(-2px)',
                      },
                    }}
                  >
                    {/* Card Header */}
                    <Box
                      sx={{
                        padding: '20px',
                        borderBottom: '1px solid #f1f5f9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: conn.is_active ? '#fafbfc' : '#fef2f2',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <Box
                          sx={{
                            width: 52,
                            height: 52,
                            borderRadius: '14px',
                            backgroundColor: config.bg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: config.color,
                            fontSize: '22px',
                            fontWeight: 700,
                            border: `2px solid ${config.color}30`,
                          }}
                        >
                          {config.icon}
                        </Box>
                        <Box>
                          <Typography sx={{ fontSize: '17px', fontWeight: 600, color: '#1e293b', textTransform: 'capitalize' }}>
                            {conn.provider}
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                backgroundColor: conn.is_active ? '#22c55e' : '#ef4444',
                              }}
                            />
                            <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                              {conn.is_active ? 'Active' : 'Inactive'}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                      <Chip
                        label={conn.is_active ? 'Connected' : 'Disconnected'}
                        size="small"
                        sx={{
                          backgroundColor: conn.is_active ? '#f0fdf4' : '#fef2f2',
                          color: conn.is_active ? '#22c55e' : '#ef4444',
                          fontWeight: 600,
                          fontSize: '11px',
                          height: '26px',
                          border: `1px solid ${conn.is_active ? '#22c55e' : '#ef4444'}30`,
                        }}
                      />
                    </Box>

                    <CardContent sx={{ padding: '20px !important' }}>
                      {/* Sync Status */}
                      <Box
                        sx={{
                          padding: '14px 16px',
                          borderRadius: '10px',
                          backgroundColor: isSuccess ? '#f0fdf4' : '#fffbeb',
                          border: `1px solid ${isSuccess ? '#22c55e' : '#f59e0b'}20`,
                          mb: '16px',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {isSuccess ? (
                              <CheckCircle sx={{ color: '#22c55e', fontSize: '18px' }} />
                            ) : (
                              <Schedule sx={{ color: '#f59e0b', fontSize: '18px' }} />
                            )}
                            <Box>
                              <Typography sx={{ fontSize: '13px', fontWeight: 600, color: isSuccess ? '#16a34a' : '#d97706' }}>
                                {isSuccess ? 'Sync Successful' : conn.sync_status || 'Pending Sync'}
                              </Typography>
                              <Typography sx={{ fontSize: '11px', color: '#64748b' }}>
                                {conn.last_sync_at ? `Last sync: ${getRelativeTime(conn.last_sync_at)}` : 'Never synced'}
                              </Typography>
                            </Box>
                          </Box>
                        </Box>
                      </Box>

                      {/* Actions */}
                      <Box sx={{ display: 'flex', gap: '10px' }}>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => handleTest(conn.id)}
                          disabled={testing === conn.id}
                          sx={{
                            flex: 1,
                            borderRadius: '8px',
                            textTransform: 'none',
                            fontWeight: 600,
                            fontSize: '13px',
                            borderColor: '#e5e7eb',
                            color: '#475569',
                            '&:hover': {
                              borderColor: '#d1d5db',
                              backgroundColor: '#f8fafc',
                            },
                          }}
                          startIcon={
                            testing === conn.id ? (
                              <Box
                                sx={{
                                  width: 16,
                                  height: 16,
                                  border: '2px solid #d1d5db',
                                  borderTopColor: '#3b82f6',
                                  borderRadius: '50%',
                                  animation: 'spin 1s linear infinite',
                                  '@keyframes spin': {
                                    '0%': { transform: 'rotate(0deg)' },
                                    '100%': { transform: 'rotate(360deg)' },
                                  },
                                }}
                              />
                            ) : (
                              <PlayArrow sx={{ fontSize: '16px' }} />
                            )
                          }
                        >
                          Test
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => handleSync(conn.id)}
                          disabled={syncing === conn.id}
                          sx={{
                            flex: 1,
                            borderRadius: '8px',
                            textTransform: 'none',
                            fontWeight: 600,
                            fontSize: '13px',
                            borderColor: '#3b82f6',
                            color: '#3b82f6',
                            '&:hover': {
                              borderColor: '#2563eb',
                              backgroundColor: '#eff6ff',
                            },
                          }}
                          startIcon={
                            <Sync
                              sx={{
                                fontSize: '16px',
                                animation: syncing === conn.id ? 'spin 1s linear infinite' : 'none',
                              }}
                            />
                          }
                        >
                          Sync
                        </Button>
                        <Tooltip title="Delete connection" arrow>
                          <IconButton
                            size="small"
                            onClick={() => setDeleteConfirm(conn)}
                            sx={{
                              borderRadius: '8px',
                              border: '1px solid #fecaca',
                              color: '#ef4444',
                              '&:hover': {
                                backgroundColor: '#fef2f2',
                                borderColor: '#ef4444',
                              },
                            }}
                          >
                            <Delete sx={{ fontSize: '18px' }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </CardContent>
                  </Card>
                </Grow>
              );
            })}
          </Box>
        )}

        {/* Connection Form Dialog */}
        <ATSConnectionForm
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSaved={() => {
            setDialogOpen(false);
            fetchConnections();
          }}
        />

        {/* Delete Confirmation Dialog */}
        <Dialog
          open={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          PaperProps={{
            sx: {
              borderRadius: '16px',
              padding: '8px',
              maxWidth: '400px',
            },
          }}
        >
          <DialogTitle sx={{ fontWeight: 600, fontSize: '18px', pb: 1 }}>Delete Connection?</DialogTitle>
          <DialogContent>
            <Typography sx={{ color: '#64748b', fontSize: '14px' }}>
              Are you sure you want to delete the <strong>{deleteConfirm?.provider}</strong> connection? This action
              cannot be undone.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ padding: '16px 24px' }}>
            <Button
              onClick={() => setDeleteConfirm(null)}
              sx={{
                borderRadius: '8px',
                textTransform: 'none',
                fontWeight: 500,
                color: '#64748b',
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              variant="contained"
              color="error"
              sx={{
                borderRadius: '8px',
                textTransform: 'none',
                fontWeight: 600,
                boxShadow: 'none',
                '&:hover': { boxShadow: 'none' },
              }}
            >
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Navigation>
  );
};

export default ATSSettings;
