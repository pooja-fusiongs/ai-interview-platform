import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  Alert,
  IconButton,
  Tooltip,
  Fade,
  Grow,
  Skeleton,
  InputAdornment,
  Card,
  CardContent,
  TablePagination,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Visibility,
  RateReview,
  Search,
  FilterList,
  Refresh,
  CheckCircle,
  Cancel,
  MoreVert,
  Edit,
  Delete,
  Assessment,
  StarRate,
  PersonOff,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import Navigation from '../layout/sidebar';
import feedbackService from '../../services/feedbackService';

interface Feedback {
  id: number;
  candidate_id: number;
  candidate_name?: string;
  job_id: number;
  job_title?: string;
  overall_score: number;
  hire_date: string;
  still_employed: boolean;
  performance_rating?: number;
  feedback_date?: string;
}

// Circular Score Component
const CircularScore: React.FC<{ score: number; size?: number }> = ({ score, size = 44 }) => {
  const normalizedScore = Math.min(Math.max(score || 0, 0), 10);
  const percentage = (normalizedScore / 10) * 100;
  const circumference = 2 * Math.PI * 18;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const getColor = () => {
    if (normalizedScore >= 7) return '#22c55e';
    if (normalizedScore >= 4) return '#f59e0b';
    return '#ef4444';
  };

  const getBgColor = () => {
    if (normalizedScore >= 7) return '#f0fdf4';
    if (normalizedScore >= 4) return '#fffbeb';
    return '#fef2f2';
  };

  return (
    <Box sx={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={18}
          fill={getBgColor()}
          stroke="#e5e7eb"
          strokeWidth="3"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={18}
          fill="none"
          stroke={getColor()}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: '12px',
          fontWeight: 700,
          color: getColor(),
        }}
      >
        {normalizedScore.toFixed(1)}
      </Box>
    </Box>
  );
};

