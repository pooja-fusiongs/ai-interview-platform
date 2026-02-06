import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../layout/sidebar';
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
  Pagination,
  CircularProgress
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon,
  Visibility as VisibilityIcon
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
  const [questionSets, setQuestionSets] = useState<QuestionSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [rowsPerPage] = useState(5);
  
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

  const handleApproveSet = async (setId: string) => {
    try {
      // Find the question set
      const questionSet = questionSets.find(set => set.id === setId);
      if (!questionSet) return;
      
      // Approve all questions in the set
      const questions = await questionGenerationService.getCandidateQuestions(
        questionSet.job_id, 
        questionSet.application_id
      );
      
      // Update each question to approved
      for (const question of questions) {
        await questionGenerationService.expertReviewQuestion({
          question_id: question.id,
          is_approved: true,
          expert_notes: 'Approved by expert review'
        });
      }
      
      // Update local state
      setQuestionSets(prev => 
        prev.map(set => 
          set.id === setId ? { ...set, status: 'approved' } : set
        )
      );
      toast.success('Question set approved successfully!');
    } catch (error) {
      console.error('Error approving question set:', error);
      toast.error('Failed to approve question set');
    }
  };

  const handleRejectSet = async (setId: string) => {
    try {
      // Find the question set
      const questionSet = questionSets.find(set => set.id === setId);
      if (!questionSet) return;
      
      // Reject all questions in the set
      const questions = await questionGenerationService.getCandidateQuestions(
        questionSet.job_id, 
        questionSet.application_id
      );
      
      // Update each question to rejected
      for (const question of questions) {
        await questionGenerationService.expertReviewQuestion({
          question_id: question.id,
          is_approved: false,
          expert_notes: 'Rejected by expert review'
        });
      }
      
      // Update local state
      setQuestionSets(prev => 
        prev.map(set => 
          set.id === setId ? { ...set, status: 'rejected' } : set
        )
      );
      toast.success('Question set rejected');
    } catch (error) {
      console.error('Error rejecting question set:', error);
      toast.error('Failed to reject question set');
    }
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

  const filteredQuestionSets = (questionSets || []).filter((set: QuestionSet) => {
    const jobTitle = set?.job_title || '';
    const candidateName = set?.candidate_name || '';
    const candidateEmail = set?.candidate_email || '';
    
    const matchesSearch = jobTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         candidateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         candidateEmail.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
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
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  const handlePageChange = (_event: React.ChangeEvent<unknown>, value: number) => {
    setPage(value);
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
            onChange={(e) => setSearchTerm(e.target.value)}
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
            sx={{
              borderColor: '#ff9800',
              color: '#ff9800',
              borderRadius: 2,
              textTransform: 'none',
              width: { xs: '100%', sm: 'auto' },
              '&:hover': {
                borderColor: '#f57c00',
                backgroundColor: '#fff3e0'
              }
            }}
          >
            Filter
          </Button>
        </Box>

        {/* Table */}
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
                  <TableCell sx={{ fontWeight: 600, color: '#666', fontSize: '0.875rem' }}>Location</TableCell>
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
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ textAlign: 'center', py: 4 }}>
                      <CircularProgress size={24} />
                      <Typography variant="body2" sx={{ mt: 1, color: '#666' }}>
                        Loading question sets...
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : paginatedData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ textAlign: 'center', py: 4 }}>
                      <Typography variant="body2" color="textSecondary">
                        No question sets found
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedData.map((questionSet) => {
                    return (
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
                        <TableCell>
                          <Typography variant="body2" sx={{ color: '#666' }}>
                            {questionSet.candidate_email || 'No email provided'}
                          </Typography>
                        </TableCell>
                        <TableCell>
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
                            {questionSet.status === 'pending' && (
                              <>
                                <IconButton
                                  size="small"
                                  sx={{
                                    color: '#4caf50',
                                    border: '1px solid #4caf5040',
                                    '&:hover': { background: '#4caf5010' }
                                  }}
                                  onClick={() => handleApproveSet(questionSet.id)}
                                  title="Approve All"
                                >
                                  <ThumbUpIcon fontSize="small" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  sx={{
                                    color: '#f44336',
                                    border: '1px solid #f4433640',
                                    '&:hover': { background: '#f4433610' }
                                  }}
                                  onClick={() => handleRejectSet(questionSet.id)}
                                  title="Reject All"
                                >
                                  <ThumbDownIcon fontSize="small" />
                                </IconButton>
                              </>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* Pagination */}
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination
            count={Math.ceil(sortedQuestionSets.length / rowsPerPage)}
            page={page}
            onChange={handlePageChange}
            color="primary"
            sx={{
              '& .MuiPaginationItem-root': {
                borderRadius: 1,
              },
              '& .Mui-selected': {
                backgroundColor: '#1976d2 !important',
                color: 'white',
              },
            }}
          />
        </Box>
      </Box>
    </Navigation>
  );
};

export default ExpertReview;