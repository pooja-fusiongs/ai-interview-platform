import React, { useState } from 'react';
import { Box, Typography, Paper, Button, TextField, Alert, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Naivgation from '../layout/sidebar';
import { gdprService } from '../../services/gdprService';
import toast from 'react-hot-toast';

const DeletionRequestPage: React.FC = () => {
  const [reason, setReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (confirmText !== 'DELETE') return;
    setLoading(true);
    try {
      await gdprService.requestDeletion(reason);
      toast.success('Deletion request submitted successfully');
      setSubmitted(true);
      setConfirmOpen(false);
    } catch {
      toast.error('Failed to submit deletion request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Naivgation>
      <Box component="main" sx={{ flexGrow: 1, p: { xs: '12px', sm: 2, md: 3 }, overflow: 'auto', bgcolor: '#f5f5f5', minHeight: '100vh' }}>
        <Typography variant="h4" sx={{ mb: 1, fontWeight: 600, fontSize: { xs: '20px', sm: '24px', md: '28px' } }}>Data Deletion Request</Typography>
        <Typography variant="body1" sx={{ mb: 3, color: 'text.secondary' }}>
          Request the deletion of all your personal data (GDPR Article 17 - Right to Erasure).
        </Typography>
        {submitted ? (
          <Alert severity="success" sx={{ maxWidth: 600 }}>
            Your deletion request has been submitted and will be processed within 30 days.
          </Alert>
        ) : (
          <Paper sx={{ p: 3, maxWidth: 600 }}>
            <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 3 }}>
              This action is irreversible. All your personal data, interview recordings, and assessment results will be permanently deleted.
            </Alert>
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Reason for deletion (optional)"
              value={reason}
              onChange={e => setReason(e.target.value)}
              sx={{ mb: 3 }}
            />
            <Button variant="contained" color="error" onClick={() => setConfirmOpen(true)}>
              Request Data Deletion
            </Button>
          </Paper>
        )}
        <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { margin: { xs: '12px', md: '32px' }, borderRadius: { xs: '12px', md: '16px' } } }}>
          <DialogTitle>Confirm Deletion Request</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Type <strong>DELETE</strong> to confirm this irreversible action.
            </Typography>
            <TextField
              fullWidth
              size="small"
              placeholder="Type DELETE to confirm"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="contained" color="error" onClick={handleSubmit} disabled={confirmText !== 'DELETE' || loading}>
              {loading ? <CircularProgress size={20} /> : 'Confirm Deletion'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Naivgation>
  );
};

export default DeletionRequestPage;
