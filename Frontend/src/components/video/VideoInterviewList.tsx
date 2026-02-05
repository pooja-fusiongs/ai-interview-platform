import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Paper, Chip, IconButton, Tooltip, CircularProgress, Alert
} from '@mui/material';
import { Visibility, PlayArrow, Cancel } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import Navigation from '../layout/sidebar';
import videoInterviewService from '../../services/videoInterviewService';

const statusColorMap: Record<string, 'primary' | 'warning' | 'success' | 'error'> = {
  scheduled: 'primary',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'error',
};

const VideoInterviewList: React.FC = () => {
  const navigate = useNavigate();
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
    <Navigation>
      <Box sx={{ padding: '20px', background: '#f8fafc', minHeight: '100vh' }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: '#1e293b', mb: 3 }}>Video Interviews</Typography>
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
                    <TableCell>
                      <Typography
                        sx={{ cursor: 'pointer', fontWeight: 500, '&:hover': { cursor:"pointer" } }}
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
                    <TableCell>{new Date(row.scheduled_at).toLocaleString()}</TableCell>
                    <TableCell>{row.duration_minutes} min</TableCell>
                    <TableCell>{row.trust_score ?? '—'}</TableCell>
                    <TableCell>{row.flag_count ?? 0}</TableCell>
                    <TableCell>
                      <Tooltip title="View Details"><IconButton onClick={() => navigate(`/video-detail/${row.id}`)}><Visibility /></IconButton></Tooltip>
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Navigation>
  );
};

export default VideoInterviewList;
