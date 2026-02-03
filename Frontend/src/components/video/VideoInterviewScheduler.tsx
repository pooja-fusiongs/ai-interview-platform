import React, { useState } from 'react';
import {
  Box, Typography, TextField, Button, Select, MenuItem, FormControl,
  InputLabel, Paper, Alert, CircularProgress, Link
} from '@mui/material';
import Sidebar from '../layout/sidebar';
import videoInterviewService from '../../services/videoInterviewService';

const VideoInterviewScheduler: React.FC = () => {
  const [jobId, setJobId] = useState<number | ''>('');
  const [candidateId, setCandidateId] = useState<number | ''>('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [duration, setDuration] = useState(30);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<any>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobId || !candidateId || !scheduledAt) {
      setError('All fields are required.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess(null);
    try {
      const result = await videoInterviewService.scheduleInterview({
        job_id: Number(jobId),
        candidate_id: Number(candidateId),
        scheduled_at: scheduledAt,
        duration_minutes: duration,
      });
      setSuccess(result);
    } catch (err: any) {
      setError(err.message || 'Failed to schedule interview.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <Sidebar />
      <Box component="main" sx={{ flexGrow: 1, p: 3, overflow: 'auto', bgcolor: '#f5f5f5' }}>
        <Typography variant="h4" gutterBottom>Schedule Video Interview</Typography>
        <Paper sx={{ p: 4, maxWidth: 600 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Interview scheduled successfully!
              {success.meeting_link && (
                <Box sx={{ mt: 1 }}>
                  Meeting Link: <Link href={success.meeting_link} target="_blank">{success.meeting_link}</Link>
                </Box>
              )}
            </Alert>
          )}
          <form onSubmit={handleSubmit}>
            <TextField label="Job ID" type="number" fullWidth sx={{ mb: 2 }}
              value={jobId} onChange={(e) => setJobId(e.target.value ? Number(e.target.value) : '')} required />
            <TextField label="Candidate ID" type="number" fullWidth sx={{ mb: 2 }}
              value={candidateId} onChange={(e) => setCandidateId(e.target.value ? Number(e.target.value) : '')} required />
            <TextField label="Scheduled At" type="datetime-local" fullWidth sx={{ mb: 2 }}
              value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
              InputLabelProps={{ shrink: true }} required />
            <FormControl fullWidth sx={{ mb: 3 }}>
              <InputLabel>Duration (minutes)</InputLabel>
              <Select value={duration} label="Duration (minutes)" onChange={(e) => setDuration(Number(e.target.value))}>
                <MenuItem value={30}>30 minutes</MenuItem>
                <MenuItem value={45}>45 minutes</MenuItem>
                <MenuItem value={60}>60 minutes</MenuItem>
                <MenuItem value={90}>90 minutes</MenuItem>
              </Select>
            </FormControl>
            <Button type="submit" variant="contained" size="large" disabled={loading} fullWidth>
              {loading ? <CircularProgress size={24} /> : 'Schedule Interview'}
            </Button>
          </form>
        </Paper>
      </Box>
    </Box>
  );
};

export default VideoInterviewScheduler;
