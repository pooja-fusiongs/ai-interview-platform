import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Paper, Chip, IconButton, Tooltip, CircularProgress, Alert
} from '@mui/material';
import { Visibility, PlayArrow, Cancel } from '@mui/icons-material';
import Sidebar from '../layout/sidebar';
import videoInterviewService from '../../services/videoInterviewService';

const statusColorMap: Record<string, 'primary' | 'warning' | 'success' | 'error'> = {
  scheduled: 'primary',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'error',
};

const VideoInterviewList: React.FC = () => {
  const [interviews, setInterviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const handleStart = async (id: number) => {
    try {
      await videoInterviewService.startInterview(id);
      setInterviews((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: 'in_progress' } : i))
      );
    } catch (err: any) {
      setError(err.message || 'Failed to start interview.');
    }
  };

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

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <Sidebar />
      <Box component="main" sx={{ flexGrow: 1, p: 3, overflow: 'auto', bgcolor: '#f5f5f5' }}>
        <Typography variant="h4" gutterBottom>Video Interviews</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Job Title</TableCell>
                  <TableCell>Candidate</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Scheduled At</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Trust Score</TableCell>
                  <TableCell>Flags</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {interviews.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.id}</TableCell>
                    <TableCell>{row.job_title || 'N/A'}</TableCell>
                    <TableCell>{row.candidate_name || 'N/A'}</TableCell>
                    <TableCell>
                      <Chip label={row.status} color={statusColorMap[row.status] || 'default'} size="small" />
                    </TableCell>
                    <TableCell>{new Date(row.scheduled_at).toLocaleString()}</TableCell>
                    <TableCell>{row.duration_minutes} min</TableCell>
                    <TableCell>{row.trust_score ?? '—'}</TableCell>
                    <TableCell>{row.flag_count ?? 0}</TableCell>
                    <TableCell>
                      <Tooltip title="View"><IconButton href={`/video-interviews/${row.id}`}><Visibility /></IconButton></Tooltip>
                      <Tooltip title="Start"><IconButton color="success" onClick={() => handleStart(row.id)} disabled={row.status !== 'scheduled'}><PlayArrow /></IconButton></Tooltip>
                      <Tooltip title="Cancel"><IconButton color="error" onClick={() => handleCancel(row.id)} disabled={row.status === 'cancelled' || row.status === 'completed'}><Cancel /></IconButton></Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Box>
  );
};

export default VideoInterviewList;
