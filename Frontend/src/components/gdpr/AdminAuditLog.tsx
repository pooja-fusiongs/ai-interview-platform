import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  TextField,
  MenuItem,
  Button,
  IconButton,
  Tooltip,
  Skeleton,
  Dialog,
  Badge,
} from '@mui/material';
import {
  History,
  Refresh,
  FilterList,
  CheckCircle,
  Cancel,
  Download,
  Delete,
  Visibility,
  Person,
  Computer,
  AccessTime,
  Description,
  SearchOff,
  Close,
} from '@mui/icons-material';
import Navigation from '../layout/Sidebar';
import { gdprService } from '../../services/gdprService';
import toast from 'react-hot-toast';

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  user_id: string | number;
  timestamp: string;
  details: string;
  ip_address: string;
}

const ACTION_TYPES = ['all', 'consent_granted', 'consent_revoked', 'data_export', 'data_deletion', 'data_access'];

// Get icon for action type
const getActionIcon = (action: string) => {
  if (action.includes('granted')) return <CheckCircle sx={{ fontSize: 16 }} />;
  if (action.includes('revoked')) return <Cancel sx={{ fontSize: 16 }} />;
  if (action.includes('export')) return <Download sx={{ fontSize: 16 }} />;
  if (action.includes('deletion')) return <Delete sx={{ fontSize: 16 }} />;
  if (action.includes('access')) return <Visibility sx={{ fontSize: 16 }} />;
  return <Description sx={{ fontSize: 16 }} />;
};

