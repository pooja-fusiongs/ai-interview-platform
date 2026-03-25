import React, { useEffect, useState, useRef, useMemo } from 'react';
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
  Pagination,
  Tabs,
  Tab,
  TextField,
  InputAdornment,
  Select,
  MenuItem,
  FormControl,
} from '@mui/material';
import {
  Warning,
  CheckCircle,
  Error,
  Refresh,
  GraphicEq,
  RecordVoiceOver,
  Accessibility,
  Face,
  Timeline,
  MonitorHeart,
  Circle,
  Search,
  Clear,
  FilterList,
} from '@mui/icons-material';
import Navigation from '../layout/Sidebar';
import fraudDetectionService from '../../services/fraudDetectionService';

interface ParsedFlag {
  id: string;
  flag_type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  timestamp_seconds: number;
  confidence: number;
  candidateName: string;
}

interface MonitorSession {
  videoInterviewId: number;
  candidateName: string;
  jobTitle: string;
  trustScore: number;
  flags: ParsedFlag[];
  status: 'live' | 'flagged' | 'completed';
  voiceScore: number;
  lipSyncScore: number;
  bodyScore: number;
  interviewStatus: string;
  faceDetectionScore: number;
  analyzedAt: string | null;
}

const severityConfig = {
  high: { color: '#ef4444', bg: '#fef2f2', label: 'High' },
  medium: { color: '#020291', bg: '#EEF0FF', label: 'Medium' },
  low: { color: '#3b82f6', bg: '#eff6ff', label: 'Low' },
};

const getScoreColor = (score: number) => {
  if (score >= 80) return { color: '#22c55e', bg: '#f0fdf4', label: 'Good' };
  if (score >= 60) return { color: '#020291', bg: '#EEF0FF', label: 'Fair' };
  return { color: '#ef4444', bg: '#fef2f2', label: 'Poor' };
};

