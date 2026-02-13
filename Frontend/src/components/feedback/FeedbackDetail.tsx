import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, LinearProgress, Chip, CircularProgress, Alert,
  Grid, Divider
} from '@mui/material';
import { useParams } from 'react-router-dom';
import Naivgation from '../layout/Sidebar';
import feedbackService from '../../services/feedbackService';

interface FeedbackData {
  id: number;
  candidate_id: number;
  job_id: number;
  hire_date: string;
  job_performance: number;
  cultural_fit: number;
  technical_skills: number;
  communication: number;
  leadership: number;
  strengths: string;
  areas_for_improvement: string;
  comments: string;
  still_employed: boolean;
  left_reason: string | null;
  would_rehire: boolean;
}

const FeedbackDetail: React.FC = () => {
  const { feedbackId } = useParams<{ feedbackId: string }>();
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchFeedback = async () => {
      try {
        const data = await feedbackService.getFeedback(Number(feedbackId));
        setFeedback(data);
      } catch {
        setError('Failed to load feedback details');
      } finally {
        setLoading(false);
      }
    };
    fetchFeedback();
  }, [feedbackId]);

  const ScoreBar = ({ label, value }: { label: string; value: number }) => (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" fontWeight="bold">{value}/10</Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={(value / 10) * 100}
        sx={{ height: 10, borderRadius: 5 }}
        color={value >= 7 ? 'success' : value >= 4 ? 'warning' : 'error'}
      />
    </Box>
  );

  if (loading) {
    return (
      <Naivgation>
        <Box component="main" sx={{ flexGrow: 1, p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: '#f5f5f5' }}>
          <CircularProgress />
        </Box>
      </Naivgation>
    );
  }

  return (
    <Naivgation>
      <Box component="main" sx={{ flexGrow: 1, p: { xs: '12px', sm: 2, md: 3 }, overflow: 'auto', bgcolor: '#f5f5f5', minHeight: '100vh' }}>
        <Typography variant="h4" sx={{ mb: { xs: 2, md: 3 }, fontSize: { xs: '20px', sm: '24px', md: '28px' }, fontWeight: 600 }}>Feedback Detail #{feedbackId}</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {feedback && (
          <>
            <Paper sx={{ p: { xs: 2, md: 3 }, mb: { xs: 2, md: 3 } }}>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} sm={4}><Typography color="text.secondary" sx={{ fontSize: { xs: '13px', md: '14px' } }}>Candidate ID: <strong>{feedback.candidate_id}</strong></Typography></Grid>
                <Grid item xs={12} sm={4}><Typography color="text.secondary" sx={{ fontSize: { xs: '13px', md: '14px' } }}>Job ID: <strong>{feedback.job_id}</strong></Typography></Grid>
                <Grid item xs={12} sm={4}><Typography color="text.secondary" sx={{ fontSize: { xs: '13px', md: '14px' } }}>Hire Date: <strong>{new Date(feedback.hire_date).toLocaleDateString()}</strong></Typography></Grid>
              </Grid>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" sx={{ mb: 2 }}>Performance Scores</Typography>
              <ScoreBar label="Job Performance" value={feedback.job_performance} />
              <ScoreBar label="Cultural Fit" value={feedback.cultural_fit} />
              <ScoreBar label="Technical Skills" value={feedback.technical_skills} />
              <ScoreBar label="Communication" value={feedback.communication} />
              <ScoreBar label="Leadership" value={feedback.leadership} />
            </Paper>
            <Paper sx={{ p: { xs: 2, md: 3 }, mb: { xs: 2, md: 3 } }}>
              <Typography variant="h6" sx={{ mb: 2, fontSize: { xs: '16px', md: '18px' } }}>Qualitative Feedback</Typography>
              <Typography variant="subtitle2" color="primary">Strengths</Typography>
              <Typography sx={{ mb: 2 }}>{feedback.strengths || 'Not provided'}</Typography>
              <Typography variant="subtitle2" color="primary">Areas for Improvement</Typography>
              <Typography sx={{ mb: 2 }}>{feedback.areas_for_improvement || 'Not provided'}</Typography>
              <Typography variant="subtitle2" color="primary">Additional Comments</Typography>
              <Typography>{feedback.comments || 'Not provided'}</Typography>
            </Paper>
            <Paper sx={{ p: { xs: 2, md: 3 } }}>
              <Typography variant="h6" sx={{ mb: 2, fontSize: { xs: '16px', md: '18px' } }}>Employment Status</Typography>
              <Box sx={{ display: 'flex', gap: { xs: 1, md: 2 }, alignItems: 'center', flexWrap: 'wrap' }}>
                <Chip label={feedback.still_employed ? 'Currently Employed' : 'No Longer Employed'} color={feedback.still_employed ? 'success' : 'default'} />
                {!feedback.still_employed && feedback.left_reason && (
                  <Chip label={`Reason: ${feedback.left_reason}`} variant="outlined" />
                )}
                <Chip label={feedback.would_rehire ? 'Would Rehire' : 'Would Not Rehire'} color={feedback.would_rehire ? 'info' : 'warning'} />
              </Box>
            </Paper>
          </>
        )}
      </Box>
    </Naivgation>
  );
};

export default FeedbackDetail;
