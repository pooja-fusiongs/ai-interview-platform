import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Alert,
  IconButton,
  Tooltip,
  Fade,
  Grow,
  Skeleton,
  Chip,
  LinearProgress,
} from '@mui/material';
import {
  Assessment,
  Refresh,
  Calculate,
  Speed,
  ThumbUp,
  ThumbDown,
  HelpOutline,
  TrendingUp,
  TrendingDown,
  Remove,
  EmojiEvents,
  Groups,
  CheckCircleOutline,
  BarChart,
} from '@mui/icons-material';
import Navigation from '../layout/Sidebar';
import feedbackService from '../../services/feedbackService';

interface DashboardData {
  prediction_accuracy: number;
  correlation: number;
  total_hires_tracked: number;
  success_rate: number;
  by_recommendation: {
    strong_hire: { count: number; avg_performance: number };
    hire: { count: number; avg_performance: number };
    no_hire: { count: number; avg_performance: number };
  };
}

// Simple Progress Bar with Label
const ProgressWithLabel: React.FC<{
  value: number;
  maxValue: number;
  color: string;
  showPercentage?: boolean;
}> = ({ value, maxValue, color, showPercentage = true }) => {
  const percentage = Math.min((value / maxValue) * 100, 100);
  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
        <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#1e293b' }}>
          {value.toFixed(maxValue === 1 ? 2 : 0)}{showPercentage && maxValue === 100 ? '%' : ''}
        </Typography>
        {showPercentage && maxValue === 100 && (
          <Typography sx={{ fontSize: '14px', color: '#94a3b8', alignSelf: 'flex-end' }}>
            of 100%
          </Typography>
        )}
      </Box>
      <LinearProgress
        variant="determinate"
        value={percentage}
        sx={{
          height: 10,
          borderRadius: 5,
          backgroundColor: '#e2e8f0',
          '& .MuiLinearProgress-bar': {
            backgroundColor: color,
            borderRadius: 5,
          },
        }}
      />
    </Box>
  );
};

// Info Tooltip Component
const InfoTooltip: React.FC<{ title: string }> = ({ title }) => (
  <Tooltip title={title} arrow placement="top">
    <HelpOutline sx={{ fontSize: 16, color: '#94a3b8', cursor: 'help', ml: 0.5 }} />
  </Tooltip>
);

// Trend Indicator
const TrendIndicator: React.FC<{ value: number; threshold?: number }> = ({ value, threshold = 50 }) => {
  if (value >= threshold + 10) {
    return (
      <Chip
        icon={<TrendingUp sx={{ fontSize: 16 }} />}
        label="Good"
        size="small"
        sx={{
          backgroundColor: '#dcfce7',
          color: '#16a34a',
          fontWeight: 600,
          fontSize: '12px',
          height: 24,
          '& .MuiChip-icon': { color: '#16a34a' },
        }}
      />
    );
  } else if (value >= threshold - 10) {
    return (
      <Chip
        icon={<Remove sx={{ fontSize: 16 }} />}
        label="Average"
        size="small"
        sx={{
          backgroundColor: '#fef3c7',
          color: '#020291',
          fontWeight: 600,
          fontSize: '12px',
          height: 24,
          '& .MuiChip-icon': { color: '#020291' },
        }}
      />
    );
  }
  return (
    <Chip
      icon={<TrendingDown sx={{ fontSize: 16 }} />}
      label="Needs Attention"
      size="small"
      sx={{
        backgroundColor: '#fee2e2',
        color: '#dc2626',
        fontWeight: 600,
        fontSize: '12px',
        height: 24,
        '& .MuiChip-icon': { color: '#dc2626' },
      }}
    />
  );
};

const QualityDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recomputing, setRecomputing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await feedbackService.getQualityDashboard();
      setData(result);
      setError('');
    } catch {
      setError('Failed to load quality dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      await feedbackService.computeMetrics();
      await fetchDashboard();
    } catch {
      setError('Recompute failed');
    } finally {
      setRecomputing(false);
    }
  };

  // Skeleton Components
  const StatCardSkeleton = () => (
    <Card sx={{ borderRadius: '16px', border: '1px solid #e5e7eb', boxShadow: 'none', height: '100%' }}>
      <CardContent sx={{ p: '24px !important' }}>
        <Skeleton variant="rounded" width={48} height={48} sx={{ mb: 2, borderRadius: '12px' }} />
        <Skeleton variant="text" width="60%" height={32} sx={{ mb: 1 }} />
        <Skeleton variant="rounded" height={10} sx={{ mb: 2 }} />
        <Skeleton variant="text" width="80%" />
      </CardContent>
    </Card>
  );

  const RecommendationSkeleton = () => (
    <Card sx={{ borderRadius: '16px', border: '1px solid #e5e7eb', boxShadow: 'none' }}>
      <CardContent sx={{ p: '24px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <Skeleton variant="rounded" width={48} height={48} sx={{ borderRadius: '12px' }} />
          <Skeleton variant="text" width={100} height={28} />
        </Box>
        <Skeleton variant="text" width={80} height={48} sx={{ mb: 1 }} />
        <Skeleton variant="rounded" height={10} sx={{ mb: 2 }} />
        <Skeleton variant="text" width={120} />
      </CardContent>
    </Card>
  );

  // Empty State
  const EmptyState = () => (
    <Fade in timeout={500}>
      <Box sx={{ textAlign: 'center', py: 8, px: 4 }}>
        <Box
          sx={{
            width: 120,
            height: 120,
            borderRadius: '24px',
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
          }}
        >
          <BarChart sx={{ fontSize: 56, color: '#3b82f6' }} />
        </Box>
        <Typography sx={{ fontSize: '22px', fontWeight: 700, color: '#1e293b', mb: 1 }}>
          No Data Yet
        </Typography>
        <Typography sx={{ fontSize: '15px', color: '#64748b', maxWidth: 420, margin: '0 auto 32px', lineHeight: 1.7 }}>
          Start tracking your hiring quality by adding post-hire feedback. Once you have enough data, we'll show you insights about your hiring decisions.
        </Typography>
        <Button
          variant="contained"
          startIcon={<Calculate />}
          onClick={handleRecompute}
          disabled={recomputing}
          sx={{
            borderRadius: '12px',
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '15px',
            padding: '14px 28px',
            background: '#3b82f6',
            boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
            '&:hover': {
              background: '#2563eb',
              boxShadow: '0 6px 20px rgba(59, 130, 246, 0.5)',
            },
          }}
        >
          {recomputing ? 'Computing...' : 'Compute Metrics'}
        </Button>
      </Box>
    </Fade>
  );

  const getRecommendationConfig = (label: string) => {
    switch (label) {
      case 'Strong Hire':
        return {
          color: '#16a34a',
          bgColor: '#f0fdf4',
          lightBg: '#dcfce7',
          icon: <EmojiEvents sx={{ fontSize: 24 }} />,
          description: 'Candidates rated as exceptional performers',
        };
      case 'Hire':
        return {
          color: '#2563eb',
          bgColor: '#eff6ff',
          lightBg: '#dbeafe',
          icon: <ThumbUp sx={{ fontSize: 24 }} />,
          description: 'Candidates recommended for hiring',
        };
      case 'No Hire':
        return {
          color: '#dc2626',
          bgColor: '#fef2f2',
          lightBg: '#fee2e2',
          icon: <ThumbDown sx={{ fontSize: 24 }} />,
          description: 'Candidates not recommended',
        };
      default:
        return {
          color: '#64748b',
          bgColor: '#f8fafc',
          lightBg: '#f1f5f9',
          icon: <Remove sx={{ fontSize: 24 }} />,
          description: '',
        };
    }
  };

  const getPerformanceLabel = (score: number) => {
    if (score >= 8) return { label: 'Excellent', color: '#16a34a' };
    if (score >= 6) return { label: 'Good', color: '#2563eb' };
    if (score >= 4) return { label: 'Fair', color: '#020291' };
    return { label: 'Poor', color: '#dc2626' };
  };

  return (
    <Navigation>
      <Box
        sx={{
          minHeight: '100vh',
          background: '#f8fafc',
          padding: { xs: '16px', sm: '24px', md: '32px' },
        }}
      >
        {/* Page Header */}
        <Fade in timeout={300}>
          <Box sx={{ mb: '32px' }}>
        

            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
              <Box>
                <Typography
                  sx={{
                    fontSize: { xs: '24px', md: '28px' },
                    fontWeight: 700,
                    color: '#0f172a',
                    mb: 0.5,
                  }}
                >
                  Hiring Quality Dashboard
                </Typography>
                <Typography sx={{ fontSize: '15px', color: '#64748b', maxWidth: 500 }}>
                  Track how well your interview predictions match actual job performance
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', gap: '12px' }}>
                <Tooltip title="Refresh data" arrow>
                  <IconButton
                    onClick={() => fetchDashboard(true)}
                    disabled={refreshing}
                    sx={{
                      backgroundColor: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      width: 44,
                      height: 44,
                      '&:hover': { backgroundColor: '#f8fafc', borderColor: '#cbd5e1' },
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
                  startIcon={
                    recomputing ? (
                      <Box
                        sx={{
                          width: 18,
                          height: 18,
                          border: '2px solid rgba(255,255,255,0.3)',
                          borderTopColor: '#fff',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite',
                        }}
                      />
                    ) : (
                      <Calculate />
                    )
                  }
                  onClick={handleRecompute}
                  disabled={recomputing}
                   sx={{
                background: 'rgba(2, 2, 145, 0.1)',
                color: '#ffffff',
                border: '2px solid #020291',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 600,
                textTransform: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                minWidth: '120px',
                '&:hover': {
                  background: 'rgba(2, 2, 145, 0.1)',
                  borderColor: '#020291',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 8px 25px rgba(99, 102, 241, 0.25)'
                }
              }}
                >
                  {recomputing ? 'Computing...' : 'Recompute'}
                </Button>
              </Box>
            </Box>
          </Box>
        </Fade>

        {error && (
          <Alert
            severity="error"
            sx={{ mb: 3, borderRadius: '12px' }}
            onClose={() => setError('')}
          >
            {error}
          </Alert>
        )}

        {loading ? (
          <>
            {/* Stats Skeleton */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
                gap: '20px',
                mb: '32px',
              }}
            >
              {[1, 2, 3, 4].map((i) => (
                <StatCardSkeleton key={i} />
              ))}
            </Box>
            {/* Recommendation Skeleton */}
            <Skeleton variant="text" width={220} height={32} sx={{ mb: 2 }} />
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
                gap: '20px',
              }}
            >
              {[1, 2, 3].map((i) => (
                <RecommendationSkeleton key={i} />
              ))}
            </Box>
          </>
        ) : !data ? (
          <Card sx={{ borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <EmptyState />
          </Card>
        ) : (
          <>
      

            {/* Main Stats Cards */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
                gap: '20px',
                mb: '40px',
              }}
            >
              {/* Prediction Accuracy */}
              <Grow in timeout={300}>
                <Card
                  sx={{
                    borderRadius: '16px',
                    border: '1px solid #e2e8f0',
                    boxShadow: 'none',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      borderColor: '#3b82f6',
                      boxShadow: '0 4px 20px rgba(59, 130, 246, 0.1)',
                    },
                  }}
                >
                  <CardContent sx={{ p: '24px !important' }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
                      <Box
                        sx={{
                          width: 48,
                          height: 48,
                          borderRadius: '12px',
                          backgroundColor: '#eff6ff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Speed sx={{ color: '#3b82f6', fontSize: 24 }} />
                      </Box>
                      <TrendIndicator value={data.prediction_accuracy ?? 0} threshold={70} />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Typography sx={{ fontSize: '13px', fontWeight: 500, color: '#64748b' }}>
                        Prediction Accuracy
                      </Typography>
                      <InfoTooltip title="How often your interview recommendations correctly predict actual job performance" />
                    </Box>
                    <ProgressWithLabel value={data.prediction_accuracy ?? 0} maxValue={100} color="#3b82f6" />
                  </CardContent>
                </Card>
              </Grow>

              {/* Correlation */}
              <Grow in timeout={400}>
                <Card
                  sx={{
                    borderRadius: '16px',
                    border: '1px solid #e2e8f0',
                    boxShadow: 'none',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      borderColor: '#16a34a',
                      boxShadow: '0 4px 20px rgba(22, 163, 74, 0.1)',
                    },
                  }}
                >
                  <CardContent sx={{ p: '24px !important' }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
                      <Box
                        sx={{
                          width: 48,
                          height: 48,
                          borderRadius: '12px',
                          backgroundColor: '#f0fdf4',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Assessment sx={{ color: '#16a34a', fontSize: 24 }} />
                      </Box>
                      <TrendIndicator value={Math.abs(data.correlation ?? 0) * 100} threshold={50} />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Typography sx={{ fontSize: '13px', fontWeight: 500, color: '#64748b' }}>
                        Score Correlation
                      </Typography>
                      <InfoTooltip title="Statistical relationship between interview scores and actual performance (-1 to 1, higher is better)" />
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', mb: 1 }}>
                        {(data.correlation ?? 0).toFixed(2)}
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={Math.abs(data.correlation ?? 0) * 100}
                        sx={{
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: '#e2e8f0',
                          '& .MuiLinearProgress-bar': {
                            backgroundColor: '#16a34a',
                            borderRadius: 5,
                          },
                        }}
                      />
                      <Typography sx={{ fontSize: '12px', color: '#94a3b8', mt: 1 }}>
                        Range: -1.0 to 1.0
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grow>

              {/* Hires Tracked */}
              <Grow in timeout={500}>
                <Card
                  sx={{
                    borderRadius: '16px',
                    border: '1px solid #e2e8f0',
                    boxShadow: 'none',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      borderColor: '#020291',
                      boxShadow: '0 4px 20px rgba(2, 2, 145, 0.1)',
                    },
                  }}
                >
                  <CardContent sx={{ p: '24px !important' }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
                      <Box
                        sx={{
                          width: 48,
                          height: 48,
                          borderRadius: '12px',
                          backgroundColor: '#EEF0FF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Groups sx={{ color: '#020291', fontSize: 24 }} />
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Typography sx={{ fontSize: '13px', fontWeight: 500, color: '#64748b' }}>
                        Hires Tracked
                      </Typography>
                      <InfoTooltip title="Total number of employees with post-hire feedback data" />
                    </Box>
                    <Typography sx={{ fontSize: '36px', fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>
                      {data.total_hires_tracked ?? 0}
                    </Typography>
                    <Typography sx={{ fontSize: '13px', color: '#64748b', mt: 1 }}>
                      employees in analysis
                    </Typography>
                  </CardContent>
                </Card>
              </Grow>

              {/* Success Rate */}
              <Grow in timeout={600}>
                <Card
                  sx={{
                    borderRadius: '16px',
                    border: '1px solid #e2e8f0',
                    boxShadow: 'none',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      borderColor: '#8b5cf6',
                      boxShadow: '0 4px 20px rgba(139, 92, 246, 0.1)',
                    },
                  }}
                >
                  <CardContent sx={{ p: '24px !important' }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
                      <Box
                        sx={{
                          width: 48,
                          height: 48,
                          borderRadius: '12px',
                          backgroundColor: '#f3e8ff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <CheckCircleOutline sx={{ color: '#8b5cf6', fontSize: 24 }} />
                      </Box>
                      <TrendIndicator value={data.success_rate ?? 0} threshold={70} />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Typography sx={{ fontSize: '13px', fontWeight: 500, color: '#64748b' }}>
                        Success Rate
                      </Typography>
                      <InfoTooltip title="Percentage of hired candidates who met or exceeded performance expectations" />
                    </Box>
                    <ProgressWithLabel value={data.success_rate ?? 0} maxValue={100} color="#8b5cf6" />
                  </CardContent>
                </Card>
              </Grow>
            </Box>

            {/* Performance by Recommendation Section */}
            <Box sx={{ mb: '20px' }}>
              <Typography sx={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', mb: 0.5 }}>
                Performance by Recommendation
              </Typography>
              <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
                See how candidates performed based on their interview recommendation
              </Typography>
            </Box>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
                gap: '20px',
              }}
            >
              {[
                { label: 'Strong Hire', data: data.by_recommendation?.strong_hire },
                { label: 'Hire', data: data.by_recommendation?.hire },
                { label: 'No Hire', data: data.by_recommendation?.no_hire },
              ].map((item, index) => {
                const config = getRecommendationConfig(item.label);
                const avgPerformance = item.data?.avg_performance ?? 0;
                const count = item.data?.count ?? 0;
                const perfLabel = getPerformanceLabel(avgPerformance);

                return (
                  <Grow in timeout={400 + index * 100} key={item.label}>
                    <Card
                      sx={{
                        borderRadius: '16px',
                        border: '1px solid #e2e8f0',
                        boxShadow: 'none',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          borderColor: config.color,
                          boxShadow: `0 4px 20px ${config.color}15`,
                        },
                      }}
                    >
                      <CardContent sx={{ p: '24px !important' }}>
                        {/* Header */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                          <Box
                            sx={{
                              width: 48,
                              height: 48,
                              borderRadius: '12px',
                              backgroundColor: config.lightBg,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: config.color,
                            }}
                          >
                            {config.icon}
                          </Box>
                          <Box>
                            <Typography sx={{ fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>
                              {item.label}
                            </Typography>
                            <Typography sx={{ fontSize: '12px', color: '#94a3b8' }}>
                              {count} candidate{count !== 1 ? 's' : ''}
                            </Typography>
                          </Box>
                        </Box>

                        {/* Performance Score */}
                        <Box sx={{ mb: 3 }}>
                          <Typography sx={{ fontSize: '12px', color: '#64748b', mb: 1, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Avg. Performance
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                            <Typography sx={{ fontSize: '40px', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
                              {avgPerformance.toFixed(1)}
                            </Typography>
                            <Typography sx={{ fontSize: '16px', color: '#94a3b8' }}>/ 10</Typography>
                            <Chip
                              label={perfLabel.label}
                              size="small"
                              sx={{
                                ml: 1,
                                backgroundColor: `${perfLabel.color}15`,
                                color: perfLabel.color,
                                fontWeight: 600,
                                fontSize: '11px',
                                height: 22,
                              }}
                            />
                          </Box>
                        </Box>

                        {/* Progress Bar */}
                        <Box sx={{ mb: 2 }}>
                          <LinearProgress
                            variant="determinate"
                            value={(avgPerformance / 10) * 100}
                            sx={{
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: '#e2e8f0',
                              '& .MuiLinearProgress-bar': {
                                backgroundColor: config.color,
                                borderRadius: 4,
                              },
                            }}
                          />
                        </Box>

                        {/* Description */}
                        <Typography sx={{ fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
                          {config.description}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grow>
                );
              })}
            </Box>

         
          </>
        )}
      </Box>
    </Navigation>
  );
};

export default QualityDashboard;