// Get color for action type
const getActionStyle = (action: string) => {
  if (action.includes('granted')) return { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' };
  if (action.includes('revoked')) return { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
  if (action.includes('export')) return { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' };
  if (action.includes('deletion')) return { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
  if (action.includes('access')) return { bg: '#f5f3ff', color: '#7c3aed', border: '#ddd6fe' };
  return { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' };
};

const AdminAuditLog: React.FC = () => {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  // Temporary filter states for modal
  const [tempActionFilter, setTempActionFilter] = useState('all');
  const [tempDateFrom, setTempDateFrom] = useState('');
  const [tempDateTo, setTempDateTo] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (actionFilter !== 'all') params.action = actionFilter;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      const data = await gdprService.getAuditLogs(params);
      setLogs(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load audit logs');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const clearFilters = () => {
    setActionFilter('all');
    setDateFrom('');
    setDateTo('');
    setTempActionFilter('all');
    setTempDateFrom('');
    setTempDateTo('');
  };

  const handleOpenFilter = () => {
    setTempActionFilter(actionFilter);
    setTempDateFrom(dateFrom);
    setTempDateTo(dateTo);
    setFilterOpen(true);
  };

  const handleCloseFilter = () => {
    setFilterOpen(false);
  };

  const handleApplyFilters = () => {
    setActionFilter(tempActionFilter);
    setDateFrom(tempDateFrom);
    setDateTo(tempDateTo);
    setFilterOpen(false);
  };

  // Apply filters when state changes
  useEffect(() => {
    if (!loading) {
      fetchLogs();
    }
  }, [actionFilter, dateFrom, dateTo]);

  const activeFilterCount = [
    actionFilter !== 'all',
    dateFrom !== '',
    dateTo !== '',
  ].filter(Boolean).length;

  return (
    <Navigation>
      <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', p: { xs: 2, md: 4 } }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4, flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ width: 52, height: 52, borderRadius: '14px', bgcolor: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <History sx={{ color: '#fff', fontSize: 26 }} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: '26px', fontWeight: 700, color: '#0f172a' }}>Audit Log</Typography>
              <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
                Track all GDPR-related activities
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="Filter">
              <IconButton onClick={handleOpenFilter} sx={{ bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                <Badge badgeContent={activeFilterCount} color="primary" sx={{ '& .MuiBadge-badge': { fontSize: '10px', minWidth: '16px', height: '16px' } }}>
                  <FilterList sx={{ fontSize: 20, color: '#64748b' }} /><Typography sx={{fontSize:"14px"}}>Filter</Typography>
                </Badge>
              </IconButton>
            </Tooltip>
            <Tooltip title="Refresh">
              <IconButton onClick={fetchLogs} sx={{ bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                <Refresh sx={{ fontSize: 20, color: '#64748b' }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Active Filters Display */}
        {activeFilterCount > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: '13px', color: '#64748b' }}>Active filters:</Typography>
            {actionFilter !== 'all' && (
              <Chip
                label={actionFilter.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                size="small"
                onDelete={() => setActionFilter('all')}
                sx={{ bgcolor: '#eff6ff', color: '#3b82f6', '& .MuiChip-deleteIcon': { color: '#3b82f6' } }}
              />
            )}
            {dateFrom && (
              <Chip
                label={`From: ${dateFrom}`}
                size="small"
                onDelete={() => setDateFrom('')}
                sx={{ bgcolor: '#f0fdf4', color: '#16a34a', '& .MuiChip-deleteIcon': { color: '#16a34a' } }}
              />
            )}
            {dateTo && (
              <Chip
                label={`To: ${dateTo}`}
                size="small"
                onDelete={() => setDateTo('')}
                sx={{ bgcolor: '#fef3c7', color: '#020291', '& .MuiChip-deleteIcon': { color: '#020291' } }}
              />
            )}
            <Button size="small" onClick={clearFilters} sx={{ fontSize: '12px', color: '#64748b', textTransform: 'none' }}>
              Clear all
            </Button>
          </Box>
        )}

        {/* Stats Cards */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
          <Card sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <CardContent sx={{ p: '16px !important' }}>
              <Typography sx={{ fontSize: '12px', color: '#64748b', mb: 0.5 }}>Total Entries</Typography>
              <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>{loading ? '-' : logs.length}</Typography>
            </CardContent>
          </Card>
          <Card sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <CardContent sx={{ p: '16px !important' }}>
              <Typography sx={{ fontSize: '12px', color: '#64748b', mb: 0.5 }}>Consents Granted</Typography>
              <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#16a34a' }}>
                {loading ? '-' : logs.filter(l => l.action?.includes('granted')).length}
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <CardContent sx={{ p: '16px !important' }}>
              <Typography sx={{ fontSize: '12px', color: '#64748b', mb: 0.5 }}>Data Exports</Typography>
              <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#2563eb' }}>
                {loading ? '-' : logs.filter(l => l.action?.includes('export')).length}
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <CardContent sx={{ p: '16px !important' }}>
              <Typography sx={{ fontSize: '12px', color: '#64748b', mb: 0.5 }}>Deletions</Typography>
              <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#dc2626' }}>
                {loading ? '-' : logs.filter(l => l.action?.includes('deletion')).length}
              </Typography>
            </CardContent>
          </Card>
        </Box>

        {/* Audit Log List */}
        <Card sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
          <CardContent sx={{ p: '0 !important' }}>
            {/* Table Header */}
            <Box sx={{ display: { xs: 'none', md: 'grid' }, gridTemplateColumns: '1fr 140px 100px 100px 120px', gap: 2, p: 2, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Activity</Typography>
              <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Action</Typography>
              <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>User</Typography>
              <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>IP Address</Typography>
              <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Time</Typography>
            </Box>

            {/* Loading State */}
            {loading ? (
              <Box sx={{ p: 2 }}>
                {[1, 2, 3, 4, 5].map(i => (
                  <Box key={i} sx={{ display: { xs: 'block', md: 'grid' }, gridTemplateColumns: '1fr 140px 100px 100px 120px', gap: 2, py: 2, borderBottom: '1px solid #f1f5f9' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Skeleton variant="circular" width={36} height={36} />
                      <Box sx={{ flex: 1 }}>
                        <Skeleton variant="text" width="60%" height={20} />
                        <Skeleton variant="text" width="40%" height={16} />
                      </Box>
                    </Box>
                    <Skeleton variant="rounded" width={100} height={24} sx={{ borderRadius: '12px' }} />
                    <Skeleton variant="text" width="80%" height={20} />
                    <Skeleton variant="text" width="80%" height={20} />
                    <Skeleton variant="text" width="60%" height={20} />
                  </Box>
                ))}
              </Box>
            ) : logs.length === 0 ? (
              /* Empty State */
              <Box sx={{ py: 8, textAlign: 'center' }}>
                <Box sx={{ width: 64, height: 64, borderRadius: '16px', bgcolor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
                  <SearchOff sx={{ fontSize: 32, color: '#94a3b8' }} />
                </Box>
                <Typography sx={{ fontSize: '16px', fontWeight: 600, color: '#334155', mb: 0.5 }}>No audit entries found</Typography>
                <Typography sx={{ fontSize: '14px', color: '#64748b' }}>Try adjusting your filters or check back later</Typography>
              </Box>
            ) : (
              /* Log Entries */
              <Box>
                {logs.map((log, idx) => {
                  const style = getActionStyle(log.action || '');
                  return (
                    <Box
                      key={log.id || idx}
                      sx={{
                        display: { xs: 'flex', md: 'grid' },
                        flexDirection: { xs: 'column', md: 'row' },
                        gridTemplateColumns: '1fr 140px 100px 100px 120px',
                        gap: { xs: 1.5, md: 2 },
                        p: 2,
                        borderBottom: idx < logs.length - 1 ? '1px solid #f1f5f9' : 'none',
                        '&:hover': { bgcolor: '#f8fafc' },
                        transition: 'background-color 0.15s',
                      }}
                    >
                      {/* Activity */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ width: 36, height: 36, borderRadius: '10px', bgcolor: style.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: style.color }}>
                          {getActionIcon(log.action || '')}
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: '14px', fontWeight: 500, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {log.entity_type || 'Unknown Entity'}
                          </Typography>
                          <Typography sx={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {log.details || '-'}
                          </Typography>
                        </Box>
                      </Box>

                      {/* Action Chip */}
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Chip
                          icon={getActionIcon(log.action || '')}
                          label={(log.action || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          size="small"
                          sx={{
                            bgcolor: style.bg,
                            color: style.color,
                            border: `1px solid ${style.border}`,
                            fontWeight: 500,
                            fontSize: '11px',
                            '& .MuiChip-icon': { color: style.color },
                          }}
                        />
                      </Box>

                      {/* User */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Person sx={{ fontSize: 14, color: '#94a3b8' }} />
                        <Typography sx={{ fontSize: '13px', color: '#475569', fontFamily: 'monospace' }}>
                          {String(log.user_id || '').slice(0, 6) || '-'}
                        </Typography>
                      </Box>

                      {/* IP Address */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Computer sx={{ fontSize: 14, color: '#94a3b8' }} />
                        <Typography sx={{ fontSize: '13px', color: '#475569', fontFamily: 'monospace' }}>
                          {log.ip_address || '-'}
                        </Typography>
                      </Box>

                      {/* Time */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AccessTime sx={{ fontSize: 14, color: '#94a3b8' }} />
                        <Box>
                          <Typography sx={{ fontSize: '13px', color: '#475569' }}>{formatDate(log.timestamp)}</Typography>
                          <Typography sx={{ fontSize: '11px', color: '#94a3b8' }}>{formatTime(log.timestamp)}</Typography>
                        </Box>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Filter Modal */}
        <Dialog
          open={filterOpen}
          onClose={handleCloseFilter}
          PaperProps={{
            sx: {
              borderRadius: '16px',
              width: '100%',
              maxWidth: '400px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            },
          }}
        >
          {/* Header */}
          <Box sx={{ p: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>Filter Logs</Typography>
            <IconButton onClick={handleCloseFilter} size="small" sx={{ bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}>
              <Close sx={{ fontSize: 18, color: '#64748b' }} />
            </IconButton>
          </Box>

          {/* Content */}
          <Box sx={{ p: '24px' }}>
            {/* Action Type - Select */}
            <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#475569', mb: 1.5 }}>Action Type</Typography>
            <TextField
              select
              fullWidth
              size="small"
              value={tempActionFilter}
              onChange={e => setTempActionFilter(e.target.value)}
              sx={{
                mb: 3,
                '& .MuiOutlinedInput-root': {
                  borderRadius: '10px',
                  bgcolor: '#f8fafc',
                  '& fieldset': { borderColor: '#e2e8f0' },
                  '&:hover fieldset': { borderColor: '#cbd5e1' },
                  '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                },
              }}
            >
              {ACTION_TYPES.map(a => (
                <MenuItem key={a} value={a}>
                  {a === 'all' ? 'All Actions' : a.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </MenuItem>
              ))}
            </TextField>

            {/* Date Range */}
            <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#475569', mb: 1.5 }}>Date Range</Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <Box sx={{ flex: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  placeholder="Start date"
                  value={tempDateFrom}
                  onChange={e => setTempDateFrom(e.target.value)}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '10px',
                      bgcolor: '#f8fafc',
                      '& fieldset': { borderColor: '#e2e8f0' },
                      '&:hover fieldset': { borderColor: '#cbd5e1' },
                      '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                    },
                  }}
                />
              </Box>
              <Typography sx={{ color: '#94a3b8', fontSize: '13px' }}>to</Typography>
              <Box sx={{ flex: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  placeholder="End date"
                  value={tempDateTo}
                  onChange={e => setTempDateTo(e.target.value)}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '10px',
                      bgcolor: '#f8fafc',
                      '& fieldset': { borderColor: '#e2e8f0' },
                      '&:hover fieldset': { borderColor: '#cbd5e1' },
                      '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                    },
                  }}
                />
              </Box>
            </Box>
          </Box>

          {/* Footer */}
          <Box sx={{ p: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button
              onClick={() => {
                setTempActionFilter('all');
                setTempDateFrom('');
                setTempDateTo('');
              }}
              sx={{
                textTransform: 'none',
                color: '#64748b',
                fontSize: '14px',
                '&:hover': { bgcolor: 'transparent', color: '#ef4444' }
              }}
            >
              Clear all
            </Button>
            <Button
              variant="contained"
              onClick={handleApplyFilters}
              sx={{
                borderRadius: '10px',
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '14px',
                bgcolor: '#3b82f6',
                px: 4,
                py: 1,
                '&:hover': { bgcolor: '#2563eb' },
              }}
            >
              Apply Filters
            </Button>
          </Box>
        </Dialog>
      </Box>
    </Navigation>
  );
};

export default AdminAuditLog;
