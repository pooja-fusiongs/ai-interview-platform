import React, { useEffect, useState, useRef } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Fade,
  Grow,
  Skeleton,
} from '@mui/material';
import {
  Warning,
  CheckCircle,
  Error,
  Refresh,
  FiberManualRecord,
  GraphicEq,
  RecordVoiceOver,
  Accessibility,
  Timeline,
  MonitorHeart,
  Circle,
} from '@mui/icons-material';
import Navigation from '../layout/Sidebar';

interface LiveFlag {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  timestamp: string;
  metric: string;
  value: number;
  threshold: number;
}

interface MonitorSession {
  videoInterviewId: number;
  candidateName: string;
  trustScore: number;
  flags: LiveFlag[];
  status: 'monitoring' | 'completed' | 'flagged';
  voiceScore: number;
  lipSyncScore: number;
  bodyScore: number;
}

const severityConfig = {
  high: { color: '#ef4444', bg: '#fef2f2', label: 'High' },
  medium: { color: '#f59e0b', bg: '#fffbeb', label: 'Medium' },
  low: { color: '#3b82f6', bg: '#eff6ff', label: 'Low' },
};

const getScoreColor = (score: number) => {
  if (score >= 80) return { color: '#22c55e', bg: '#f0fdf4', label: 'Good' };
  if (score >= 60) return { color: '#f59e0b', bg: '#fffbeb', label: 'Fair' };
  return { color: '#ef4444', bg: '#fef2f2', label: 'Poor' };
};

const statusConfig = {
  flagged: { icon: <Error />, color: '#ef4444', bg: '#fef2f2', label: 'Flagged' },
  completed: { icon: <CheckCircle />, color: '#22c55e', bg: '#f0fdf4', label: 'Completed' },
  monitoring: { icon: <FiberManualRecord />, color: '#22c55e', bg: '#f0fdf4', label: 'Live' },
};

