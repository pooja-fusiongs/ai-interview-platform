import React, { useState, useEffect } from 'react';
import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Button, Chip, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import Sidebar from '../layout/sidebar';
import { gdprService } from '../../services/gdprService';
import toast from 'react-hot-toast';

interface DeletionRequest {
  id: string;
  user_id: string;
  user_email: string;
  status: string;
  reason: string;
  requested_at: string;
  processed_at: string | null;
}

const AdminDeletionRequests: React.FC = () => {
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DeletionRequest | null>(null);
  const [processing, setProcessing] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const data = await gdprService.getAdminDeletionRequests();
      setRequests(data);
    } catch {
      toast.error('Failed to load deletion requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, []);

  const handleProcess = async (action: 'approve' | 'reject') => {
    if (!selected) return;
    setProcessing(true);
    try {
      await gdprService.processDeletionRequest(selected.id, action);
      toast.success(`Request ${action}d successfully`);
      setSelected(null);
      fetchRequests();
    } catch {
      toast.error(`Failed to ${action} request`);
    } finally {
      setProcessing(false);
    }
  };

  const statusColor = (s: string) => {
    if (s === 'pending') return 'warning';
    if (s === 'approved' || s === 'completed') return 'success';
    if (s === 'rejected') return 'error';
    return 'default';
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <Sidebar />
      <Box component="main" sx={{ flexGrow: 1, p: 3, overflow: 'auto', bgcolor: '#f5f5f5' }}>
        <Typography variant="h4" sx={{ mb: 3, fontWeight: 600 }}>Deletion Requests</Typography>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
        ) : (
          <TableContainer component={Paper} elevation={2}>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#fafafa' }}>
                  <TableCell><strong>Request ID</strong></TableCell>
                  <TableCell><strong>User Email</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                  <TableCell><strong>Reason</strong></TableCell>
                  <TableCell><strong>Requested</strong></TableCell>
                  <TableCell><strong>Processed</strong></TableCell>
                  <TableCell align="right"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {requests.length === 0 ? (
                  <TableRow><TableCell colSpan={7} align="center">No deletion requests found.</TableCell></TableRow>
                ) : requests.map(r => (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{r.id.slice(0, 8)}...</TableCell>
                    <TableCell>{r.user_email}</TableCell>
                    <TableCell><Chip label={r.status} size="small" color={statusColor(r.status)} /></TableCell>
                    <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.reason || '—'}</TableCell>
                    <TableCell>{new Date(r.requested_at).toLocaleDateString()}</TableCell>
                    <TableCell>{r.processed_at ? new Date(r.processed_at).toLocaleDateString() : '—'}</TableCell>
                    <TableCell align="right">
                      {r.status === 'pending' && (
                        <Button size="small" variant="outlined" onClick={() => setSelected(r)}>Process</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <Dialog open={!!selected} onClose={() => setSelected(null)} maxWidth="sm" fullWidth>
          <DialogTitle>Process Deletion Request</DialogTitle>
          <DialogContent>
            {selected && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2"><strong>User:</strong> {selected.user_email}</Typography>
                <Typography variant="body2" sx={{ mt: 1 }}><strong>Reason:</strong> {selected.reason || 'No reason provided'}</Typography>
                <Typography variant="body2" sx={{ mt: 1 }}><strong>Requested:</strong> {new Date(selected.requested_at).toLocaleString()}</Typography>
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSelected(null)}>Cancel</Button>
            <Button color="error" variant="outlined" onClick={() => handleProcess('reject')} disabled={processing}>Reject</Button>
            <Button color="success" variant="contained" onClick={() => handleProcess('approve')} disabled={processing}>
              {processing ? <CircularProgress size={20} /> : 'Approve & Delete'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
};

export default AdminDeletionRequests;
