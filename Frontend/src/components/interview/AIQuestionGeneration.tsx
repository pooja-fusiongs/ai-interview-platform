import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../layout/Sidebar';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Avatar,
  Chip,
  IconButton,
  TextField,
  InputAdornment,
  Button,
  TablePagination,
  CircularProgress,
  Card,
  CardContent,
  useMediaQuery,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  Visibility as VisibilityIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { toast } from 'react-hot-toast';
import questionGenerationService from '../../services/questionGenerationService';

interface Question {
  id: string;
  question: string;
  sample_answer: string;
  difficulty: string;
  category: string;
  skills_tested: string[];
}

interface QuestionSet {
  id: string;
  job_id: number;
  application_id: number;
  job_title?: string;
  candidate_name?: string;
  candidate_email?: string;
  questions: Question[];
  status: string;
  generated_at: string;
  mode: 'preview' | 'live';
  main_topics?: string[];
  total_questions: number;
  experience?: string;
}

const ExpertReview: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [questionSets, setQuestionSets] = useState<QuestionSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [filterJob, setFilterJob] = useState<string>('all');
  const [filterCandidate, setFilterCandidate] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Sorting state
  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    fetchQuestionSets();
  }, []);

  const fetchQuestionSets = async () => {
    try {
      setLoading(true);
      const response = await questionGenerationService.getQuestionSets();

      // Transform the API response to match our interface
      const transformedData = response.data.map((item: any) => ({
        id: item.id,
        job_id: item.job_id,
        application_id: item.application_id,
        job_title: item.job_title || 'Unknown Position',
        candidate_name: item.candidate_name || 'Unknown Candidate',
        candidate_email: item.candidate_email || 'No email provided',
        questions: item.questions || [],
        status: item.status || 'pending',
        generated_at: item.generated_at || new Date().toISOString(),
        mode: item.mode || 'preview',
        main_topics: item.main_topics || [],
        total_questions: item.questions?.length || 0,
        experience: item.experience || '2+ years'
      }));

      setQuestionSets(transformedData);
    } catch (error) {
      console.error('Error fetching question sets:', error);
      toast.error('Failed to load question sets');
      // Fallback to demo data if API fails
      setQuestionSets(generateDemoData());
    } finally {
      setLoading(false);
    }
  };

  const generateDemoData = (): QuestionSet[] => {
    return [
      {
        id: 'set-1',
        job_id: 1,
        application_id: 1,
        job_title: 'Senior React Developer',
        candidate_name: 'John Smith',
        candidate_email: 'john.smith@email.com',
        status: 'pending',
        generated_at: '2024-01-30T11:44:00Z',
        mode: 'preview',
        main_topics: ['React', 'JavaScript', 'System Design'],
        total_questions: 10,
        experience: '5+ years',
        questions: []
      },
      {
        id: 'set-2',
        job_id: 2,
        application_id: 2,
        job_title: 'Python Backend Developer',
        candidate_name: 'Sarah Johnson',
        candidate_email: 'sarah.johnson@email.com',
        status: 'pending',
        generated_at: '2024-01-30T11:46:00Z',
        mode: 'preview',
        main_topics: ['Python', 'Django', 'API Development'],
        total_questions: 8,
        experience: '3+ years',
        questions: []
      }
    ];
  };

  const handleViewQuestions = (questionSet: QuestionSet) => {
    navigate(`/interview-outline/${questionSet.id}`);
  };



  // Sorting function
  const handleSort = (field: string) => {
    if (sortField === field) {
      // If clicking the same field, toggle direction
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // If clicking a new field, set it as sort field with ascending direction
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Render sort icon
  const renderSortIcon = (field: string) => {
    if (sortField !== field) {
      return (
        <i className="fas fa-sort" style={{
          color: '#9ca3af',
          fontSize: '12px',
          marginLeft: '6px',
          opacity: 0.8,
          transition: 'all 0.2s ease'
        }}></i>
      );
    }

    return (
      <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'}`} style={{
        color: '#d97706',
        fontSize: '12px',
        marginLeft: '6px',
        transition: 'all 0.2s ease'
      }}></i>
    );
  };

  // Unique values for filter dropdowns
  const uniqueJobs = Array.from(new Set(questionSets.map(s => s.job_title).filter(Boolean))) as string[];
  const uniqueCandidates = Array.from(new Set(questionSets.map(s => s.candidate_name).filter(Boolean))) as string[];

  const hasActiveFilters = filterJob !== 'all' || filterCandidate !== 'all' || filterStatus !== 'all';

  const activeFilterChips = [
    ...(filterJob !== 'all' ? [{ label: `Job: ${filterJob}`, key: 'job' }] : []),
    ...(filterCandidate !== 'all' ? [{ label: `Candidate: ${filterCandidate}`, key: 'candidate' }] : []),
    ...(filterStatus !== 'all' ? [{ label: `Status: ${filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)}`, key: 'status' }] : []),
  ];

  const filteredQuestionSets = (questionSets || []).filter((set: QuestionSet) => {
    const jobTitle = set?.job_title || '';
    const candidateName = set?.candidate_name || '';
    const candidateEmail = set?.candidate_email || '';

    const matchesSearch = jobTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      candidateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      candidateEmail.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesJob = filterJob === 'all' || set.job_title === filterJob;
    const matchesCandidate = filterCandidate === 'all' || set.candidate_name === filterCandidate;
    const matchesStatus = filterStatus === 'all' || set.status === filterStatus;

    return matchesSearch && matchesJob && matchesCandidate && matchesStatus;
  });

  // Sort the filtered data
  const sortedQuestionSets = React.useMemo(() => {
    if (!sortField) return filteredQuestionSets;

    return [...filteredQuestionSets].sort((a, b) => {
      let aValue: any = '';
      let bValue: any = '';

      switch (sortField) {
        case 'experience':
          aValue = a.experience || '';
          bValue = b.experience || '';
          break;
        case 'candidate_name':
          aValue = (a.candidate_name || '').toLowerCase();
          bValue = (b.candidate_name || '').toLowerCase();
          break;
        case 'candidate_email':
          aValue = (a.candidate_email || '').toLowerCase();
          bValue = (b.candidate_email || '').toLowerCase();
          break;
        case 'job_title':
          aValue = (a.job_title || '').toLowerCase();
          bValue = (b.job_title || '').toLowerCase();
          break;
        case 'skills':
          aValue = (a.main_topics?.join(', ') || '').toLowerCase();
          bValue = (b.main_topics?.join(', ') || '').toLowerCase();
          break;
        case 'status':
          aValue = a.status.toLowerCase();
          bValue = b.status.toLowerCase();
          break;
        case 'generated_at':
          aValue = new Date(a.generated_at).getTime();
          bValue = new Date(b.generated_at).getTime();
          break;
        default:
          return 0;
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      } else {
        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      }
    });
  }, [filteredQuestionSets, sortField, sortDirection]);

  const paginatedData = sortedQuestionSets.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const getStatusChip = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === 'pending') {
      return <Chip label="Pending" size="small" sx={{ backgroundColor: '#fff3cd', color: '#856404', fontWeight: 500 }} />;
    } else if (statusLower === 'approved' || statusLower === 'completed') {
      return <Chip label="Approved" size="small" sx={{ backgroundColor: '#d4edda', color: '#155724', fontWeight: 500 }} />;
    } else if (statusLower === 'rejected') {
      return <Chip label="Rejected" size="small" sx={{ backgroundColor: '#f8d7da', color: '#721c24', fontWeight: 500 }} />;
    }
    return <Chip label={status} size="small" />;
  };

  return (
    <Navigation>
      <Box sx={{ p: { xs: 2, sm: 3 }, backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
        {/* Header */}
        <Box sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "1fr 1fr"
          },
          gap: { xs: 2, md: 3 },
          alignItems: "center",
          mb: 3
        }}>
          <Box sx={{ mb: { xs: 2, sm: 3 } }}>
            <Typography sx={{ fontSize: { xs: '20px', sm: '24px' }, fontWeight: 700, color: '#1e293b', mb: 0.5 }}>
              AI Generated Questions
            </Typography>
            <Typography sx={{ fontSize: { xs: '12px', sm: '14px' }, color: '#64748b' }}>
              Review and approve AI-generated interview questions for candidates
            </Typography>
          </Box>

          {/* Search and Filter */}
          <Box sx={{
            display: 'flex',
            gap: { xs: 1, sm: 2 },
            mb: { xs: 2, sm: 3 },
            alignItems: { xs: 'stretch', sm: 'center' },
            flexDirection: { xs: 'column', sm: 'row' }
          }}>
            <TextField
              placeholder="Search here..."
              variant="outlined"
              size="small"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: '#999' }} />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{
                minWidth: { xs: '100%', sm: 300 },
                flex: { xs: 1, sm: 'none' },
                '& .MuiOutlinedInput-root': {
                  backgroundColor: '#fff',
                  borderRadius: 2
                }
              }}
            />
            <Button
              variant="outlined"
              startIcon={<FilterIcon />}
              onClick={() => setFilterModalOpen(true)}
              sx={{
                borderColor: hasActiveFilters ? '#f59e0b' : '#e2e8f0',
                color: hasActiveFilters ? '#f59e0b' : '#64748b',
                background: hasActiveFilters ? 'rgba(245,158,11,0.08)' : '#fff',
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                width: { xs: '100%', sm: 'auto' },
                '&:hover': {
                  borderColor: '#f59e0b',
                  color: '#f59e0b',
                  backgroundColor: 'rgba(245,158,11,0.08)'
                }
              }}
            >
              Filter
              {hasActiveFilters && (
                <Box sx={{
                  ml: 1, width: 20, height: 20, borderRadius: '50%',
                  background: '#f59e0b', color: '#fff', fontSize: '11px',
                  fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {activeFilterChips.length}
                </Box>
              )}
            </Button>
          </Box>
        </Box>

        {/* Active filter chips */}
        {activeFilterChips.length > 0 && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {activeFilterChips.map((f) => (
              <Chip
                key={f.key}
                label={f.label}
                size="small"
                onDelete={() => {
                  if (f.key === 'job') setFilterJob('all');
                  if (f.key === 'candidate') setFilterCandidate('all');
                  if (f.key === 'status') setFilterStatus('all');
                  setPage(0);
                }}
                sx={{
                  fontWeight: 600, fontSize: '12px',
                  backgroundColor: 'rgba(245,158,11,0.1)', color: '#d97706',
                  border: '1px solid rgba(245,158,11,0.3)',
                  '& .MuiChip-deleteIcon': { color: '#d97706', '&:hover': { color: '#b45309' } },
                }}
              />
            ))}
            <Chip
              label="Clear All"
              size="small"
              onClick={() => { setFilterJob('all'); setFilterCandidate('all'); setFilterStatus('all'); setPage(0); }}
              sx={{
                fontWeight: 600, fontSize: '12px', cursor: 'pointer',
                backgroundColor: '#f1f5f9', color: '#64748b',
                '&:hover': { backgroundColor: '#e2e8f0' },
              }}
            />
          </Box>
        )}

        {/* Loading State */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <CircularProgress size={32} sx={{ color: '#f59e0b' }} />
            <Typography sx={{ ml: 2, color: '#666' }}>Loading question sets...</Typography>
          </Box>
        ) : paginatedData.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
            <Typography color="textSecondary">No question sets found</Typography>
          </Paper>
        ) : isMobile ? (
          /* Mobile Card View */
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {paginatedData.map((questionSet) => (
              <Card key={questionSet.id} sx={{ borderRadius: 2, border: '1px solid #e0e0e0', boxShadow: 'none' }}>
                <CardContent sx={{ p: 2 }}>
                  {/* Header with Avatar and Status */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar sx={{ width: 40, height: 40, backgroundColor: '#f59e0b', color: '#fff', fontSize: '1rem' }}>
                        {(questionSet.candidate_name || 'U').charAt(0).toUpperCase()}
                      </Avatar>
                      <Box>
                        <Typography sx={{ fontWeight: 600, color: '#1e293b', fontSize: '14px' }}>
                          {questionSet.candidate_name || 'Unknown Candidate'}
                        </Typography>
                        <Typography sx={{ color: '#64748b', fontSize: '12px' }}>
                          {questionSet.job_title || 'Unknown Position'}
                        </Typography>
                      </Box>
                    </Box>
                    {getStatusChip(questionSet.status)}
                  </Box>

                  {/* Details Grid */}
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2 }}>
                    <Box>
                      <Typography sx={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                        Experience
                      </Typography>
                      <Typography sx={{ fontSize: '13px', color: '#1e293b' }}>
                        {questionSet.experience || '2+ years'}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                        Skills
                      </Typography>
                      <Typography sx={{ fontSize: '13px', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {questionSet.main_topics?.join(', ') || 'Engineering'}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Email */}
                  <Box sx={{ mb: 2 }}>
                    <Typography sx={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                      Email
                    </Typography>
                    <Typography sx={{ fontSize: '13px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {questionSet.candidate_email || 'No email provided'}
                    </Typography>
                  </Box>

                  {/* Actions */}
                  <Box sx={{ display: 'flex', gap: 1, pt: 1, borderTop: '1px solid #f1f5f9' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<VisibilityIcon />}
                      onClick={() => handleViewQuestions(questionSet)}
                      sx={{
                        flex: 1,
                        textTransform: 'none',
                        borderColor: questionSet.status === 'pending' ? '#f59e0b' : '#16a34a',
                        color: questionSet.status === 'pending' ? '#f59e0b' : '#16a34a',
                        fontSize: '12px',
                        '&:hover': {
                          borderColor: questionSet.status === 'pending' ? '#d97706' : '#15803d',
                          backgroundColor: questionSet.status === 'pending' ? '#fef3c7' : '#dcfce7'
                        }
                      }}
                    >
                      {questionSet.status === 'pending' ? 'Review' : 'View'}
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        ) : (
          /* Desktop Table View */
          <Paper elevation={0} sx={{ borderRadius: 2, overflow: 'hidden', border: '1px solid #e0e0e0' }}>
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#fafafa' }}>
                    <TableCell
                      sx={{
                        fontWeight: 600,
                        color: sortField === 'experience' ? '#d97706' : '#666',
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        userSelect: 'none',
                        backgroundColor: sortField === 'experience' ? 'rgba(217, 119, 6, 0.05)' : 'transparent',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          color: '#d97706',
                          backgroundColor: 'rgba(217, 119, 6, 0.1)'
                        }
                      }}
                      onClick={() => handleSort('experience')}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        Experience
                        {renderSortIcon('experience')}
                      </Box>
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 600,
                        color: sortField === 'candidate_name' ? '#d97706' : '#666',
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        userSelect: 'none',
                        backgroundColor: sortField === 'candidate_name' ? 'rgba(217, 119, 6, 0.05)' : 'transparent',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          color: '#d97706',
                          backgroundColor: 'rgba(217, 119, 6, 0.1)'
                        }
                      }}
                      onClick={() => handleSort('candidate_name')}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        Candidate
                        {renderSortIcon('candidate_name')}
                      </Box>
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 600,
                        color: sortField === 'candidate_email' ? '#d97706' : '#666',
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        userSelect: 'none',
                        display: { xs: 'none', lg: 'table-cell' },
                        backgroundColor: sortField === 'candidate_email' ? 'rgba(217, 119, 6, 0.05)' : 'transparent',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          color: '#d97706',
                          backgroundColor: 'rgba(217, 119, 6, 0.1)'
                        }
                      }}
                      onClick={() => handleSort('candidate_email')}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        Email
                        {renderSortIcon('candidate_email')}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#666', fontSize: '0.875rem', display: { xs: 'none', lg: 'table-cell' } }}>Location</TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 600,
                        color: sortField === 'skills' ? '#d97706' : '#666',
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        userSelect: 'none',
                        backgroundColor: sortField === 'skills' ? 'rgba(217, 119, 6, 0.05)' : 'transparent',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          color: '#d97706',
                          backgroundColor: 'rgba(217, 119, 6, 0.1)'
                        }
                      }}
                      onClick={() => handleSort('skills')}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        Skills
                        {renderSortIcon('skills')}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#666', fontSize: '0.875rem' }}>
                      Status
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#666', fontSize: '0.875rem' }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedData.map((questionSet) => (
                    <TableRow key={questionSet.id} sx={{ '&:hover': { backgroundColor: '#fafafa' } }}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500, color: '#333' }}>
                          {questionSet.experience || '2+ years'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Avatar sx={{ width: 32, height: 32, backgroundColor: '#e0e0e0', color: '#666', fontSize: '0.875rem' }}>
                            {(questionSet.candidate_name || 'U').charAt(0).toUpperCase()}
                          </Avatar>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500, color: '#333' }}>
                              {questionSet.candidate_name || 'Unknown Candidate'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#666' }}>
                              {questionSet.job_title || 'Unknown Position'}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>
                        <Typography variant="body2" sx={{ color: '#666' }}>
                          {questionSet.candidate_email || 'No email provided'}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Box sx={{ width: 4, height: 4, backgroundColor: '#4caf50', borderRadius: '50%' }} />
                          <Typography variant="body2" sx={{ color: '#666' }}>
                            New York
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: '#666' }}>
                          {questionSet.main_topics?.join(', ') || 'Engineering'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {getStatusChip(questionSet.status)}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                          <IconButton
                            size="small"
                            onClick={() => handleViewQuestions(questionSet)}
                            title={questionSet.status === 'pending' ? 'Review Questions' : 'View Questions'}
                            sx={{
                              color: questionSet.status === 'pending' ? '#f59e0b' : questionSet.status === 'approved' ? '#16a34a' : '#64748b',
                              border: '1px solid',
                              borderColor: questionSet.status === 'pending' ? '#f59e0b40' : questionSet.status === 'approved' ? '#16a34a40' : '#64748b40',
                              '&:hover': {
                                background: questionSet.status === 'pending' ? '#f59e0b10' : questionSet.status === 'approved' ? '#16a34a10' : '#64748b10'
                              }
                            }}
                          >
                            <VisibilityIcon fontSize="small" />
                          </IconButton>

                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        {/* Pagination */}
        <Paper sx={{ mt: 2, borderRadius: 2, overflow: 'hidden' }}>
          <TablePagination
            rowsPerPageOptions={isMobile ? [5, 10] : [5, 10, 25, 50]}
            component="div"
            count={sortedQuestionSets.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            labelRowsPerPage={isMobile ? "Per page:" : "Rows per page:"}
            sx={{
              flexShrink: 0,
              backgroundColor: '#fff',
              '.MuiTablePagination-toolbar': {
                flexWrap: 'wrap',
                justifyContent: isMobile ? 'center' : 'flex-end',
                padding: isMobile ? '8px' : '8px 16px',
                gap: isMobile ? 1 : 0,
              },
              '.MuiTablePagination-selectLabel': {
                color: '#64748b',
                fontWeight: 500,
                fontSize: isMobile ? '12px' : '14px',
              },
              '.MuiTablePagination-displayedRows': {
                color: '#64748b',
                fontWeight: 500,
                fontSize: isMobile ? '12px' : '14px',
              },
              '.MuiTablePagination-select': {
                fontWeight: 500,
              },
              '.MuiTablePagination-actions': {
                marginLeft: isMobile ? 0 : 2,
              }
            }}
          />
        </Paper>
      </Box>

      {/* Filter Modal */}
      <Dialog
        open={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' } }}
      >
        <DialogTitle sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px', borderBottom: '1px solid #f1f5f9',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: '10px',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FilterIcon sx={{ color: '#fff', fontSize: 20 }} />
            </Box>
            <Typography sx={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
              Filter Questions
            </Typography>
          </Box>
          <IconButton onClick={() => setFilterModalOpen(false)} size="small">
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ padding: '24px !important', display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box>
            <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#475569', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <i className="fas fa-briefcase" style={{ color: '#f59e0b', fontSize: 12 }}></i>
              Job Position
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={filterJob}
                onChange={(e) => { setFilterJob(e.target.value); setPage(0); }}
                sx={{
                  borderRadius: '10px',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#f59e0b' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#f59e0b' },
                }}
              >
                <MenuItem value="all">All Jobs</MenuItem>
                {uniqueJobs.map((job) => (
                  <MenuItem key={job} value={job}>{job}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box>
            <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#475569', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <i className="fas fa-user" style={{ color: '#f59e0b', fontSize: 12 }}></i>
              Candidate Name
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={filterCandidate}
                onChange={(e) => { setFilterCandidate(e.target.value); setPage(0); }}
                sx={{
                  borderRadius: '10px',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#f59e0b' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#f59e0b' },
                }}
              >
                <MenuItem value="all">All Candidates</MenuItem>
                {uniqueCandidates.map((name) => (
                  <MenuItem key={name} value={name}>{name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box>
            <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#475569', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <i className="fas fa-flag" style={{ color: '#f59e0b', fontSize: 12 }}></i>
              Status
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}
                sx={{
                  borderRadius: '10px',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#f59e0b' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#f59e0b' },
                }}
              >
                <MenuItem value="all">All Status</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="approved">Approved</MenuItem>
                <MenuItem value="rejected">Rejected</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>

        <DialogActions sx={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', gap: 1.5 }}>
          <Button
            onClick={() => { setFilterJob('all'); setFilterCandidate('all'); setFilterStatus('all'); setPage(0); }}
            sx={{
              textTransform: 'none', fontWeight: 600, fontSize: '14px',
              color: '#64748b', borderRadius: '10px', padding: '8px 20px',
              '&:hover': { background: '#f1f5f9' },
            }}
          >
            Clear All
          </Button>
          <Button
            variant="contained"
            onClick={() => setFilterModalOpen(false)}
            sx={{
              textTransform: 'none', fontWeight: 600, fontSize: '14px',
              borderRadius: '10px', padding: '8px 24px',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              boxShadow: '0 4px 12px rgba(245,158,11,0.3)',
              '&:hover': { background: 'linear-gradient(135deg, #d97706, #b45309)' },
            }}
          >
            Apply Filters
          </Button>
        </DialogActions>
      </Dialog>
    </Navigation>
  );
};

export default ExpertReview;