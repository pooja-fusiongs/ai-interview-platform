import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, FormControlLabel, Checkbox, Button, Alert, Divider
} from '@mui/material';
import Naivgation from '../layout/Sidebar';
import gdprService from '../../services/gdprService';

const CandidateVideoConsent: React.FC = () => {
  const navigate = useNavigate();
  const [videoRecording, setVideoRecording] = useState(false);
  const [biometricAnalysis, setBiometricAnalysis] = useState(false);
  const [dataProcessing, setDataProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const allChecked = videoRecording && biometricAnalysis && dataProcessing;

  const handleAgree = async () => {
    if (!allChecked) return;
    setLoading(true);
    setError('');
    try {
      await gdprService.grantConsents({
        video_recording: videoRecording,
        biometric_analysis: biometricAnalysis,
        data_processing: dataProcessing,
      });
      navigate('/video-interviews');
    } catch (err: any) {
      setError(err.message || 'Failed to save consent preferences.');
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = () => {
    navigate(-1);
  };

  return (
    <Naivgation>
      <Box component="main" sx={{ flexGrow: 1, p: 3, overflow: 'auto', bgcolor: '#f5f5f5' }}>
        <Typography variant="h4" gutterBottom>Video Interview Consent</Typography>
        <Paper sx={{ p: 4, maxWidth: 600 }}>
          <Typography variant="body1" sx={{ mb: 3 }}>
            Before proceeding with the video interview, please review and consent to the following data
            processing activities. Your consent is required under GDPR regulations.
          </Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <FormControlLabel
            control={<Checkbox checked={videoRecording} onChange={(e) => setVideoRecording(e.target.checked)} />}
            label="I consent to the recording of this video interview for evaluation purposes."
          />
          <FormControlLabel
            control={<Checkbox checked={biometricAnalysis} onChange={(e) => setBiometricAnalysis(e.target.checked)} />}
            label="I consent to biometric analysis (voice, facial expressions) for fraud detection."
          />
          <FormControlLabel
            control={<Checkbox checked={dataProcessing} onChange={(e) => setDataProcessing(e.target.checked)} />}
            label="I consent to the processing and storage of interview data as described in the privacy policy."
          />
          <Divider sx={{ my: 3 }} />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button variant="contained" color="primary" onClick={handleAgree}
              disabled={!allChecked || loading} size="large">
              {loading ? 'Processing...' : 'Agree & Continue'}
            </Button>
            <Button variant="outlined" color="inherit" onClick={handleDecline} size="large">
              Decline
            </Button>
          </Box>
        </Paper>
      </Box>
    </Naivgation>
  );
};

export default CandidateVideoConsent;
