import React, { useState } from 'react';
import {
  Box, Typography, TextField, Button, Card, CardContent, Grid,
  CircularProgress, Alert, Chip
} from '@mui/material';
import { Search } from '@mui/icons-material';
import Naivgation from '../layout/Sidebar';
import feedbackService from '../../services/feedbackService';

interface FeedbackEntry {
  id: number;
  job_id: number;
  hire_date: string;
  job_performance: number;
  cultural_fit: number;
  technical_skills: number;
  communication: number;
  leadership: number;
  still_employed: boolean;
}

const PerformanceTracker: React.FC = () => {
  const [candidateId, setCandidateId] = useState('');
  const [feedbacks, setFeedbacks] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const handleFetch = async () => {
    if (!candidateId) {
      setError('Please enter a candidate ID');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await feedbackService.getCandidateFeedback(Number(candidateId));
      setFeedbacks(data);
      setSearched(true);
    } catch {
      setError('Failed to load candidate feedback');
    } finally {
      setLoading(false);
    }
  };

  const avgScore = (fb: FeedbackEntry) => {
    return ((fb.job_performance + fb.cultural_fit + fb.technical_skills + fb.communication + fb.leadership) / 5).toFixed(1);
  };

  const getScoreColor = (score: number): 'success' | 'warning' | 'error' => {
    if (score >= 7) return 'success';
    if (score >= 4) return 'warning';
    return 'error';
  };

  return (
    <Naivgation>
      <Box component="main" sx={{ flexGrow: 1, p: 3, overflow: 'auto', bgcolor: '#f5f5f5' }}>
        <Typography variant="h4" sx={{ mb: 3 }}>Performance Tracker</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
        <Box sx={{ display: 'flex', gap: 2, mb: 4 }}>
          <TextField
            label="Candidate ID"
            type="number"
            value={candidateId}
            onChange={e => setCandidateId(e.target.value)}
            size="small"
            sx={{ width: 250 }}
          />
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <Search />}
            onClick={handleFetch}
            disabled={loading}
          >
            Fetch Feedback
          </Button>
        </Box>
        {searched && feedbacks.length === 0 && (
          <Typography color="text.secondary" sx={{ mt: 2 }}>No feedback entries found for this candidate.</Typography>
        )}
        <Grid container spacing={3}>
          {feedbacks.map(fb => (
            <Grid item xs={12} md={6} key={fb.id}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h6">Feedback #{fb.id}</Typography>
                    <Chip
                      label={fb.still_employed ? 'Active' : 'Left'}
                      color={fb.still_employed ? 'success' : 'default'}
                      size="small"
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Job #{fb.job_id} | Hired: {new Date(fb.hire_date).toLocaleDateString()}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                    <Chip label={`Performance: ${fb.job_performance}`} size="small" color={getScoreColor(fb.job_performance)} variant="outlined" />
                    <Chip label={`Cultural Fit: ${fb.cultural_fit}`} size="small" color={getScoreColor(fb.cultural_fit)} variant="outlined" />
                    <Chip label={`Technical: ${fb.technical_skills}`} size="small" color={getScoreColor(fb.technical_skills)} variant="outlined" />
                    <Chip label={`Communication: ${fb.communication}`} size="small" color={getScoreColor(fb.communication)} variant="outlined" />
                    <Chip label={`Leadership: ${fb.leadership}`} size="small" color={getScoreColor(fb.leadership)} variant="outlined" />
                  </Box>
                  <Typography variant="body1" fontWeight="bold">
                    Average: <Chip label={avgScore(fb)} color={getScoreColor(Number(avgScore(fb)))} size="small" />
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    </Naivgation>
  );
};

export default PerformanceTracker;
