import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Paper, Chip, IconButton, Tooltip, CircularProgress, Alert,
  TablePagination, TextField, InputAdornment, FormControl, Select, MenuItem,
  Button, Popover, Badge
} from '@mui/material';
import { Visibility, PlayArrow, Cancel, Search, FilterList, Close } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import Navigation from '../layout/sidebar';
import videoInterviewService from '../../services/videoInterviewService';

const statusColorMap: Record<string, 'primary' | 'warning' | 'success' | 'error'> = {
  scheduled: 'primary',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'error',
};

const VideoInterviewList: React.FC = () => {
  const navigate = useNavigate();
  const [interviews, setInterviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Pagination state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Filter state
  const [statusFilter, setStatusFilter] = useState('all');
  const [jobFilter, setJobFilter] = useState('all');

  // Filter popover state
  const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLButtonElement | null>(null);
  const filterOpen = Boolean(filterAnchorEl);

  // Get unique job titles for filter dropdown
  const uniqueJobTitles = [...new Set(interviews.map(i => i.job_title).filter(Boolean))];

  // Count active filters
  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (jobFilter !== 'all' ? 1 : 0);

  useEffect(() => {
    const fetchInterviews = async () => {
      try {
        const data = await videoInterviewService.getInterviews();
        setInterviews(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load interviews.');
      } finally {
        setLoading(false);
      }
    };
    fetchInterviews();
  }, []);

  const handleCancel = async (id: number) => {
    try {
      await videoInterviewService.cancelInterview(id);
      setInterviews((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: 'cancelled' } : i))
      );
    } catch (err: any) {
      setError(err.message || 'Failed to cancel interview.');
    }
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Filter interviews based on search query, status filter, and job filter
  const filteredInterviews = interviews.filter((interview) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = (
      (interview.job_title?.toLowerCase() || '').includes(query) ||
      (interview.candidate_name?.toLowerCase() || '').includes(query) ||
      (interview.status?.toLowerCase() || '').includes(query)
    );
    const matchesStatus = statusFilter === 'all' || interview.status === statusFilter;
    const matchesJob = jobFilter === 'all' || interview.job_title === jobFilter;
    return matchesSearch && matchesStatus && matchesJob;
  });

  // Get paginated data from filtered results
  const paginatedInterviews = filteredInterviews.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  // Reset to first page when search changes
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
    setPage(0);
  };

  // Reset to first page when filter changes
  const handleStatusFilterChange = (event: any) => {
    setStatusFilter(event.target.value);
    setPage(0);
  };

  const handleJobFilterChange = (event: any) => {
    setJobFilter(event.target.value);
    setPage(0);
  };

  const handleFilterClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setFilterAnchorEl(event.currentTarget);
  };

  const handleFilterClose = () => {
    setFilterAnchorEl(null);
  };

  const handleClearFilters = () => {
    setStatusFilter('all');
    setJobFilter('all');
    setPage(0);
  };

  return (
    <Navigation>
      <Box sx={{ padding: '20px', background: '#f8fafc', minHeight: '100vh' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#1e293b' }}>Video Interviews</Typography>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            {/* Filter Button */}
            <Badge badgeContent={activeFilterCount} color="warning">
              <Button
                variant="outlined"
                startIcon={<FilterList />}
                onClick={handleFilterClick}
                sx={{
                  borderColor: filterOpen || activeFilterCount > 0 ? '#f59e0b' : '#e2e8f0',
                  color: filterOpen || activeFilterCount > 0 ? '#f59e0b' : '#64748b',
                  backgroundColor: '#fff',
                  textTransform: 'none',
                  fontWeight: 500,
                  borderRadius: '8px',
                  '&:hover': {
                    borderColor: '#f59e0b',
                    backgroundColor: '#fffbeb',
                  },
                }}
              >
                Filters
              </Button>
            </Badge>

            {/* Filter Popover */}
            <Popover
              open={filterOpen}
              anchorEl={filterAnchorEl}
              onClose={handleFilterClose}
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
              }}
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
              PaperProps={{
                sx: {
                  mt: 1,
                  borderRadius: '12px',
                  boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
                  border: '1px solid #e2e8f0',
                  minWidth: 280,
                }
              }}
            >
              <Box sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography sx={{ fontWeight: 600, color: '#1e293b' }}>Filters</Typography>
                  <IconButton size="small" onClick={handleFilterClose}>
                    <Close fontSize="small" />
                  </IconButton>
                </Box>

                {/* Job Title Filter */}
                <Box sx={{ mb: 2 }}>
                  <Typography sx={{ fontSize: '13px', fontWeight: 500, color: '#64748b', mb: 1 }}>Job Title</Typography>
                  <FormControl fullWidth size="small">
                    <Select
                      value={jobFilter}
                      onChange={handleJobFilterChange}
                      sx={{
                        borderRadius: '8px',
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#cbd5e1' },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#f59e0b' },
                      }}
                    >
                      <MenuItem value="all">All Jobs</MenuItem>
                      {uniqueJobTitles.map((title) => (
                        <MenuItem key={title} value={title}>{title}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>

                {/* Status Filter */}
                <Box sx={{ mb: 2 }}>
                  <Typography sx={{ fontSize: '13px', fontWeight: 500, color: '#64748b', mb: 1 }}>Status</Typography>
                  <FormControl fullWidth size="small">
                    <Select
                      value={statusFilter}
                      onChange={handleStatusFilterChange}
                      sx={{
                        borderRadius: '8px',
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#cbd5e1' },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#f59e0b' },
                      }}
                    >
                      <MenuItem value="all">All Status</MenuItem>
                      <MenuItem value="scheduled">Scheduled</MenuItem>
                      <MenuItem value="in_progress">In Progress</MenuItem>
                      <MenuItem value="completed">Completed</MenuItem>
                      <MenuItem value="cancelled">Cancelled</MenuItem>
                    </Select>
                  </FormControl>
                </Box>

                {/* Clear Filters Button */}
                {activeFilterCount > 0 && (
                  <Button
                    fullWidth
                    variant="text"
                    onClick={handleClearFilters}
                    sx={{
                      color: '#ef4444',
                      textTransform: 'none',
                      fontWeight: 500,
                      '&:hover': {
                        backgroundColor: '#fef2f2',
                      },
                    }}
                  >
                    Clear All Filters
                  </Button>
                )}
              </Box>
            </Popover>

            {/* Search Field */}
            <TextField
              size="small"
              placeholder="Search by job, candidate..."
              value={searchQuery}
              onChange={handleSearchChange}
              sx={{
                width: 250,
                backgroundColor: '#fff',
                '& .MuiOutlinedInput-root': {
                  borderRadius: '8px',
                  '& fieldset': { borderColor: '#e2e8f0' },
                  '&:hover fieldset': { borderColor: '#cbd5e1' },
                  '&.Mui-focused fieldset': { borderColor: '#f59e0b' },
                },
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search sx={{ color: '#94a3b8' }} />
                  </InputAdornment>
                ),
              }}
            />
          </Box>
        </Box>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
        ) : (
          <Paper sx={{ width: '100%', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 180px)' }}>
            <TableContainer sx={{ flex: 1 }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc' }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc' }}>Job Title</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc' }}>Candidate</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc' }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc' }}>Scheduled At</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc' }}>Duration</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc' }}>Trust Score</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc' }}>Flags</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc' }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody sx={{ '& .MuiTableCell-root': { padding: '12px' } }}>
                  {paginatedInterviews.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} align="center">
                        <Typography color="textSecondary">No video interviews found</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedInterviews.map((row, index) => (
                      <TableRow
                        key={row.id}
                        sx={{ '&:hover': { backgroundColor: '#f8fafc' } }}
                      >
                        <TableCell>{page * rowsPerPage + index + 1}</TableCell>
                        <TableCell>
                          <Typography
                            sx={{ cursor: 'pointer', fontWeight: 500, '&:hover': { color: '#3b82f6' } }}
                            onClick={() => navigate(`/video-detail/${row.id}`)}
                          >
                            {row.job_title || 'N/A'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            sx={{ cursor: 'pointer', color: '#1e293b', fontWeight: 500, '&:hover': { color: '#3b82f6' } }}
                            onClick={() => navigate(`/video-detail/${row.id}`)}
                          >
                            {row.candidate_name || 'N/A'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={row.status} color={statusColorMap[row.status] || 'default'} size="small" />
                        </TableCell>
                        <TableCell>{new Date(row.scheduled_at).toLocaleString()}</TableCell>
                        <TableCell>{row.duration_minutes} min</TableCell>
                        <TableCell>{row.trust_score ?? '—'}</TableCell>
                        <TableCell>{row.flag_count ?? 0}</TableCell>
                        <TableCell>
                          <Tooltip title="View Details"><IconButton onClick={() => navigate(`/video-detail/${row.id}`)}><Visibility /></IconButton></Tooltip>
                          <Tooltip title={row.status === 'completed' ? 'Interview Completed' : row.status === 'cancelled' ? 'Interview Cancelled' : 'Start Interview'}>
                            <span>
                              <IconButton
                                color="success"
                                onClick={() => navigate(`/video-room/${row.id}`)}
                                disabled={row.status === 'cancelled' || row.status === 'completed'}
                              >
                                <PlayArrow />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Cancel">
                            <span>
                              <IconButton
                                color="error"
                                onClick={() => handleCancel(row.id)}
                                disabled={row.status === 'cancelled' || row.status === 'completed'}
                              >
                                <Cancel />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              rowsPerPageOptions={[5, 10, 25, 50]}
              component="div"
              count={filteredInterviews.length}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              sx={{
                flexShrink: 0,
                borderTop: '1px solid #e2e8f0',
                backgroundColor: '#fff',
                '.MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows': {
                  color: '#64748b',
                  fontWeight: 500,
                },
                '.MuiTablePagination-select': {
                  fontWeight: 500,
                },
              }}
            />
          </Paper>
        )}
      </Box>
    </Navigation>
  );
};

export default VideoInterviewList;
