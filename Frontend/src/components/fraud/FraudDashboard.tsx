import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Alert,
  Chip,
  LinearProgress,
  Tooltip,
  Skeleton,
  IconButton,
  Fade,
  Grow,
} from '@mui/material';
import {
  Security,
  Flag,
  CheckCircle,
  Visibility,
  Shield,
  ErrorOutline,
  Refresh,
  VerifiedUser,
  Warning,
} from '@mui/icons-material';
import Navigation from '../layout/sidebar';
import fraudDetectionService from '../../services/fraudDetectionService';

// Helper to get trust score color
const getTrustScoreColor = (score: number) => {
  if (score >= 80) return { bg: '#dcfce7', text: '#16a34a', label: 'High', icon: <VerifiedUser /> };
  if (score >= 60) return { bg: '#fef9c3', text: '#ca8a04', label: 'Medium', icon: <Warning /> };
  if (score >= 40) return { bg: '#fed7aa', text: '#ea580c', label: 'Low', icon: <ErrorOutline /> };
  return { bg: '#fecaca', text: '#dc2626', label: 'Critical', icon: <ErrorOutline /> };
};

// Helper to get flag severity
const getFlagSeverity = (count: number) => {
  if (count === 0) return { color: 'success' as const, label: 'Clean' };
  if (count <= 2) return { color: 'warning' as const, label: 'Minor' };
  if (count <= 5) return { color: 'error' as const, label: 'Major' };
  return { color: 'error' as const, label: 'Critical' };
};

// Helper to get relative time
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

// Circular Progress Component for Trust Score
const CircularTrustScore = ({ value, size = 120 }: { value: number; size?: number }) => {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  const color = getTrustScoreColor(value);

  return (
    <Box sx={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color.text}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
        }}
      >
        <Typography sx={{ fontSize: '28px', fontWeight: 700, color: color.text, lineHeight: 1 }}>
          {value}%
        </Typography>
        <Typography sx={{ fontSize: '11px', color: '#64748b', mt: '2px' }}>
          Trust Score
        </Typography>
      </Box>
    </Box>
  );
};

// Skeleton Loader for Stats Cards
const StatCardSkeleton = () => (
  <Card sx={{ borderRadius: '16px', border: '1px solid #e5e7eb' }}>
    <CardContent sx={{ padding: '20px !important' }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="text" width={80} height={20} />
          <Skeleton variant="text" width={60} height={40} sx={{ mt: 1 }} />
          <Skeleton variant="text" width={100} height={16} sx={{ mt: 1 }} />
        </Box>
        <Skeleton variant="rounded" width={48} height={48} sx={{ borderRadius: '12px' }} />
      </Box>
    </CardContent>
  </Card>
);

// Empty State Component
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
          background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
          animation: 'pulse 2s ease-in-out infinite',
          '@keyframes pulse': {
            '0%, 100%': { transform: 'scale(1)', opacity: 1 },
            '50%': { transform: 'scale(1.05)', opacity: 0.8 },
          },
        }}
      >
        <Shield sx={{ fontSize: 56, color: '#22c55e' }} />
      </Box>
      <Typography
        sx={{
          fontSize: '20px',
          fontWeight: 600,
          color: '#1e293b',
          mb: 1,
        }}
      >
        All Clear! No Flagged Interviews
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
        Great news! All analyzed interviews have passed our fraud detection checks.
        The system continuously monitors for suspicious activity.
      </Typography>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Chip
          icon={<CheckCircle sx={{ fontSize: '16px !important' }} />}
          label="Voice Analysis: Passed"
          sx={{
            backgroundColor: '#f0fdf4',
            color: '#16a34a',
            fontWeight: 500,
            fontSize: '12px',
          }}
        />
        <Chip
          icon={<CheckCircle sx={{ fontSize: '16px !important' }} />}
          label="Lip Sync: Verified"
          sx={{
            backgroundColor: '#f0fdf4',
            color: '#16a34a',
            fontWeight: 500,
            fontSize: '12px',
          }}
        />
        <Chip
          icon={<CheckCircle sx={{ fontSize: '16px !important' }} />}
          label="Movement: Normal"
          sx={{
            backgroundColor: '#f0fdf4',
            color: '#16a34a',
            fontWeight: 500,
            fontSize: '12px',
          }}
        />
      </Box>
    </Box>
  </Fade>
);

const FraudDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [flagged, setFlagged] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [statsData, flaggedData] = await Promise.all([
        fraudDetectionService.getDashboardStats(),
        fraudDetectionService.getFlaggedInterviews(),
      ]);
      setStats(statsData);
      setFlagged(flaggedData.flagged_interviews || []);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const statCards = stats
    ? [
        {
          label: 'Total Analyzed',
          value: stats.analyzed_count || 0,
          icon: <Security />,
          color: '#3b82f6',
          bgColor: '#eff6ff',
          trend: '+12%',
          trendUp: true,
          description: 'Interviews processed',
        },
        {
          label: 'Flagged',
          value: stats.flagged_count || 0,
          icon: <Flag />,
          color: '#ef4444',
          bgColor: '#fef2f2',
          trend: stats.flagged_count > 0 ? '+' + stats.flagged_count : '0',
          trendUp: false,
          description: 'Require attention',
        },
        {
          label: 'Cleared',
          value: stats.cleared_count || 0,
          icon: <CheckCircle />,
          color: '#22c55e',
          bgColor: '#f0fdf4',
          trend: '+' + (stats.cleared_count || 0),
          trendUp: true,
          description: 'Passed all checks',
        },
      ]
    : [];

  return (
    <Navigation>
      <Box
        sx={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #F8F9FB 0%, #EEF2F6 100%)',
          padding: { xs: '12px', sm: '16px', md: '24px' },
        }}
      >
        {/* Page Header */}
        <Box sx={{ mb: { xs: '16px', md: '24px' }, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'flex-start' }, justifyContent: 'space-between', gap: { xs: '12px', sm: 0 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: '10px', md: '14px' } }}>
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(239, 68, 68, 0.3)',
              }}
            >
              <Shield sx={{ color: '#fff', fontSize: '26px' }} />
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
                Fraud Detection
              </Typography>
              <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
                Real-time interview integrity monitoring
              </Typography>
            </Box>
          </Box>
          <Tooltip title="Refresh data" arrow>
            <IconButton
              onClick={() => fetchData(true)}
              disabled={refreshing}
              sx={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                width: 42,
                height: 42,
                transition: 'all 0.2s ease',
                '&:hover': {
                  backgroundColor: '#f8fafc',
                  borderColor: '#d1d5db',
                },
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
        </Box>

        {error && (
          <Alert
            severity="error"
            sx={{
              mb: 3,
              borderRadius: '12px',
              border: '1px solid #fecaca',
              '& .MuiAlert-icon': { alignItems: 'center' },
            }}
            action={
              <Button color="inherit" size="small" onClick={() => fetchData()}>
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {loading ? (
          <>
            {/* Loading Skeletons */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' },
                gap: '20px',
                mb: '28px',
              }}
            >
              {[1, 2, 3, 4].map((i) => (
                <StatCardSkeleton key={i} />
              ))}
            </Box>
            <Card sx={{ borderRadius: '16px', border: '1px solid #e5e7eb', p: 3 }}>
              <Skeleton variant="text" width={200} height={28} sx={{ mb: 2 }} />
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} variant="rounded" height={60} sx={{ mb: 1, borderRadius: '8px' }} />
              ))}
            </Card>
          </>
        ) : (
          <>
            {/* Stats Cards with Trust Score Gauge */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr 1.3fr' },
                gap: '20px',
                mb: '28px',
              }}
            >
              {statCards.map((card, index) => (
                <Grow in key={card.label} timeout={300 + index * 100}>
                  <Card
                    sx={{
                      borderRadius: '16px',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)',
                      transition: 'all 0.25s ease',
                      cursor: 'default',
                      '&:hover': {
                        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.1)',
                        transform: 'translateY(-4px)',
                        borderColor: card.color,
                      },
                    }}
                  >
                    <CardContent sx={{ padding: '22px !important' }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <Box>
                          <Typography
                            sx={{
                              fontSize: '12px',
                              fontWeight: 600,
                              color: '#64748b',
                              mb: '6px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.8px',
                            }}
                          >
                            {card.label}
                          </Typography>
                          <Typography
                            sx={{
                              fontSize: '36px',
                              fontWeight: 700,
                              color: '#1e293b',
                              lineHeight: 1,
                              mb: '4px',
                            }}
                          >
                            {card.value}
                          </Typography>
                          <Typography sx={{ fontSize: '12px', color: '#94a3b8' }}>
                            {card.description}
                          </Typography>
                        </Box>
                        <Box
                          sx={{
                            width: 52,
                            height: 52,
                            borderRadius: '14px',
                            backgroundColor: card.bgColor,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'transform 0.2s ease',
                            '& svg': {
                              fontSize: '26px',
                              color: card.color,
                            },
                          }}
                        >
                          {card.icon}
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                </Grow>
              ))}

              {/* Trust Score Gauge Card */}
              <Grow in timeout={600}>
                <Card
                  sx={{
                    borderRadius: '16px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)',
                    background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                    transition: 'all 0.25s ease',
                    '&:hover': {
                      boxShadow: '0 12px 32px rgba(245, 158, 11, 0.15)',
                      transform: 'translateY(-4px)',
                    },
                  }}
                >
                  <CardContent sx={{ padding: '22px !important' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <CircularTrustScore value={Math.round(stats?.average_trust_score || 0)} size={100} />
                      <Box>
                        <Typography
                          sx={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#92400e',
                            textTransform: 'uppercase',
                            letterSpacing: '0.8px',
                            mb: '4px',
                          }}
                        >
                          Average Trust
                        </Typography>
                        <Chip
                          label={getTrustScoreColor(stats?.average_trust_score || 0).label}
                          size="small"
                          sx={{
                            backgroundColor: '#fff',
                            color: getTrustScoreColor(stats?.average_trust_score || 0).text,
                            fontWeight: 600,
                            fontSize: '11px',
                            mb: 1,
                          }}
                        />
                        <Typography sx={{ fontSize: '11px', color: '#92400e', opacity: 0.8 }}>
                          Across all interviews
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grow>
            </Box>

            {/* Flagged Interviews Section */}
            <Card
              sx={{
                borderRadius: '16px',
                border: '1px solid #e5e7eb',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)',
                overflow: 'hidden',
              }}
            >
              {/* Table Header */}
              <Box
                sx={{
                  padding: { xs: '14px 16px', md: '18px 24px' },
                  borderBottom: '1px solid #e5e7eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: { xs: '12px', md: 0 },
                  background: 'linear-gradient(180deg, #fff 0%, #fafbfc 100%)',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: '10px',
                      backgroundColor: flagged.length > 0 ? '#fef2f2' : '#f0fdf4',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {flagged.length > 0 ? (
                      <ErrorOutline sx={{ color: '#ef4444', fontSize: '20px' }} />
                    ) : (
                      <CheckCircle sx={{ color: '#22c55e', fontSize: '20px' }} />
                    )}
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>
                      {flagged.length > 0 ? 'Flagged Interviews' : 'Interview Status'}
                    </Typography>
                    <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
                      {flagged.length > 0
                        ? `${flagged.length} interview${flagged.length > 1 ? 's' : ''} require attention`
                        : 'All interviews passed verification'}
                    </Typography>
                  </Box>
                </Box>
                {flagged.length > 0 && (
                  <Chip
                    icon={<Flag sx={{ fontSize: '14px !important' }} />}
                    label={`${flagged.length} Flagged`}
                    size="small"
                    sx={{
                      backgroundColor: '#fef2f2',
                      color: '#ef4444',
                      fontWeight: 600,
                      fontSize: '12px',
                      animation: 'pulse 2s ease-in-out infinite',
                      '@keyframes pulse': {
                        '0%, 100%': { opacity: 1 },
                        '50%': { opacity: 0.7 },
                      },
                    }}
                  />
                )}
              </Box>

              {flagged.length === 0 ? (
                <EmptyState />
              ) : (
                <TableContainer sx={{ overflowX: 'auto' }}>
                  <Table sx={{ minWidth: { xs: 700, md: 'auto' } }}>
                    <TableHead>
                      <TableRow sx={{ backgroundColor: '#f8fafc' }}>
                        {['Interview', 'Candidate', 'Trust Score', 'Flags', 'Analyzed', 'Action'].map(
                          (header, idx) => (
                            <TableCell
                              key={header}
                              sx={{
                                fontWeight: 600,
                                color: '#475569',
                                fontSize: '12px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                borderBottom: '2px solid #e5e7eb',
                                padding: idx === 0 ? '14px 20px' : '14px 16px',
                                textAlign: header === 'Action' ? 'center' : 'left',
                              }}
                            >
                              {header}
                            </TableCell>
                          )
                        )}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {flagged.map((row, index) => {
                        const trustColor = getTrustScoreColor(row.overall_trust_score || 0);
                        const flagSeverity = getFlagSeverity(row.flag_count || 0);

                        return (
                          <Fade in key={row.fraud_analysis_id} timeout={300 + index * 50}>
                            <TableRow
                              sx={{
                                backgroundColor: index % 2 === 0 ? '#fff' : '#fafbfc',
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                  backgroundColor: '#f1f5f9',
                                  transform: 'scale(1.002)',
                                  '& .action-btn': {
                                    transform: 'translateX(4px)',
                                  },
                                },
                              }}
                            >
                              <TableCell sx={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <Box
                                    sx={{
                                      width: 8,
                                      height: 8,
                                      borderRadius: '50%',
                                      backgroundColor: trustColor.text,
                                    }}
                                  />
                                  <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                                    #{row.fraud_analysis_id}
                                  </Typography>
                                </Box>
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid #f1f5f9' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <Box
                                    sx={{
                                      width: 38,
                                      height: 38,
                                      borderRadius: '10px',
                                      background: `linear-gradient(135deg, ${trustColor.text}20 0%, ${trustColor.text}40 100%)`,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: trustColor.text,
                                      fontSize: '15px',
                                      fontWeight: 600,
                                      border: `2px solid ${trustColor.text}30`,
                                    }}
                                  >
                                    {(row.candidate_name || 'N')[0].toUpperCase()}
                                  </Box>
                                  <Box>
                                    <Typography sx={{ fontSize: '14px', fontWeight: 500, color: '#1e293b' }}>
                                      {row.candidate_name || 'N/A'}
                                    </Typography>
                                    {row.job_title && (
                                      <Typography sx={{ fontSize: '12px', color: '#94a3b8' }}>
                                        {row.job_title}
                                      </Typography>
                                    )}
                                  </Box>
                                </Box>
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid #f1f5f9' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <Box sx={{ width: 90 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: '4px' }}>
                                      <Typography sx={{ fontSize: '15px', fontWeight: 700, color: trustColor.text }}>
                                        {row.overall_trust_score || 0}%
                                      </Typography>
                                    </Box>
                                    <LinearProgress
                                      variant="determinate"
                                      value={row.overall_trust_score || 0}
                                      sx={{
                                        height: 6,
                                        borderRadius: 3,
                                        backgroundColor: `${trustColor.text}20`,
                                        '& .MuiLinearProgress-bar': {
                                          backgroundColor: trustColor.text,
                                          borderRadius: 3,
                                          transition: 'transform 0.8s ease',
                                        },
                                      }}
                                    />
                                  </Box>
                                  <Chip
                                    label={trustColor.label}
                                    size="small"
                                    sx={{
                                      backgroundColor: trustColor.bg,
                                      color: trustColor.text,
                                      fontWeight: 600,
                                      fontSize: '11px',
                                      height: '24px',
                                      border: `1px solid ${trustColor.text}30`,
                                    }}
                                  />
                                </Box>
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid #f1f5f9' }}>
                                <Chip
                                  icon={<Flag sx={{ fontSize: '14px !important' }} />}
                                  label={`${row.flag_count || 0} ${flagSeverity.label}`}
                                  color={flagSeverity.color}
                                  size="small"
                                  variant="filled"
                                  sx={{ fontWeight: 600, fontSize: '12px' }}
                                />
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid #f1f5f9' }}>
                                <Tooltip
                                  title={
                                    row.analyzed_at
                                      ? new Date(row.analyzed_at).toLocaleString()
                                      : 'N/A'
                                  }
                                  arrow
                                >
                                  <Typography sx={{ fontSize: '13px', color: '#64748b', cursor: 'help' }}>
                                    {row.analyzed_at ? getRelativeTime(row.analyzed_at) : 'N/A'}
                                  </Typography>
                                </Tooltip>
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                                <Button
                                  className="action-btn"
                                  variant="contained"
                                  size="small"
                                  href={`/fraud-analysis/${row.video_interview_id}`}
                                  sx={{
                                    background:"none",
                                    boxShadow:"none"
                                  }}
                                  startIcon={<Visibility sx={{ fontSize: '16px',color:"grey" }} />}
                                >
                                </Button>
                              </TableCell>
                            </TableRow>
                          </Fade>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Card>
          </>
        )}
      </Box>
    </Navigation>
  );
};

export default FraudDashboard;