const RealTimeFlagMonitor: React.FC = () => {
  const [sessions, setSessions] = useState<MonitorSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);   

  const generateSimulatedSession = (id: number): MonitorSession => {
    const names = ['Alice Johnson', 'Bob Smith', 'Carol Williams', 'David Brown', 'Eva Martinez'];
    const voiceScore = 60 + Math.random() * 35;
    const lipSyncScore = 55 + Math.random() * 40;
    const bodyScore = 50 + Math.random() * 45;
    const trustScore = Math.round(voiceScore * 0.35 + lipSyncScore * 0.35 + bodyScore * 0.30);
    const flags: LiveFlag[] = [];

    if (voiceScore < 70) {
      flags.push({
        id: `f-${id}-v`,
        type: 'voice_anomaly',
        severity: voiceScore < 60 ? 'high' : 'medium',
        message: 'Voice pattern inconsistency detected',
        timestamp: new Date().toISOString(),
        metric: 'voice_consistency',
        value: Math.round(voiceScore),
        threshold: 70,
      });
    }
    if (lipSyncScore < 65) {
      flags.push({
        id: `f-${id}-l`,
        type: 'lip_sync_mismatch',
        severity: lipSyncScore < 55 ? 'high' : 'medium',
        message: 'Lip-sync offset exceeds threshold',
        timestamp: new Date().toISOString(),
        metric: 'lip_sync_offset',
        value: Math.round(100 - lipSyncScore),
        threshold: 35,
      });
    }
    if (bodyScore < 60) {
      flags.push({
        id: `f-${id}-b`,
        type: 'body_movement',
        severity: 'low',
        message: 'Unusual body movement pattern',
        timestamp: new Date().toISOString(),
        metric: 'body_movement_score',
        value: Math.round(bodyScore),
        threshold: 60,
      });
    }

    return {
      videoInterviewId: id,
      candidateName: names[id % names.length],
      trustScore,
      flags,
      status: trustScore < 60 ? 'flagged' : 'monitoring',
      voiceScore: Math.round(voiceScore),
      lipSyncScore: Math.round(lipSyncScore),
      bodyScore: Math.round(bodyScore),
    };
  };

  const loadSessions = (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const simulated = Array.from({ length: 4 }, (_, i) => generateSimulatedSession(i + 1));
      setSessions(simulated);
      setLastUpdated(new Date());
      setError('');
    } catch (err: any) {
      setError('Failed to load monitoring data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadSessions();
    intervalRef.current = setInterval(() => loadSessions(), 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const totalFlags = sessions.reduce((sum, s) => sum + s.flags.length, 0);
  const activeSessions = sessions.filter((s) => s.status === 'monitoring').length;
  const flaggedSessions = sessions.filter((s) => s.status === 'flagged').length;

  // Score Bar Component
  const ScoreBar = ({
    label,
    value,
    icon,
  }: {
    label: string;
    value: number;
    icon: React.ReactNode;
  }) => {
    const scoreColor = getScoreColor(value);
    return (
      <Box sx={{ mb: '12px' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: '6px' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Box sx={{ color: '#64748b', display: 'flex', alignItems: 'center' }}>{icon}</Box>
            <Typography sx={{ fontSize: '13px', color: '#475569', fontWeight: 500 }}>{label}</Typography>
          </Box>
          <Typography sx={{ fontSize: '13px', fontWeight: 700, color: scoreColor.color }}>
            {value}%
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={value}
          sx={{
            height: 8,
            borderRadius: 4,
            backgroundColor: '#e5e7eb',
            '& .MuiLinearProgress-bar': {
              backgroundColor: scoreColor.color,
              borderRadius: 4,
              transition: 'transform 0.6s ease',
            },
          }}
        />
      </Box>
    );
  };

  // Session Card Skeleton
  const SessionCardSkeleton = () => (
    <Card sx={{ borderRadius: '16px', border: '1px solid #e5e7eb' }}>
      <CardContent sx={{ padding: '20px !important' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Skeleton variant="circular" width={44} height={44} />
            <Box>
              <Skeleton variant="text" width={120} height={24} />
              <Skeleton variant="text" width={80} height={18} />
            </Box>
          </Box>
          <Skeleton variant="rounded" width={80} height={32} sx={{ borderRadius: '8px' }} />
        </Box>
        {[1, 2, 3].map((i) => (
          <Box key={i} sx={{ mb: 1.5 }}>
            <Skeleton variant="text" width={100} height={18} />
            <Skeleton variant="rounded" height={8} sx={{ borderRadius: 4 }} />
          </Box>
        ))}
      </CardContent>
    </Card>
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
                background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(139, 92, 246, 0.3)',
                position: 'relative',
              }}
            >
              <MonitorHeart sx={{ color: '#fff', fontSize: '26px' }} />
              <Box
                sx={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  backgroundColor: '#22c55e',
                  border: '2px solid #fff',
                  animation: 'pulse 2s ease-in-out infinite',
                  '@keyframes pulse': {
                    '0%, 100%': { transform: 'scale(1)', opacity: 1 },
                    '50%': { transform: 'scale(1.2)', opacity: 0.8 },
                  },
                }}
              />
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
                Real-Time Monitor
              </Typography>
            </Box>
          </Box>
          <Tooltip title="Refresh data" arrow>
            <IconButton
              onClick={() => loadSessions(true)}
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
            }}
          >
            {error}
          </Alert>
        )}

        {/* Quick Stats */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
            gap: '16px',
            mb: '24px',
          }}
        >
          <Grow in={!loading} timeout={300}>
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
                  <Circle sx={{ color: '#22c55e', fontSize: '20px' }} />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>
                    {activeSessions}
                  </Typography>
                  <Typography sx={{ fontSize: '13px', color: '#64748b' }}>Active Sessions</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grow>

          <Grow in={!loading} timeout={400}>
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
                    backgroundColor: '#fef2f2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Error sx={{ color: '#ef4444', fontSize: '20px' }} />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>
                    {flaggedSessions}
                  </Typography>
                  <Typography sx={{ fontSize: '13px', color: '#64748b' }}>Flagged Sessions</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grow>

          <Grow in={!loading} timeout={500}>
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
                    backgroundColor: '#fffbeb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Warning sx={{ color: '#f59e0b', fontSize: '20px' }} />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>
                    {totalFlags}
                  </Typography>
                  <Typography sx={{ fontSize: '13px', color: '#64748b' }}>Total Flags</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grow>
        </Box>

        {loading ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '20px', mb: '24px' }}>
            {[1, 2, 3, 4].map((i) => (
              <SessionCardSkeleton key={i} />
            ))}
          </Box>
        ) : (
          <>
            {/* Live Sessions Grid */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '20px', mb: '28px' }}>
              {sessions.map((session, index) => {
                const status = statusConfig[session.status];
                const trustColor = getScoreColor(session.trustScore);

                return (
                  <Grow in key={session.videoInterviewId} timeout={300 + index * 100}>
                    <Card
                      sx={{
                        borderRadius: '16px',
                        border: session.status === 'flagged' ? '2px solid #ef4444' : '1px solid #e5e7eb',
                        boxShadow: session.status === 'flagged' ? '0 4px 20px rgba(239, 68, 68, 0.15)' : '0 4px 12px rgba(0, 0, 0, 0.04)',
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
                          padding: '16px 20px',
                          borderBottom: '1px solid #f1f5f9',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: session.status === 'flagged' ? '#fef2f2' : '#fafbfc',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Box
                            sx={{
                              width: 44,
                              height: 44,
                              borderRadius: '12px',
                              background: `linear-gradient(135deg, ${trustColor.color}20 0%, ${trustColor.color}40 100%)`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: trustColor.color,
                              fontSize: '16px',
                              fontWeight: 700,
                              border: `2px solid ${trustColor.color}40`,
                            }}
                          >
                            {session.candidateName[0]}
                          </Box>
                          <Box>
                            <Typography sx={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>
                              {session.candidateName}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Box
                                sx={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  backgroundColor: status.color,
                                  animation: session.status === 'monitoring' ? 'pulse 1.5s ease-in-out infinite' : 'none',
                                }}
                              />
                              <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                                {status.label} • Interview #{session.videoInterviewId}
                              </Typography>
                            </Box>
                          </Box>
                        </Box>
                        <Chip
                          label={`${session.trustScore}%`}
                          size="small"
                          sx={{
                            backgroundColor: trustColor.bg,
                            color: trustColor.color,
                            fontWeight: 700,
                            fontSize: '13px',
                            height: '28px',
                            border: `1px solid ${trustColor.color}30`,
                          }}
                        />
                      </Box>

                      <CardContent sx={{ padding: '20px !important' }}>
                        {/* Score Bars */}
                        <ScoreBar
                          label="Voice Consistency"
                          value={session.voiceScore}
                          icon={<RecordVoiceOver sx={{ fontSize: '16px' }} />}
                        />
                        <ScoreBar
                          label="Lip Sync"
                          value={session.lipSyncScore}
                          icon={<GraphicEq sx={{ fontSize: '16px' }} />}
                        />
                        <ScoreBar
                          label="Body Movement"
                          value={session.bodyScore}
                          icon={<Accessibility sx={{ fontSize: '16px' }} />}
                        />

                        {/* Flags */}
                        {session.flags.length > 0 && (
                          <Box
                            sx={{
                              mt: '16px',
                              pt: '16px',
                              borderTop: '1px solid #f1f5f9',
                            }}
                          >
                            <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', mb: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              Active Flags ({session.flags.length})
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                              {session.flags.map((flag) => {
                                const severity = severityConfig[flag.severity];
                                return (
                                  <Tooltip key={flag.id} title={`${flag.metric}: ${flag.value} / ${flag.threshold}`} arrow>
                                    <Chip
                                      icon={<Warning sx={{ fontSize: '14px !important' }} />}
                                      label={flag.message}
                                      size="small"
                                      sx={{
                                        backgroundColor: severity.bg,
                                        color: severity.color,
                                        border: `1px solid ${severity.color}30`,
                                        fontWeight: 500,
                                        fontSize: '11px',
                                        '& .MuiChip-icon': { color: severity.color },
                                      }}
                                    />
                                  </Tooltip>
                                );
                              })}
                            </Box>
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  </Grow>
                );
              })}
            </Box>

            {/* Flag Activity Log */}
            <Card
              sx={{
                borderRadius: '16px',
                border: '1px solid #e5e7eb',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)',
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  padding: '18px 24px',
                  borderBottom: '1px solid #e5e7eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'linear-gradient(180deg, #fff 0%, #fafbfc 100%)',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: '10px',
                      backgroundColor: '#f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Timeline sx={{ color: '#64748b', fontSize: '20px' }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>
                      Flag Activity Log
                    </Typography>
                    <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
                      Recent fraud detection alerts
                    </Typography>
                  </Box>
                </Box>
                <Chip
                  label={`${totalFlags} Flags`}
                  size="small"
                  sx={{
                    backgroundColor: totalFlags > 0 ? '#fffbeb' : '#f0fdf4',
                    color: totalFlags > 0 ? '#f59e0b' : '#22c55e',
                    fontWeight: 600,
                    fontSize: '12px',
                  }}
                />
              </Box>

              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f8fafc' }}>
                      {[
                        { label: 'Time', hide: false },
                        { label: 'Candidate', hide: '' },
                        { label: 'Flag Type', hide: '' },
                        { label: 'Severity', hide: '' },
                        { label: 'Metric', hide: 'md' },
                        { label: 'Value / Threshold', hide: 'md' },
                      ].map((header: { label: string; hide: string }) => (
                        <TableCell
                          key={header.label}
                          sx={{
                            fontWeight: 600,
                            color: '#475569',
                            fontSize: '12px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            borderBottom: '2px solid #e5e7eb',
                            padding: { xs: '10px 8px', md: '14px 16px' },
                            ...(header.hide && { display: { xs: 'none', [header.hide]: 'table-cell' } }),
                          }}
                        >
                          {header.label}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sessions
                      .flatMap((s) => s.flags.map((f) => ({ ...f, candidateName: s.candidateName })))
                      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                      .map((flag: any, index) => {
                        const severity = severityConfig[flag.severity as keyof typeof severityConfig];
                        return (
                          <Fade in key={flag.id} timeout={200 + index * 50}>
                            <TableRow
                              sx={{
                                backgroundColor: index % 2 === 0 ? '#fff' : '#fafbfc',
                                transition: 'all 0.2s ease',
                                '&:hover': { backgroundColor: '#f1f5f9' },
                              }}
                            >
                              <TableCell sx={{ borderBottom: '1px solid #f1f5f9', padding: { xs: '10px 8px', md: '14px 16px' } }}>
                                <Typography sx={{ fontSize: { xs: '12px', md: '13px' }, color: '#1e293b', fontWeight: 500 }}>
                                  {new Date(flag.timestamp).toLocaleTimeString()}
                                </Typography>
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid #f1f5f9', padding: { xs: '10px 8px', md: '16px' } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: '4px', md: '8px' } }}>
                                  <Box
                                    sx={{
                                      width: { xs: 22, md: 28 },
                                      height: { xs: 22, md: 28 },
                                      borderRadius: '6px',
                                      backgroundColor: '#f1f5f9',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: { xs: '10px', md: '12px' },
                                      fontWeight: 600,
                                      color: '#64748b',
                                      flexShrink: 0,
                                    }}
                                  >
                                    {flag.candidateName[0]}
                                  </Box>
                                  <Typography sx={{ fontSize: { xs: '12px', md: '13px' }, fontWeight: 500, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: { xs: '80px', sm: '120px', md: 'none' } }}>
                                    {flag.candidateName}
                                  </Typography>
                                </Box>
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid #f1f5f9', padding: { xs: '10px 8px', md: '16px' } }}>
                                <Typography sx={{ fontSize: { xs: '12px', md: '13px' }, color: '#475569', textTransform: 'capitalize' }}>
                                  {flag.type.replace(/_/g, ' ')}
                                </Typography>
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid #f1f5f9', padding: { xs: '10px 8px', md: '16px' } }}>
                                <Chip
                                  label={severity.label}
                                  size="small"
                                  sx={{
                                    backgroundColor: severity.bg,
                                    color: severity.color,
                                    fontWeight: 600,
                                    fontSize: '11px',
                                    height: '24px',
                                    border: `1px solid ${severity.color}30`,
                                  }}
                                />
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid #f1f5f9', display: { xs: 'none', md: 'table-cell' } }}>
                                <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
                                  {flag.metric.replace(/_/g, ' ')}
                                </Typography>
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid #f1f5f9', display: { xs: 'none', md: 'table-cell' } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <Typography sx={{ fontSize: '13px', fontWeight: 600, color: severity.color }}>
                                    {flag.value}
                                  </Typography>
                                  <Typography sx={{ fontSize: '13px', color: '#94a3b8' }}>/</Typography>
                                  <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
                                    {flag.threshold}
                                  </Typography>
                                </Box>
                              </TableCell>
                            </TableRow>
                          </Fade>
                        );
                      })}
                    {totalFlags === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} sx={{ textAlign: 'center', py: 6 }}>
                          <CheckCircle sx={{ fontSize: 48, color: '#22c55e', opacity: 0.5, mb: 1 }} />
                          <Typography sx={{ color: '#64748b', fontSize: '14px' }}>
                            No flags detected - All systems normal
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          </>
        )}
      </Box>
    </Navigation>
  );
};

export default RealTimeFlagMonitor;