const RealTimeFlagMonitor: React.FC = () => {
  const [sessions, setSessions] = useState<MonitorSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const parseFlags = (flags: any, candidateName: string): ParsedFlag[] => {
    let parsed: any[] = [];
    if (typeof flags === 'string') {
      try { parsed = JSON.parse(flags); } catch { return []; }
    } else if (Array.isArray(flags)) {
      parsed = flags;
    }
    return parsed.map((f: any, idx: number) => ({
      id: `${f.flag_type}-${idx}`,
      flag_type: f.flag_type || 'unknown',
      severity: f.severity || 'low',
      description: f.description || '',
      timestamp_seconds: f.timestamp_seconds || 0,
      confidence: f.confidence || 0,
      candidateName,
    }));
  };

  const loadSessions = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const data = await fraudDetectionService.getAllAnalyses();
      const analyses = data.analyses || [];
      const mapped: MonitorSession[] = analyses.map((a: any) => {
        const flags = parseFlags(a.flags, a.candidate_name || 'Unknown');
        const isLive = a.interview_status === 'in_progress' || a.interview_status === 'waiting';
        let status: 'live' | 'flagged' | 'completed';
        if (isLive) {
          status = 'live';
        } else if ((a.flag_count || 0) > 0) {
          status = 'flagged';
        } else {
          status = 'completed';
        }
        return {
          videoInterviewId: a.video_interview_id,
          candidateName: a.candidate_name || 'Unknown',
          jobTitle: a.job_title || '',
          trustScore: Math.round((a.overall_trust_score || 0) * 100),
          flags,
          status,
          voiceScore: Math.round((a.voice_consistency_score || 0) * 100),
          lipSyncScore: Math.round((a.lip_sync_score || 0) * 100),
          bodyScore: Math.round((a.body_movement_score || 0) * 100),
          faceDetectionScore: a.face_detection_score != null ? Math.round(a.face_detection_score * 100) : 0,
          analyzedAt: a.analyzed_at,
          interviewStatus: a.interview_status || '',
        };
      });
      // Sort: live interviews first, then newest first by date
      mapped.sort((a, b) => {
        if (a.status === 'live' && b.status !== 'live') return -1;
        if (a.status !== 'live' && b.status === 'live') return 1;
        const dateA = a.analyzedAt ? new Date(a.analyzedAt).getTime() : 0;
        const dateB = b.analyzedAt ? new Date(b.analyzedAt).getTime() : 0;
        return dateB - dateA;
      });
      setSessions(mapped);
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
    intervalRef.current = setInterval(() => {
      // Only poll when tab is visible — saves DB connections
      if (!document.hidden) loadSessions();
    }, 15000); // 15s
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const totalFlags = sessions.reduce((sum, s) => sum + s.flags.length, 0);
  const flaggedSessions = sessions.filter((s) => s.status === 'flagged').length;
  const liveSessions = sessions.filter((s) => s.status === 'live').length;

  // Main view tab: 0=Interviews, 1=Flag Activity Log
  const [mainTab, setMainTab] = useState(0);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Filtered sessions
  const filteredSessions = useMemo(() => {
    let result = sessions;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((s) =>
        s.candidateName.toLowerCase().includes(q) ||
        s.jobTitle.toLowerCase().includes(q) ||
        String(s.videoInterviewId).includes(q)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter((s) => s.status === statusFilter);
    }

    return result;
  }, [sessions, searchQuery, statusFilter]);

  // Pagination state
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [searchQuery, statusFilter]);

  const totalPages = Math.ceil(filteredSessions.length / ITEMS_PER_PAGE);
  const paginatedSessions = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredSessions.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredSessions, page]); 

  const ScoreBar = ({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) => {
    const scoreColor = getScoreColor(value);
    return (
      <Box sx={{ mb: '12px' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: '6px' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Box sx={{ color: '#64748b', display: 'flex', alignItems: 'center' }}>{icon}</Box>
            <Typography sx={{ fontSize: '13px', color: '#475569', fontWeight: 500 }}>{label}</Typography>
          </Box>
          <Typography sx={{ fontSize: '13px', fontWeight: 700, color: scoreColor.color }}>{value}%</Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={value}
          sx={{
            height: 8,
            borderRadius: 4,
            backgroundColor: '#e5e7eb',
            '& .MuiLinearProgress-bar': { backgroundColor: scoreColor.color, borderRadius: 4, transition: 'transform 0.6s ease' },
          }}
        />
      </Box>
    );
  };

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

  const allFlags = sessions.flatMap((s) =>
    s.flags.map((f) => ({ ...f, candidateName: s.candidateName, analyzedAt: s.analyzedAt }))
  );

  // Flag table pagination
  const [flagPage, setFlagPage] = useState(1);
  const FLAGS_PER_PAGE = 10;
  const totalFlagPages = Math.ceil(allFlags.length / FLAGS_PER_PAGE);
  const paginatedFlags = useMemo(() => {
    const start = (flagPage - 1) * FLAGS_PER_PAGE;
    return allFlags.slice(start, start + FLAGS_PER_PAGE);
  }, [allFlags, flagPage]);

  return (
    <Navigation>
      <Box sx={{ minHeight: '100vh', background: 'linear-gradient(180deg, #F8F9FB 0%, #EEF2F6 100%)', padding: { xs: '12px', sm: '24px' } }}>
        {/* Header */}
        <Box sx={{ mb: '24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Box sx={{
              width: { xs: 40, sm: 52 }, height: { xs: 40, sm: 52 }, borderRadius: { xs: '10px', sm: '14px' },
              background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(139, 92, 246, 0.3)', position: 'relative',
            }}>
              <MonitorHeart sx={{ color: '#fff', fontSize: { xs: '20px', sm: '26px' } }} />
              <Box sx={{
                position: 'absolute', top: -4, right: -4, width: 14, height: 14,
                borderRadius: '50%', backgroundColor: '#22c55e', border: '2px solid #fff',
                animation: 'pulse 2s ease-in-out infinite',
                '@keyframes pulse': { '0%, 100%': { transform: 'scale(1)', opacity: 1 }, '50%': { transform: 'scale(1.2)', opacity: 0.8 } },
              }} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: { xs: '18px', sm: '26px' }, fontWeight: 700, color: '#1e293b', letterSpacing: '-0.02em' }}>
                Real-Time Monitor
              </Typography>
            </Box>
          </Box>
          <Tooltip title="Refresh data" arrow>
            <IconButton
              onClick={() => loadSessions(true)}
              disabled={refreshing}
              sx={{
                backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px',
                width: 42, height: 42, '&:hover': { backgroundColor: '#f8fafc' },
              }}
            >
              <Refresh sx={{
                fontSize: '20px', color: '#64748b',
                animation: refreshing ? 'spin 1s linear infinite' : 'none',
                '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } },
              }} />
            </IconButton>
          </Tooltip>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 3, borderRadius: '12px', border: '1px solid #fecaca' }}>{error}</Alert>}

        {/* Stats */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, 1fr)' }, gap: '16px', mb: '24px' }}>
          {[
            { value: liveSessions, label: 'Live Now', icon: <MonitorHeart sx={{ color: '#8b5cf6', fontSize: '20px' }} />, bg: '#f5f3ff' },
            { value: sessions.length, label: 'Total Interviews', icon: <Circle sx={{ color: '#22c55e', fontSize: '20px' }} />, bg: '#f0fdf4' },
            { value: flaggedSessions, label: 'Flagged Sessions', icon: <Error sx={{ color: '#ef4444', fontSize: '20px' }} />, bg: '#fef2f2' },
            { value: totalFlags, label: 'Total Flags', icon: <Warning sx={{ color: '#020291', fontSize: '20px' }} />, bg: '#EEF0FF' },
          ].map((stat, i) => (
            <Grow in={!loading} timeout={300 + i * 100} key={stat.label}>
              <Card sx={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: 'none', '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.06)' } }}>
                <CardContent sx={{ padding: '16px !important', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Box sx={{ width: 44, height: 44, borderRadius: '10px', backgroundColor: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {stat.icon}
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>{stat.value}</Typography>
                    <Typography sx={{ fontSize: '13px', color: '#64748b' }}>{stat.label}</Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grow>
          ))}
        </Box>

        {/* Search & Filter Bar */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '16px', flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="Search by candidate, job title, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{
              flex: 1, minWidth: 220, maxWidth: 360,
              '& .MuiOutlinedInput-root': {
                borderRadius: '10px', backgroundColor: '#fff', fontSize: '13px',
                '& fieldset': { borderColor: '#e5e7eb' },
                '&:hover fieldset': { borderColor: '#d1d5db' },
                '&.Mui-focused fieldset': { borderColor: '#8b5cf6', borderWidth: '1.5px' },
              },
            }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: '18px', color: '#94a3b8' }} /></InputAdornment>,
              endAdornment: searchQuery ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchQuery('')} sx={{ padding: '2px' }}>
                    <Clear sx={{ fontSize: '16px', color: '#94a3b8' }} />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              startAdornment={<FilterList sx={{ fontSize: '16px', color: '#94a3b8', mr: 0.5 }} />}
              sx={{
                borderRadius: '10px', backgroundColor: '#fff', fontSize: '13px',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e5e7eb' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#d1d5db' },
              }}
            >
              <MenuItem value="all">All Status</MenuItem>
              <MenuItem value="live">Live</MenuItem>
              <MenuItem value="flagged">Flagged</MenuItem>
              <MenuItem value="completed">Cleared</MenuItem>
            </Select>
          </FormControl>
          <Chip
            label={`${filteredSessions.length} of ${sessions.length} interviews`}
            size="small"
            sx={{ backgroundColor: '#f1f5f9', color: '#64748b', fontWeight: 500, fontSize: '12px' }}
          />
        </Box>

        {/* Main View Tabs */}
        <Box sx={{ mb: 3, borderBottom: '2px solid #e5e7eb' }}>
          <Tabs
            value={mainTab}
            onChange={(_, v) => setMainTab(v)}
            sx={{
              minHeight: 42,
              '& .MuiTab-root': { minHeight: 42, textTransform: 'none', fontWeight: 600, fontSize: '14px', px: 3 },
              '& .MuiTabs-indicator': { borderRadius: 2, height: 3 },
            }}
          >
            <Tab label={`Interviews (${filteredSessions.length})`} />
            <Tab label={`Flag Activity Log (${totalFlags})`} />
          </Tabs>
        </Box>

        {loading ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '20px', mb: '24px' }}>
            {[1, 2, 3, 4].map((i) => <SessionCardSkeleton key={i} />)}
          </Box>
        ) : mainTab === 0 ? (
          <>
            {/* ===== TAB 1: Interviews ===== */}
            {sessions.length === 0 ? (
              <Card sx={{ borderRadius: '16px', border: '1px solid #e5e7eb', p: 6, textAlign: 'center', mb: 3 }}>
                <CheckCircle sx={{ fontSize: 56, color: '#22c55e', opacity: 0.5, mb: 2 }} />
                <Typography sx={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', mb: 1 }}>No Analyses Yet</Typography>
                <Typography sx={{ fontSize: '14px', color: '#64748b' }}>Completed interviews will appear here after fraud analysis.</Typography>
              </Card>
            ) : (
              <>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '20px', mb: '28px' }}>
                {paginatedSessions.map((session, index) => {
                  const trustColor = getScoreColor(session.trustScore);
                  const isFlagged = session.status === 'flagged';
                  const isLive = session.status === 'live';
                  return (
                    <Grow in key={session.videoInterviewId} timeout={300 + index * 100}>
                      <Card sx={{
                        borderRadius: '16px',
                        border: isLive ? '2px solid #8b5cf6' : isFlagged ? '2px solid #ef4444' : '1px solid #e5e7eb',
                        boxShadow: isLive ? '0 4px 20px rgba(139, 92, 246, 0.2)' : isFlagged ? '0 4px 20px rgba(239, 68, 68, 0.15)' : '0 4px 12px rgba(0,0,0,0.04)',
                        transition: 'all 0.25s ease', overflow: 'hidden',
                        '&:hover': { boxShadow: '0 8px 28px rgba(0,0,0,0.1)', transform: 'translateY(-2px)' },
                      }}>
                        <Box sx={{
                          padding: '16px 20px', borderBottom: '1px solid #f1f5f9',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          background: isLive ? '#f5f3ff' : isFlagged ? '#fef2f2' : '#fafbfc',
                        }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Box sx={{
                              width: 44, height: 44, borderRadius: '12px',
                              background: `linear-gradient(135deg, ${trustColor.color}20 0%, ${trustColor.color}40 100%)`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: trustColor.color, fontSize: '16px', fontWeight: 700,
                              border: `2px solid ${trustColor.color}40`,
                            }}>
                              {(session.candidateName || 'U')[0].toUpperCase()}
                            </Box>
                            <Box>
                              <Typography sx={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>
                                {session.candidateName || 'Unknown'}
                              </Typography>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Box sx={{
                                  width: 8, height: 8, borderRadius: '50%',
                                  backgroundColor: isLive ? '#8b5cf6' : isFlagged ? '#ef4444' : '#22c55e',
                                  ...(isLive ? { animation: 'blink 1.2s infinite', '@keyframes blink': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.3 } } } : {}),
                                }} />
                                <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                                  {isLive ? 'LIVE' : isFlagged ? 'Flagged' : 'Cleared'} • Interview #{session.videoInterviewId}
                                  {session.jobTitle ? ` • ${session.jobTitle}` : ''}
                                </Typography>
                              </Box>
                            </Box>
                          </Box>
                          <Chip
                            label={`${session.trustScore}%`}
                            size="small"
                            sx={{
                              backgroundColor: trustColor.bg, color: trustColor.color,
                              fontWeight: 700, fontSize: '13px', height: '28px',
                              border: `1px solid ${trustColor.color}30`,
                            }}
                          />
                        </Box>
                        <CardContent sx={{ padding: '20px !important' }}>
                          <ScoreBar label="Face Detection" value={session.faceDetectionScore} icon={<Face sx={{ fontSize: '16px' }} />} />
                          <ScoreBar label="Voice Consistency" value={session.voiceScore} icon={<RecordVoiceOver sx={{ fontSize: '16px' }} />} />
                          <ScoreBar label="Lip Sync" value={session.lipSyncScore} icon={<GraphicEq sx={{ fontSize: '16px' }} />} />
                          <ScoreBar label="Body Movement" value={session.bodyScore} icon={<Accessibility sx={{ fontSize: '16px' }} />} />
                          {session.flags.length > 0 && (
                            <Box sx={{ mt: '16px', pt: '16px', borderTop: '1px solid #f1f5f9' }}>
                              <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', mb: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Active Flags ({session.flags.length})
                              </Typography>
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {session.flags.map((flag) => {
                                  const sev = severityConfig[flag.severity] || severityConfig.low;
                                  return (
                                    <Chip
                                      key={flag.id}
                                      icon={<Warning sx={{ fontSize: '14px !important' }} />}
                                      label={flag.description}
                                      size="small"
                                      sx={{
                                        backgroundColor: sev.bg, color: sev.color,
                                        border: `1px solid ${sev.color}30`, fontWeight: 500, fontSize: '11px',
                                        '& .MuiChip-icon': { color: sev.color },
                                      }}
                                    />
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
              {/* Pagination */}
              {totalPages > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
                  <Pagination
                    count={totalPages}
                    page={page}
                    onChange={(_, v) => setPage(v)}
                    color="primary"
                    shape="rounded"
                    sx={{
                      '& .MuiPaginationItem-root': { fontWeight: 600, fontSize: '13px' },
                    }}
                  />
                </Box>
              )}
              </>
            )}
          </>
        ) : (
          <>
            {/* ===== TAB 2: Flag Activity Log ===== */}
            <Card sx={{ borderRadius: '16px', border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
              <Box sx={{
                padding: { xs: '12px 16px', sm: '18px 24px' }, borderBottom: '1px solid #e5e7eb',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'linear-gradient(180deg, #fff 0%, #fafbfc 100%)',
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: '10px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Timeline sx={{ color: '#64748b', fontSize: '20px' }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>Flag Activity Log</Typography>
                    <Typography sx={{ fontSize: '13px', color: '#64748b' }}>All fraud detection alerts</Typography>
                  </Box>
                </Box>
                <Chip
                  label={`${totalFlags} Flags`}
                  size="small"
                  sx={{
                    backgroundColor: totalFlags > 0 ? '#EEF0FF' : '#f0fdf4',
                    color: totalFlags > 0 ? '#020291' : '#22c55e',
                    fontWeight: 600, fontSize: '12px',
                  }}
                />
              </Box>
              {/* Desktop Table View */}
              <TableContainer sx={{ display: { xs: 'none', sm: 'block' } }}>
                <Table>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f8fafc' }}>
                      {['Candidate', 'Flag Type', 'Severity', 'Description', 'Timestamp'].map((label) => (
                        <TableCell key={label} sx={{
                          fontWeight: 600, color: '#475569', fontSize: '12px',
                          textTransform: 'uppercase', letterSpacing: '0.5px',
                          borderBottom: '2px solid #e5e7eb', padding: '14px 16px',
                        }}>
                          {label}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedFlags.map((flag: any, index: number) => {
                      const sev = severityConfig[flag.severity as keyof typeof severityConfig] || severityConfig.low;
                      return (
                        <Fade in key={`${flag.id}-${index}`} timeout={200 + index * 50}>
                          <TableRow sx={{
                            backgroundColor: index % 2 === 0 ? '#fff' : '#fafbfc',
                            '&:hover': { backgroundColor: '#f1f5f9' },
                          }}>
                            <TableCell sx={{ borderBottom: '1px solid #f1f5f9', padding: '14px 16px' }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Box sx={{
                                  width: 28, height: 28, borderRadius: '6px', backgroundColor: '#f1f5f9',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '12px', fontWeight: 600, color: '#64748b',
                                }}>
                                  {(flag.candidateName || 'U')[0].toUpperCase()}
                                </Box>
                                <Typography sx={{ fontSize: '13px', fontWeight: 500, color: '#1e293b' }}>
                                  {flag.candidateName}
                                </Typography>
                              </Box>
                            </TableCell>
                            <TableCell sx={{ borderBottom: '1px solid #f1f5f9', padding: '14px 16px' }}>
                              <Typography sx={{ fontSize: '13px', color: '#475569', textTransform: 'capitalize' }}>
                                {(flag.flag_type || '').replace(/_/g, ' ')}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ borderBottom: '1px solid #f1f5f9', padding: '14px 16px' }}>
                              <Chip
                                label={sev.label}
                                size="small"
                                sx={{
                                  backgroundColor: sev.bg, color: sev.color,
                                  fontWeight: 600, fontSize: '11px', height: '24px',
                                  border: `1px solid ${sev.color}30`,
                                }}
                              />
                            </TableCell>
                            <TableCell sx={{ borderBottom: '1px solid #f1f5f9', padding: '14px 16px' }}>
                              <Typography sx={{ fontSize: '13px', color: '#64748b' }}>{flag.description}</Typography>
                            </TableCell>
                            <TableCell sx={{ borderBottom: '1px solid #f1f5f9', padding: '14px 16px' }}>
                              <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
                                {flag.timestamp_seconds ? `${Math.floor(flag.timestamp_seconds / 60)}m ${Math.floor(flag.timestamp_seconds % 60)}s` : '-'}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        </Fade>
                      );
                    })}
                    {totalFlags === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} sx={{ textAlign: 'center', py: 6 }}>
                          <CheckCircle sx={{ fontSize: 48, color: '#22c55e', opacity: 0.5, mb: 1 }} />
                          <Typography sx={{ color: '#64748b', fontSize: '14px' }}>No flags detected - All systems normal</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Mobile Card View */}
              <Box sx={{ display: { xs: 'block', sm: 'none' } }}>
                {paginatedFlags.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 5 }}>
                    <CheckCircle sx={{ fontSize: 48, color: '#22c55e', opacity: 0.5, mb: 1 }} />
                    <Typography sx={{ color: '#64748b', fontSize: '14px' }}>No flags detected</Typography>
                  </Box>
                ) : (
                  paginatedFlags.map((flag: any, index: number) => {
                    const sev = severityConfig[flag.severity as keyof typeof severityConfig] || severityConfig.low;
                    return (
                      <Box
                        key={`${flag.id}-${index}`}
                        sx={{
                          display: 'flex', alignItems: 'center', gap: 1.5,
                          px: 2, py: 1.5,
                          borderBottom: '1px solid #f1f5f9',
                          backgroundColor: index % 2 === 0 ? '#fff' : '#fafbfc',
                        }}
                      >
                        <Box sx={{
                          width: 32, height: 32, borderRadius: '8px', backgroundColor: '#f1f5f9',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '13px', fontWeight: 600, color: '#64748b', flexShrink: 0,
                        }}>
                          {(flag.candidateName || 'U')[0].toUpperCase()}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.3 }}>
                            <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {flag.candidateName}
                            </Typography>
                            <Chip
                              label={sev.label}
                              size="small"
                              sx={{
                                backgroundColor: sev.bg, color: sev.color,
                                fontWeight: 600, fontSize: '9px', height: 18, flexShrink: 0,
                                border: `1px solid ${sev.color}30`,
                              }}
                            />
                          </Box>
                          <Typography sx={{ fontSize: '12px', color: '#475569', textTransform: 'capitalize' }}>
                            {(flag.flag_type || '').replace(/_/g, ' ')}
                          </Typography>
                          <Typography sx={{ fontSize: '11px', color: '#94a3b8', mt: 0.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {flag.description}
                            {flag.timestamp_seconds ? ` • ${Math.floor(flag.timestamp_seconds / 60)}m ${Math.floor(flag.timestamp_seconds % 60)}s` : ''}
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })
                )}
              </Box>
              {/* Flag Table Pagination */}
              {totalFlagPages > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2, borderTop: '1px solid #e5e7eb' }}>
                  <Pagination
                    count={totalFlagPages}
                    page={flagPage}
                    onChange={(_, v) => setFlagPage(v)}
                    color="primary"
                    shape="rounded"
                    size="small"
                    sx={{
                      '& .MuiPaginationItem-root': { fontWeight: 600, fontSize: '12px' },
                    }}
                  />
                </Box>
              )}
            </Card>
          </>
        )}
      </Box>
    </Navigation>
  );
};

export default RealTimeFlagMonitor;
