import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Paper, Chip, IconButton, Tooltip, CircularProgress, Alert,
  TablePagination, TextField, InputAdornment, FormControl, Select, MenuItem,
  Button, Popover, Badge, Card, CardContent, useMediaQuery, useTheme
} from '@mui/material';
import { Visibility, PlayArrow, Cancel, Search, FilterList, Close } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import Navigation from '../layout/Sidebar';
import videoInterviewService from '../../services/videoInterviewService';
import { useAuth } from '../../contexts/AuthContext';

const statusColorMap: Record<string, 'primary' | 'warning' | 'success' | 'error'> = {
  scheduled: 'primary',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'error',
};

const VideoInterviewList: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { user } = useAuth();
  const isCandidate = user?.role === 'candidate';
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
      <Box sx={{ padding: { xs: '12px', sm: '16px', md: '20px' }, background: '#f8fafc', minHeight: '100vh' }}>
        <Box sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', sm: 'center' },
          gap: { xs: 2, sm: 0 },
          mb: 2
        }}>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#1e293b', fontSize: { xs: '20px', sm: '24px', md: '28px' } }}>Video Interviews</Typography>
          <Box sx={{ display: 'flex', gap: { xs: 1, sm: 2 }, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Filter Button */}
            <Badge badgeContent={activeFilterCount} color="warning">
              <Button
                variant="outlined"
                startIcon={<FilterList />}
                onClick={handleFilterClick}
                sx={{
                  borderColor: filterOpen || activeFilterCount > 0 ? '#020291' : '#e2e8f0',
                  color: filterOpen || activeFilterCount > 0 ? '#020291' : '#64748b',
                  backgroundColor: '#fff',
                  textTransform: 'none',
                  fontWeight: 500,
                  borderRadius: '8px',
                  '&:hover': {
                    borderColor: '#020291',
                    backgroundColor: '#EEF0FF',
                    color:"#020291"
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
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#020291' },
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
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#020291' },
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
                width: { xs: '100%', sm: 200, md: 250 },
                flex: { xs: 1, sm: 'none' },
                backgroundColor: '#fff',
                '& .MuiOutlinedInput-root': {
                  borderRadius: '8px',
                  '& fieldset': { borderColor: '#e2e8f0' },
                  '&:hover fieldset': { borderColor: '#cbd5e1' },
                  '&.Mui-focused fieldset': { borderColor: '#020291' },
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
        ) : isMobile ? (
          /* Mobile Card View */
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {paginatedInterviews.length === 0 ? (
              <Paper sx={{ p: 3, textAlign: 'center' }}>
                <Typography color="textSecondary">No video interviews found</Typography>
              </Paper>
            ) : (
              paginatedInterviews.map((row, ) => (
                <Card
                  key={row.id}
                  sx={{
                    borderRadius: '12px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    border: '1px solid #e2e8f0',
                    '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.12)' },
                  }}
                >
                  <CardContent sx={{ p: 2 }}>
                    {/* Header with job title and status */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                      <Box sx={{ flex: 1 }}>
                        <Typography
                          variant="subtitle1"
                          sx={{
                            fontWeight: 600,
                            color: '#1e293b',
                            cursor: 'pointer',
                            '&:hover': { color: '#3b82f6' },
                          }}
                          onClick={() => navigate(`/video-detail/${row.id}`)}
                        >
                          {row.job_title || 'N/A'}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            color: '#64748b',
                            cursor: 'pointer',
                            '&:hover': { color: '#3b82f6' },
                          }}
                          onClick={() => navigate(`/video-detail/${row.id}`)}
                        >
                          {row.candidate_name || 'N/A'}
                        </Typography>
                      </Box>
                      <Chip
                        label={row.status}
                        color={statusColorMap[row.status] || 'default'}
                        size="small"
                        sx={{ ml: 1 }}
                      />
                    </Box>

                    {/* Interview details */}
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
                      <Box>
                        <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block' }}>
                          Scheduled
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#475569', fontWeight: 500 }}>
                          {new Date(row.scheduled_at).toLocaleDateString()}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b' }}>
                          {new Date(row.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block' }}>
                          Duration
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#475569', fontWeight: 500 }}>
                          {row.duration_minutes} min
                        </Typography>
                      </Box>
                      
                      <Box>
                        <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block' }}>
                          Flags
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#475569', fontWeight: 500 }}>
                          {row.flag_count ?? 0}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Action buttons */}
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9', pt: 1.5, mt: 1 }}>
                      {!isCandidate && (
                        <Tooltip title="View Details">
                          <IconButton
                            size="small"
                            onClick={() => navigate(`/video-detail/${row.id}`)}
                            sx={{ backgroundColor: '#f1f5f9', '&:hover': { backgroundColor: '#e2e8f0' } }}
                          >
                            <Visibility fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title={row.status === 'completed' ? 'Interview Completed' : row.status === 'cancelled' ? 'Interview Cancelled' : 'Start Interview'}>
                        <span>
                          <IconButton
                            size="small"
                            color="success"
                            onClick={() => navigate(`/video-room/${row.id}`)}
                            disabled={row.status === 'cancelled' || row.status === 'completed'}
                            sx={{ backgroundColor: '#f0fdf4', '&:hover': { backgroundColor: '#dcfce7' }, '&.Mui-disabled': { backgroundColor: '#f8fafc' } }}
                          >
                            <PlayArrow fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      {!isCandidate && (
                        <Tooltip title="Cancel">
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleCancel(row.id)}
                              disabled={row.status === 'cancelled' || row.status === 'completed'}
                              sx={{ backgroundColor: '#fef2f2', '&:hover': { backgroundColor: '#fee2e2' }, '&.Mui-disabled': { backgroundColor: '#f8fafc' } }}
                            >
                              <Cancel fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              ))
            )}

            {/* Mobile-friendly Pagination */}
            <Paper sx={{ borderRadius: '12px', overflow: 'hidden' }}>
              <TablePagination
                rowsPerPageOptions={[5, 10, 25]}
                component="div"
                count={filteredInterviews.length}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={handleChangePage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                labelRowsPerPage="Per page:"
                sx={{
                  '.MuiTablePagination-toolbar': {
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    padding: '8px',
                  },
                  '.MuiTablePagination-spacer': {
                    display: 'none',
                  },
                  '.MuiTablePagination-selectLabel': {
                    margin: 0,
                  },
                  '.MuiTablePagination-displayedRows': {
                    margin: '8px 0',
                    width: '100%',
                    textAlign: 'center',
                  },
                  '.MuiTablePagination-actions': {
                    marginLeft: 0,
                  },
                }}
              />
            </Paper>
          </Box>
        ) : (
          /* Desktop Table View */
          <Paper sx={{ width: '100%', display: 'flex', flexDirection: 'column', maxHeight: { xs: 'calc(100vh - 220px)', md: 'calc(100vh - 180px)' }, overflow: 'hidden' }}>
            <TableContainer sx={{ flex: 1, overflowX: 'auto' }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc' }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc' }}>Job Title</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc' }}>Candidate</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc' }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', display: { xs: 'none', lg: 'table-cell' } }}>Scheduled At</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', display: { xs: 'none', md: 'table-cell' } }}>Duration</TableCell>
                     <TableCell sx={{ fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', display: { xs: 'none', md: 'table-cell' } }}>Flags</TableCell>
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
                        <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>{new Date(row.scheduled_at).toLocaleString()}</TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{row.duration_minutes} min</TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{row.flag_count ?? 0}</TableCell>
                        <TableCell>
                          {!isCandidate && (
                            <Tooltip title="View Details"><IconButton onClick={() => navigate(`/video-detail/${row.id}`)}><Visibility /></IconButton></Tooltip>
                          )}
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
                          {!isCandidate && (
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
                          )}
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
