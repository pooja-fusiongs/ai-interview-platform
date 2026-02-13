import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Checkbox, FormControlLabel, Typography, Box, Alert } from '@mui/material';
import { gdprService } from '../../services/gdprService';
import toast from 'react-hot-toast';

interface ConsentFormProps {
  open: boolean;
  onClose: () => void;
  onConsent: () => void;
  consentTypes?: string[];
}

const CONSENT_DESCRIPTIONS: Record<string, string> = {
  interview_data: 'I consent to the collection and processing of my interview responses for evaluation purposes.',
  video_recording: 'I consent to the recording of this video interview session.',
  biometric_analysis: 'I consent to biometric analysis (voice, lip-sync, body movement) for integrity verification.',
  data_processing: 'I consent to the processing of my personal data as described in the privacy notice.',
};

const ConsentForm: React.FC<ConsentFormProps> = ({ open, onClose, onConsent, consentTypes = ['interview_data', 'video_recording', 'biometric_analysis', 'data_processing'] }) => {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const allChecked = consentTypes.every(t => checked[t]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      for (const type of consentTypes) {
        if (checked[type]) {
          await gdprService.grantConsent(type, CONSENT_DESCRIPTIONS[type] || type);
        }
      }
      toast.success('Consent granted successfully');
      onConsent();
    } catch {
      toast.error('Failed to grant consent');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Consent Required</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>Please review and accept the following consent items to proceed.</Alert>
        {consentTypes.map(type => (
          <Box key={type} sx={{ mb: 1 }}>
            <FormControlLabel
              control={<Checkbox checked={!!checked[type]} onChange={e => setChecked(prev => ({ ...prev, [type]: e.target.checked }))} />}
              label={<Typography variant="body2">{CONSENT_DESCRIPTIONS[type] || type}</Typography>}
            />
          </Box>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Decline</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!allChecked || loading}>
          {loading ? 'Processing...' : 'I Agree & Continue'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConsentForm;
