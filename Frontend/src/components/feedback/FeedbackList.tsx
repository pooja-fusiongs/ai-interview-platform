import React, { useState, useEffect } from 'react';
import {
  Box, Typography, TextField, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, Button, CircularProgress, Alert, Grid
} from '@mui/material';
import { Visibility } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../layout/sidebar';
import feedbackService from '../../services/feedbackService';

interface Feedback {
  id: number;
  candidate_id: number;
  job_id: number;
  overall_score: number;
  hire_date: string;
  still_employed: boolean;
}

const FeedbackList: React.FC = () => {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterJobId, setFilterJobId] = useState('');
  const [filterCandidateId, setFilterCandidateId] = useState('');
  const navigate = useNavigate();

  const fetchFeedbacks = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterJobId) params.job_id = Number(filterJobId);
      if (filterCandidateId) params.candidate_id = Number(filterCandidateId);
      const data = await feedbackService.getFeedbacks(params);
      setFeedbacks(data);
    } catch {
      setError('Failed to load feedback entries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedbacks();
  }, []);

  const getScoreColor = (score: number): 'success' | 'warning' | 'error' => {
    if (score >= 7) return 'success';
    if (score >= 4) return 'warning';
    return 'error';
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <Sidebar />
      <Box component="main" sx={{ flexGrow: 1, p: 3, overflow: 'auto', bgcolor: '#f5f5f5' }}>
        <Typography variant="h4" sx={{ mb: 3 }}>Hire Feedback Records</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
        <Paper sx={{ p: 2, mb: 3 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={3}>
              <TextField label="Filter by Job ID" size="small" fullWidth value={filterJobId} onChange={e => setFilterJobId(e.target.value)} />
            </Grid>
            <Grid item xs={3}>
              <TextField label="Filter by Candidate ID" size="small" fullWidth value={filterCandidateId} onChange={e => setFilterCandidateId(e.target.value)} />
            </Grid>
            <Grid item xs={2}>
              <Button variant="contained" onClick={fetchFeedbacks}>Apply Filters</Button>
            </Grid>
          </Grid>
        </Paper>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Candidate</TableCell>
                  <TableCell>Job</TableCell>
                  <TableCell>Score</TableCell>
                  <TableCell>Hire Date</TableCell>
                  <TableCell>Employed</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {feedbacks.map(fb => (
                  <TableRow key={fb.id}>
                    <TableCell>{fb.id}</TableCell>
                    <TableCell>Candidate #{fb.candidate_id}</TableCell>
                    <TableCell>Job #{fb.job_id}</TableCell>
                    <TableCell>
                      <Chip label={fb.overall_score?.toFixed(1) ?? 'N/A'} color={getScoreColor(fb.overall_score)} size="small" />
                    </TableCell>
                    <TableCell>{fb.hire_date ? new Date(fb.hire_date).toLocaleDateString() : '-'}</TableCell>
                    <TableCell>
                      <Chip label={fb.still_employed ? 'Active' : 'Left'} color={fb.still_employed ? 'success' : 'default'} size="small" />
                    </TableCell>
                    <TableCell>
                      <Button size="small" startIcon={<Visibility />} onClick={() => navigate(`/feedback/${fb.id}`)}>View</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {feedbacks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center">No feedback records found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Box>
  );
};

export default FeedbackList;