const FeedbackList: React.FC = () => {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterJobId, setFilterJobId] = useState('');
  const [filterCandidateId, setFilterCandidateId] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const fetchFeedbacks = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const params: any = {};
      if (filterJobId) params.job_id = Number(filterJobId);
      if (filterCandidateId) params.candidate_id = Number(filterCandidateId);
      const data = await feedbackService.getFeedbackList(params);
      setFeedbacks(Array.isArray(data) ? data : []);
      setError('');
    } catch {
      setError('Failed to load feedback entries');
      setFeedbacks([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchFeedbacks();
  }, []);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, feedback: Feedback) => {
    setAnchorEl(event.currentTarget);
    setSelectedFeedback(feedback);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedFeedback(null);
  };

  // Filter feedbacks based on search query
  const filteredFeedbacks = feedbacks.filter((fb) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      fb.candidate_name?.toLowerCase().includes(query) ||
      fb.job_title?.toLowerCase().includes(query) ||
      `#${fb.candidate_id}`.includes(query) ||
      `#${fb.job_id}`.includes(query)
    );
  });

  // Pagination
  const paginatedFeedbacks = filteredFeedbacks.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  // Stats
  const totalFeedbacks = feedbacks.length;
  const avgScore = feedbacks.length
    ? feedbacks.reduce((sum, fb) => sum + (fb.overall_score || 0), 0) / feedbacks.length
    : 0;
  const employedCount = feedbacks.filter((fb) => fb.still_employed).length;
  const leftCount = feedbacks.filter((fb) => !fb.still_employed).length;

 

  // Skeleton loader
  const TableSkeleton = () => (
    <>
      {[1, 2, 3, 4, 5].map((i) => (
        <TableRow key={i}>
          <TableCell><Skeleton variant="text" width={40} /></TableCell>
          <TableCell>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Skeleton variant="circular" width={36} height={36} />
              <Box>
                <Skeleton variant="text" width={120} />
                <Skeleton variant="text" width={80} height={14} />
              </Box>
            </Box>
          </TableCell>
          <TableCell><Skeleton variant="text" width={100} /></TableCell>
          <TableCell><Skeleton variant="circular" width={44} height={44} /></TableCell>
          <TableCell><Skeleton variant="text" width={80} /></TableCell>
          <TableCell><Skeleton variant="rounded" width={70} height={24} /></TableCell>
          <TableCell><Skeleton variant="circular" width={32} height={32} /></TableCell>
        </TableRow>
      ))}
    </>
  );

  // Empty State
  const EmptyState = () => (
    <Fade in timeout={500}>
      <Box sx={{ textAlign: 'center', py: 8, px: 4 }}>
        <Box
          sx={{
            width: 100,
            height: 100,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
          }}
        >
          <RateReview sx={{ fontSize: 48, color: '#f59e0b' }} />
        </Box>
        <Typography sx={{ fontSize: '20px', fontWeight: 600, color: '#1e293b', mb: 1 }}>
          No Feedback Records Found
        </Typography>
        <Typography sx={{ fontSize: '14px', color: '#64748b', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>
          Post-hire feedback helps track employee performance and improve your hiring process. Feedback records will appear here once available.
        </Typography>
      </Box>
    </Fade>
  );

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
        <Box sx={{ mb: { xs: '16px', md: '24px' }, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'stretch', md: 'flex-start' }, justifyContent: 'space-between', gap: { xs: '12px', md: 0 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: '10px', md: '14px' } }}>
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(245, 158, 11, 0.3)',
              }}
            >
              <RateReview sx={{ color: '#fff', fontSize: '26px' }} />
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
                Post-Hire Feedback
              </Typography>
              <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
                Track employee performance and hiring quality
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: '8px', sm: '12px' }, flexWrap: 'wrap' }}>
            <TextField
              placeholder="Search by candidate or job..."
              size="small"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search sx={{ color: '#94a3b8', fontSize: '20px' }} />
                  </InputAdornment>
                ),
              }}
              sx={{
                width: { xs: '100%', sm: 200, md: 280 },
                flex: { xs: 1, sm: 'none' },
                '& .MuiOutlinedInput-root': {
                  borderRadius: '10px',
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  '&:hover': { backgroundColor: '#f8fafc' },
                  '&.Mui-focused': { backgroundColor: '#fff' },
                },
              }}
            />
            <Button
              variant={showFilters ? 'contained' : 'outlined'}
              startIcon={<FilterList />}
              onClick={() => setShowFilters(!showFilters)}
              sx={{
                borderRadius: '10px',
                textTransform: 'none',
                fontWeight: 500,
                borderColor: '#e5e7eb',
                color: showFilters ? '#fff' : '#64748b',
                backgroundColor: showFilters ? '#3b82f6' : 'transparent',
                '&:hover': {
                  borderColor: '#d1d5db',
                  backgroundColor: showFilters ? '#2563eb' : '#f8fafc',
                },
              }}
            >
              Filters
            </Button>
            <Tooltip title="Refresh" arrow>
              <IconButton
                onClick={() => fetchFeedbacks(true)}
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
          </Box>
        </Box>

        {/* Advanced Filters */}
        {showFilters && (
          <Fade in>
            <Box sx={{ display: 'flex', gap: { xs: '8px', sm: '12px' }, mb: '20px', p: { xs: '12px', md: '16px' }, backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', flexWrap: 'wrap' }}>
              <TextField
                label="Job ID"
                size="small"
                value={filterJobId}
                onChange={(e) => setFilterJobId(e.target.value)}
                sx={{
                  width: 150,
                  '& .MuiOutlinedInput-root': { borderRadius: '8px' },
                }}
              />
              <TextField
                label="Candidate ID"
                size="small"
                value={filterCandidateId}
                onChange={(e) => setFilterCandidateId(e.target.value)}
                sx={{
                  width: 150,
                  '& .MuiOutlinedInput-root': { borderRadius: '8px' },
                }}
              />
              <Button
                variant="contained"
                onClick={() => fetchFeedbacks()}
                sx={{
                  borderRadius: '8px',
                  textTransform: 'none',
                  fontWeight: 600,
                  backgroundColor: '#3b82f6',
                  '&:hover': { backgroundColor: '#2563eb' },
                }}
              >
                Apply
              </Button>
              <Button
                variant="text"
                onClick={() => {
                  setFilterJobId('');
                  setFilterCandidateId('');
                  fetchFeedbacks();
                }}
                sx={{
                  borderRadius: '8px',
                  textTransform: 'none',
                  color: '#64748b',
                }}
              >
                Clear
              </Button>
            </Box>
          </Fade>
        )}

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
        {!loading && feedbacks.length > 0 && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
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
                    <Assessment sx={{ color: '#3b82f6', fontSize: '20px' }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>
                      {totalFeedbacks}
                    </Typography>
                    <Typography sx={{ fontSize: '13px', color: '#64748b' }}>Total Feedback</Typography>
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
                      backgroundColor: avgScore >= 7 ? '#f0fdf4' : avgScore >= 4 ? '#fffbeb' : '#fef2f2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <StarRate sx={{ color: avgScore >= 7 ? '#22c55e' : avgScore >= 4 ? '#f59e0b' : '#ef4444', fontSize: '20px' }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>
                      {avgScore.toFixed(1)}
                    </Typography>
                    <Typography sx={{ fontSize: '13px', color: '#64748b' }}>Avg. Score</Typography>
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
                      {employedCount}
                    </Typography>
                    <Typography sx={{ fontSize: '13px', color: '#64748b' }}>Still Employed</Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grow>

            <Grow in timeout={600}>
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
                    <PersonOff sx={{ color: '#ef4444', fontSize: '20px' }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>
                      {leftCount}
                    </Typography>
                    <Typography sx={{ fontSize: '13px', color: '#64748b' }}>Left Company</Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grow>
          </Box>
        )}

        {/* Search & Filters */}
        <Card
          sx={{
            borderRadius: '16px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)',
            mb: '20px',
            overflow: 'hidden',
          }}
        >
          

          {/* Table / Cards */}
          {loading ? (
            isMobile ? (
              // Mobile Loading Skeleton
              <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <Card key={i} sx={{ borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                    <CardContent sx={{ p: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                        <Skeleton variant="circular" width={40} height={40} />
                        <Box sx={{ flex: 1 }}>
                          <Skeleton variant="text" width="60%" />
                          <Skeleton variant="text" width="40%" height={14} />
                        </Box>
                        <Skeleton variant="circular" width={44} height={44} />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Skeleton variant="text" width="30%" />
                        <Skeleton variant="rounded" width={70} height={24} />
                      </Box>
                      <Skeleton variant="text" width="50%" />
                    </CardContent>
                  </Card>
                ))}
              </Box>
            ) : (
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table sx={{ minWidth: { xs: 650, md: 'auto' } }}>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f8fafc' }}>
                      <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '13px' }}>ID</TableCell>
                      <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '13px' }}>Candidate</TableCell>
                      <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '13px' }}>Job Position</TableCell>
                      <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '13px' }}>Score</TableCell>
                      <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '13px' }}>Hire Date</TableCell>
                      <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '13px' }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '13px', width: 60 }}></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableSkeleton />
                  </TableBody>
                </Table>
              </TableContainer>
            )
          ) : filteredFeedbacks.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {isMobile ? (
                // Mobile Card View
                <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {paginatedFeedbacks.map((fb) => (
                    <Grow in key={fb.id} timeout={300}>
                      <Card
                        sx={{
                          borderRadius: '12px',
                          border: '1px solid #e5e7eb',
                          boxShadow: 'none',
                          transition: 'all 0.2s ease',
                          '&:hover': { boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)' },
                        }}
                      >
                        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                          {/* Header with Avatar, Name, and Score */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                            <Box
                              sx={{
                                width: 40,
                                height: 40,
                                borderRadius: '10px',
                                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontWeight: 600,
                                fontSize: '16px',
                                flexShrink: 0,
                              }}
                            >
                              {fb.candidate_name?.charAt(0).toUpperCase() || 'C'}
                            </Box>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography
                                sx={{
                                  fontSize: '15px',
                                  fontWeight: 600,
                                  color: '#1e293b',
                                  cursor: 'pointer',
                                  '&:hover': { color: '#3b82f6' },
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                                onClick={() => navigate(`/feedback/${fb.id}`)}
                              >
                                {fb.candidate_name || `Candidate #${fb.candidate_id}`}
                              </Typography>
                              <Typography sx={{ fontSize: '12px', color: '#94a3b8' }}>
                                ID: #{fb.id} | Candidate ID: {fb.candidate_id}
                              </Typography>
                            </Box>
                            <CircularScore score={fb.overall_score} size={48} />
                          </Box>

                          {/* Job Position */}
                          <Box sx={{ mb: 1.5 }}>
                            <Typography sx={{ fontSize: '12px', color: '#64748b', mb: 0.25 }}>
                              Job Position
                            </Typography>
                            <Typography
                              sx={{
                                fontSize: '14px',
                                color: '#1e293b',
                                fontWeight: 500,
                                cursor: 'pointer',
                                '&:hover': { color: '#3b82f6' },
                              }}
                              onClick={() => navigate(`/feedback/${fb.id}`)}
                            >
                              {fb.job_title || `Job #${fb.job_id}`}
                            </Typography>
                          </Box>

                          {/* Hire Date and Status Row */}
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                            <Box>
                              <Typography sx={{ fontSize: '12px', color: '#64748b', mb: 0.25 }}>
                                Hire Date
                              </Typography>
                              <Typography sx={{ fontSize: '13px', color: '#1e293b', fontWeight: 500 }}>
                                {fb.hire_date ? new Date(fb.hire_date).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                }) : '-'}
                              </Typography>
                            </Box>
                            <Chip
                              icon={fb.still_employed ? <CheckCircle sx={{ fontSize: '14px !important' }} /> : <Cancel sx={{ fontSize: '14px !important' }} />}
                              label={fb.still_employed ? 'Employed' : 'Left'}
                              size="small"
                              sx={{
                                backgroundColor: fb.still_employed ? '#f0fdf4' : '#fef2f2',
                                color: fb.still_employed ? '#16a34a' : '#dc2626',
                                border: `1px solid ${fb.still_employed ? '#22c55e' : '#ef4444'}30`,
                                fontWeight: 600,
                                fontSize: '12px',
                                '& .MuiChip-icon': {
                                  color: fb.still_employed ? '#22c55e' : '#ef4444',
                                },
                              }}
                            />
                          </Box>

                          {/* Action Buttons */}
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button
                              variant="contained"
                              size="small"
                              startIcon={<Visibility sx={{ fontSize: '16px' }} />}
                              onClick={() => navigate(`/feedback/${fb.id}`)}
                              sx={{
                                flex: 1,
                                borderRadius: '8px',
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '13px',
                                backgroundColor: '#3b82f6',
                                '&:hover': { backgroundColor: '#2563eb' },
                              }}
                            >
                              View Details
                            </Button>
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<Edit sx={{ fontSize: '16px' }} />}
                              onClick={() => navigate(`/feedback/${fb.id}/edit`)}
                              sx={{
                                flex: 1,
                                borderRadius: '8px',
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '13px',
                                borderColor: '#e5e7eb',
                                color: '#64748b',
                                '&:hover': { borderColor: '#d1d5db', backgroundColor: '#f8fafc' },
                              }}
                            >
                              Edit
                            </Button>
                            <IconButton
                              size="small"
                              onClick={(e) => handleMenuOpen(e, fb)}
                              sx={{
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px',
                                color: '#64748b',
                                '&:hover': { backgroundColor: '#f8fafc', borderColor: '#d1d5db' },
                              }}
                            >
                              <MoreVert sx={{ fontSize: '18px' }} />
                            </IconButton>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grow>
                  ))}
                </Box>
              ) : (
                // Desktop Table View
                <TableContainer sx={{ overflowX: 'auto' }}>
                  <Table sx={{ minWidth: { xs: 650, md: 'auto' } }}>
                    <TableHead>
                      <TableRow sx={{ backgroundColor: '#f8fafc' }}>
                        <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '13px' }}>ID</TableCell>
                        <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '13px' }}>Candidate</TableCell>
                        <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '13px' }}>Job Position</TableCell>
                        <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '13px' }}>Score</TableCell>
                        <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '13px' }}>Hire Date</TableCell>
                        <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '13px' }}>Status</TableCell>
                        <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '13px', width: 60 }}></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {paginatedFeedbacks.map((fb) => (
                        <TableRow
                          key={fb.id}
                          sx={{
                            '&:hover': { backgroundColor: '#f8fafc' },
                            transition: 'background-color 0.15s ease',
                          }}
                        >
                          <TableCell>
                            <Typography sx={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>
                              #{fb.id}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <Box
                                sx={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: '10px',
                                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#fff',
                                  fontWeight: 600,
                                  fontSize: '14px',
                                }}
                              >
                                {fb.candidate_name?.charAt(0).toUpperCase() || 'C'}
                              </Box>
                              <Box>
                                <Typography
                                  sx={{
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    '&:hover': { cursor:"pointer" }
                                  }}
                                  onClick={() => navigate(`/feedback/${fb.id}`)}
                                >
                                  {fb.candidate_name || `Candidate #${fb.candidate_id}`}
                                </Typography>
                                <Typography sx={{ fontSize: '12px', color: '#94a3b8' }}>
                                  ID: {fb.candidate_id}
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography
                              sx={{
                                fontSize: '14px',
                                color: '#1e293b',
                                cursor: 'pointer',
                                '&:hover': { color: '#3b82f6' }
                              }}
                              onClick={() => navigate(`/feedback/${fb.id}`)}
                            >
                              {fb.job_title || `Job #${fb.job_id}`}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <CircularScore score={fb.overall_score} />
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
                              {fb.hire_date ? new Date(fb.hire_date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              }) : '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              icon={fb.still_employed ? <CheckCircle sx={{ fontSize: '14px !important' }} /> : <Cancel sx={{ fontSize: '14px !important' }} />}
                              label={fb.still_employed ? 'Employed' : 'Left'}
                              size="small"
                              sx={{
                                backgroundColor: fb.still_employed ? '#f0fdf4' : '#fef2f2',
                                color: fb.still_employed ? '#16a34a' : '#dc2626',
                                border: `1px solid ${fb.still_employed ? '#22c55e' : '#ef4444'}30`,
                                fontWeight: 600,
                                fontSize: '12px',
                                '& .MuiChip-icon': {
                                  color: fb.still_employed ? '#22c55e' : '#ef4444',
                                },
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Tooltip title="View Details" arrow>
                                <IconButton
                                  size="small"
                                  onClick={() => navigate(`/feedback/${fb.id}`)}
                                  sx={{
                                    color: '#3b82f6',
                                    '&:hover': { backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#2563eb' },
                                  }}
                                >
                                  <Visibility sx={{ fontSize: '18px' }} />
                                </IconButton>
                              </Tooltip>
                              <IconButton
                                size="small"
                                onClick={(e) => handleMenuOpen(e, fb)}
                                sx={{
                                  color: '#94a3b8',
                                  '&:hover': { backgroundColor: '#f1f5f9', color: '#64748b' },
                                }}
                              >
                                <MoreVert sx={{ fontSize: '20px' }} />
                              </IconButton>
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
              <TablePagination
                component="div"
                count={filteredFeedbacks.length}
                page={page}
                onPageChange={(_, newPage) => setPage(newPage)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(e) => {
                  setRowsPerPage(parseInt(e.target.value, 10));
                  setPage(0);
                }}
                rowsPerPageOptions={isMobile ? [5, 10] : [5, 10, 25, 50]}
                labelRowsPerPage={isMobile ? 'Per page:' : 'Rows per page:'}
                sx={{
                  borderTop: '1px solid #f1f5f9',
                  '& .MuiTablePagination-select': { borderRadius: '6px' },
                  '& .MuiTablePagination-toolbar': {
                    flexWrap: isMobile ? 'wrap' : 'nowrap',
                    justifyContent: isMobile ? 'center' : 'flex-end',
                    gap: isMobile ? 1 : 0,
                    px: isMobile ? 1 : 2,
                    py: isMobile ? 1.5 : 1,
                  },
                  '& .MuiTablePagination-selectLabel': {
                    display: isMobile ? 'none' : 'block',
                  },
                  '& .MuiTablePagination-displayedRows': {
                    fontSize: isMobile ? '12px' : '14px',
                  },
                  '& .MuiTablePagination-actions': {
                    ml: isMobile ? 0 : 2,
                  },
                }}
              />
            </>
          )}
        </Card>

        {/* Actions Menu */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
          PaperProps={{
            sx: {
              borderRadius: '12px',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.12)',
              border: '1px solid #e5e7eb',
              minWidth: 160,
            },
          }}
        >
          <MenuItem
            onClick={() => {
              if (selectedFeedback) navigate(`/feedback/${selectedFeedback.id}`);
              handleMenuClose();
            }}
            sx={{ fontSize: '14px', py: 1.5 }}
          >
            <ListItemIcon>
              <Visibility sx={{ fontSize: '18px', color: '#3b82f6' }} />
            </ListItemIcon>
            <ListItemText>View Details</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              if (selectedFeedback) navigate(`/feedback/${selectedFeedback.id}/edit`);
              handleMenuClose();
            }}
            sx={{ fontSize: '14px', py: 1.5 }}
          >
            <ListItemIcon>
              <Edit sx={{ fontSize: '18px', color: '#64748b' }} />
            </ListItemIcon>
            <ListItemText>Edit</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={handleMenuClose}
            sx={{ fontSize: '14px', py: 1.5, color: '#ef4444' }}
          >
            <ListItemIcon>
              <Delete sx={{ fontSize: '18px', color: '#ef4444' }} />
            </ListItemIcon>
            <ListItemText>Delete</ListItemText>
          </MenuItem>
        </Menu>
      </Box>
    </Navigation>
  );
};

export default FeedbackList;
