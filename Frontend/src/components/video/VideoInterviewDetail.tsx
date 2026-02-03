import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Typography, Paper, Grid, Chip, CircularProgress, Alert,
  TextField, Button, Link
} from '@mui/material';
import Naivgation from '../layout/sidebar';
import videoInterviewService from '../../services/videoInterviewService';

const VideoInterviewDetail: React.FC = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const [interview, setInterview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const fetchInterview = async () => {
      try {
        const data = await videoInterviewService.getInterview(Number(videoId));
        setInterview(data);
        setNotes(data.notes || '');
      } catch (err: any) {
        setError(err.message || 'Failed to load interview details.');
      } finally {
        setLoading(false);
      }
    };
    if (videoId) fetchInterview();
  }, [videoId]);

  const handleSaveNotes = async () => {
    try {
      await videoInterviewService.updateNotes(Number(videoId), notes);
    } catch {
      setError('Failed to save notes.');
    }
  };

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
      <Box component="main" sx={{ flexGrow: 1, p: 3, overflow: 'auto', bgcolor: '#f5f5f5' }}>
        <Typography variant="h4" gutterBottom>Interview Detail #{videoId}</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {interview && (
          <>
            <Grid container spacing={3} sx={{ mb: 3 }}>
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom>Schedule Info</Typography>
                  <Typography>Scheduled: {new Date(interview.scheduled_at).toLocaleString()}</Typography>
                  <Typography>Duration: {interview.duration_minutes} minutes</Typography>
                  <Typography>Status: <Chip label={interview.status} size="small" sx={{ ml: 1 }} /></Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom>Zoom Meeting</Typography>
                  {interview.zoom_meeting_link ? (
                    <Link href={interview.zoom_meeting_link} target="_blank">{interview.zoom_meeting_link}</Link>
                  ) : (
                    <Typography color="text.secondary">No meeting link available</Typography>
                  )}
                </Paper>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom>Candidate</Typography>
                  <Typography>ID: {interview.candidate_id}</Typography>
                  <Typography>Name: {interview.candidate_name || 'N/A'}</Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom>Interviewer</Typography>
                  <Typography>ID: {interview.interviewer_id || 'N/A'}</Typography>
                  <Typography>Name: {interview.interviewer_name || 'N/A'}</Typography>
                </Paper>
              </Grid>
            </Grid>
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>Notes</Typography>
              <TextField multiline rows={4} fullWidth value={notes}
                onChange={(e) => setNotes(e.target.value)} placeholder="Add interview notes..." />
              <Button variant="contained" sx={{ mt: 2 }} onClick={handleSaveNotes}>Save Notes</Button>
            </Paper>
            <Button variant="outlined" href={`/fraud-analysis/${videoId}`}>
              View Fraud Analysis
            </Button>
          </>
        )}
      </Box>
    </Naivgation>
  );
};

export default VideoInterviewDetail;
