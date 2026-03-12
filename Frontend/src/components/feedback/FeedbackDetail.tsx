import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, LinearProgress, CircularProgress, Alert, IconButton, Avatar,
} from '@mui/material';
// import Grid from '@mui/material/Unstable_Grid2';
import Grid from '@mui/material/Grid';
import { useParams, useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PersonIcon from '@mui/icons-material/Person';
import WorkIcon from '@mui/icons-material/Work';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import StarIcon from '@mui/icons-material/Star';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import Naivgation from '../layout/Sidebar';
import feedbackService from '../../services/feedbackService';

interface FeedbackData {
  id: number;
  candidate_id: number;
  job_id: number;
  session_id?: number;
  submitted_by: number;
  hire_date: string;
  feedback_date?: string;
  overall_performance_score: number;
  technical_competence_score: number | null;
  cultural_fit_score: number | null;
  communication_score: number | null;
  initiative_score: number | null;
  strengths_observed: string | null;
  areas_for_improvement: string | null;
  comments: string | null;
  still_employed: boolean;
  left_reason: string | null;
  would_rehire: boolean | null;
  candidate_name?: string;
  job_title?: string;
  submitter_name?: string;
}

const scoreColor = (value: number): string => {
  if (value >= 7.5) return '#4caf50';
  if (value >= 5) return '#ff9800';
  return '#f44336';
};

const scoreLabel = (value: number): string => {
  if (value >= 8.5) return 'Excellent';
  if (value >= 7) return 'Good';
  if (value >= 5) return 'Average';
  if (value >= 3) return 'Below Average';
  return 'Poor';
};

const ScoreCard = ({ label, value, icon }: { label: string; value: number | null; icon: React.ReactNode }) => {
  const score = value ?? 0;
  const color = scoreColor(score);
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: '#fff',
        transition: 'box-shadow 0.2s',
        '&:hover': { boxShadow: '0 4px 20px rgba(0,0,0,0.08)' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Avatar sx={{ bgcolor: `${color}18`, width: 36, height: 36 }}>
          {React.cloneElement(icon as React.ReactElement, { sx: { fontSize: 18, color } })}
        </Avatar>
        <Typography variant="body2" fontWeight={600} color="text.secondary">
          {label}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.5 }}>
        <Typography variant="h4" fontWeight={700} sx={{ color, lineHeight: 1 }}>
          {score.toFixed(1)}
        </Typography>
        <Typography variant="body2" color="text.secondary">/10</Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={(score / 10) * 100}
        sx={{
          height: 6,
          borderRadius: 3,
          bgcolor: `${color}18`,
          '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 3 },
          mb: 1,
        }}
      />
      <Typography variant="caption" sx={{ color, fontWeight: 600 }}>
        {scoreLabel(score)}
      </Typography>
    </Paper>
  );
};

const FeedbackDetail: React.FC = () => {
  const { feedbackId } = useParams<{ feedbackId: string }>();
  const navigate = useNavigate();
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

  if (loading) {
    return (
      <Naivgation>
        <Box component="main" sx={{ flexGrow: 1, p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: '#f5f7fa', minHeight: '100vh' }}>
          <CircularProgress />
        </Box>
      </Naivgation>
    );
  }

  const avgScore = feedback
    ? [
        feedback.overall_performance_score,
        feedback.technical_competence_score,
        feedback.cultural_fit_score,
        feedback.communication_score,
        feedback.initiative_score,
      ].filter((s): s is number => s !== null && s !== undefined).reduce((a, b) => a + b, 0) /
      [
        feedback.overall_performance_score,
        feedback.technical_competence_score,
        feedback.cultural_fit_score,
        feedback.communication_score,
        feedback.initiative_score,
      ].filter((s): s is number => s !== null && s !== undefined).length
    : 0;

  return (
    <Naivgation>
      <Box component="main" sx={{ flexGrow: 1, p: { xs: '16px', sm: 2, md: 3 }, overflow: 'auto', bgcolor: '#f5f7fa', minHeight: '100vh' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <IconButton
            onClick={() => navigate('/feedback-list')}
            sx={{
              bgcolor: '#fff',
              border: '1px solid',
              borderColor: 'divider',
              '&:hover': { bgcolor: '#f0f0f0' },
            }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Typography variant="h5" fontWeight={700} sx={{ fontSize: { xs: '18px', md: '24px' } }}>
              Post-Hire Feedback Report
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Feedback #{feedbackId} {feedback?.feedback_date ? `· Submitted ${new Date(feedback.feedback_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
            </Typography>
          </Box>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

        {feedback && (
          <>
            {/* Info Cards Row */}
            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
              <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
                <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Avatar sx={{ bgcolor: '#e3f2fd', width: 44, height: 44 }}>
                    <PersonIcon sx={{ color: '#1976d2' }} />
                  </Avatar>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Candidate</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {feedback.candidate_name || `Candidate #${feedback.candidate_id}`}
                    </Typography>
                  </Box>
                </Paper>
              </Box>
              <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
                <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 2, height: '100%' }}>
                  <Avatar sx={{ bgcolor: '#f3e5f5', width: 44, height: 44 }}>
                    <WorkIcon sx={{ color: '#9c27b0' }} />
                  </Avatar>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Position</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {feedback.job_title || `Job #${feedback.job_id}`}
                    </Typography>
                  </Box>
                </Paper>
              </Box>
              <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
                <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 2, height: '100%' }}>
                  <Avatar sx={{ bgcolor: '#e8f5e9', width: 44, height: 44 }}>
                    <CalendarTodayIcon sx={{ color: '#4caf50' }} />
                  </Avatar>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Hire Date</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {new Date(feedback.hire_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Typography>
                  </Box>
                </Paper>
              </Box>
              <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
                <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 2, height: '100%' }}>
                  <Avatar sx={{ bgcolor: '#fff3e0', width: 44, height: 44 }}>
                    <TrendingUpIcon sx={{ color: '#ff9800' }} />
                  </Avatar>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Average Score</Typography>
                    <Typography variant="body2" fontWeight={600} sx={{ color: scoreColor(avgScore) }}>
                      {avgScore.toFixed(1)}/10 · {scoreLabel(avgScore)}
                    </Typography>
                  </Box>
                </Paper>
              </Box>
            </Box>

            {/* Performance Scores */}
            <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, mb: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                <StarIcon sx={{ color: '#ff9800', fontSize: 22 }} />
                <Typography variant="h6" fontWeight={700} sx={{ fontSize: { xs: '16px', md: '18px' } }}>
                  Performance Scores
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Box sx={{ flex: '1 1 180px', minWidth: 0 }}>
                  <ScoreCard label="Overall Performance" value={feedback.overall_performance_score} icon={<TrendingUpIcon />} />
                </Box>
                <Box sx={{ flex: '1 1 180px', minWidth: 0 }}>
                  <ScoreCard label="Technical Competence" value={feedback.technical_competence_score} icon={<WorkIcon />} />
                </Box>
                <Box sx={{ flex: '1 1 180px', minWidth: 0 }}>
                  <ScoreCard label="Cultural Fit" value={feedback.cultural_fit_score} icon={<PersonIcon />} />
                </Box>
                <Box sx={{ flex: '1 1 180px', minWidth: 0 }}>
                  <ScoreCard label="Communication" value={feedback.communication_score} icon={<ChatBubbleOutlineIcon />} />
                </Box>
                <Box sx={{ flex: '1 1 180px', minWidth: 0 }}>
                  <ScoreCard label="Initiative & Leadership" value={feedback.initiative_score} icon={<LightbulbIcon />} />
                </Box>
              </Box>
            </Paper>

            {/* Qualitative Feedback */}
            <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, mb: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 3, fontSize: { xs: '16px', md: '18px' } }}>
                Qualitative Feedback
              </Typography>

              {/* Strengths */}
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <ThumbUpIcon sx={{ fontSize: 18, color: '#4caf50' }} />
                  <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#4caf50' }}>
                    Strengths Observed
                  </Typography>
                </Box>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: '#f1f8e9',
                    borderColor: '#c5e1a5',
                  }}
                >
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                    {feedback.strengths_observed || 'No strengths noted'}
                  </Typography>
                </Paper>
              </Box>

              {/* Areas for Improvement */}
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <LightbulbIcon sx={{ fontSize: 18, color: '#ff9800' }} />
                  <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#ff9800' }}>
                    Areas for Improvement
                  </Typography>
                </Box>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: '#fff8e1',
                    borderColor: '#ffe082',
                  }}
                >
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                    {feedback.areas_for_improvement || 'No areas noted'}
                  </Typography>
                </Paper>
              </Box>

              {/* Comments */}
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <ChatBubbleOutlineIcon sx={{ fontSize: 18, color: '#1976d2' }} />
                  <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#1976d2' }}>
                    Additional Comments
                  </Typography>
                </Box>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: '#e3f2fd',
                    borderColor: '#90caf9',
                  }}
                >
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                    {feedback.comments || 'No additional comments'}
                  </Typography>
                </Paper>
              </Box>
            </Paper>

            {/* Employment Status */}
            <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 3, fontSize: { xs: '16px', md: '18px' } }}>
                Employment Status
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Box sx={{
                    display: 'flex', alignItems: 'center', gap: 2, p: 2,
                    borderRadius: 2, bgcolor: feedback.still_employed ? '#e8f5e9' : '#fbe9e7',
                  }}>
                    {feedback.still_employed
                      ? <CheckCircleIcon sx={{ color: '#4caf50', fontSize: 28 }} />
                      : <CancelIcon sx={{ color: '#f44336', fontSize: 28 }} />
                    }
                    <Box>
                      <Typography variant="caption" color="text.secondary">Status</Typography>
                      <Typography variant="body2" fontWeight={700}>
                        {feedback.still_employed ? 'Currently Employed' : 'No Longer Employed'}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Box sx={{
                    display: 'flex', alignItems: 'center', gap: 2, p: 2,
                    borderRadius: 2, bgcolor: feedback.would_rehire ? '#e3f2fd' : '#fff3e0',
                  }}>
                    {feedback.would_rehire
                      ? <ThumbUpIcon sx={{ color: '#1976d2', fontSize: 28 }} />
                      : <CancelIcon sx={{ color: '#ff9800', fontSize: 28 }} />
                    }
                    <Box>
                      <Typography variant="caption" color="text.secondary">Rehire</Typography>
                      <Typography variant="body2" fontWeight={700}>
                        {feedback.would_rehire ? 'Would Rehire' : 'Would Not Rehire'}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
                {!feedback.still_employed && feedback.left_reason && (
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, borderRadius: 2, bgcolor: '#fafafa' }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Reason for Leaving</Typography>
                        <Typography variant="body2" fontWeight={600}>{feedback.left_reason}</Typography>
                      </Box>
                    </Box>
                  </Grid>
                )}
              </Grid>

              {feedback.submitter_name && (
                <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="caption" color="text.secondary">
                    Submitted by <strong>{feedback.submitter_name}</strong>
                  </Typography>
                </Box>
              )}
            </Paper>
          </>
        )}
      </Box>
    </Naivgation>
  );
};

export default FeedbackDetail;
