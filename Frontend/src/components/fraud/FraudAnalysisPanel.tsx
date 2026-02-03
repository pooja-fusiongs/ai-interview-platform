import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Typography, Grid, Card, CardContent, Chip, CircularProgress, Alert, Divider
} from '@mui/material';
import Sidebar from '../layout/sidebar';
import fraudDetectionService from '../../services/fraudDetectionService';

const getScoreColor = (score: number): string => {
  if (score >= 80) return '#4caf50';
  if (score >= 60) return '#ff9800';
  return '#f44336';
};

const FraudAnalysisPanel: React.FC = () => {
  const { videoInterviewId } = useParams<{ videoInterviewId: string }>();
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAnalysis = async () => {
      try {
        const data = await fraudDetectionService.getAnalysis(Number(videoInterviewId));
        setAnalysis(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load analysis.');
      } finally {
        setLoading(false);
      }
    };
    if (videoInterviewId) fetchAnalysis();
  }, [videoInterviewId]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', height: '100vh' }}>
        <Sidebar />
        <Box component="main" sx={{ flexGrow: 1, p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: '#f5f5f5' }}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <Sidebar />
      <Box component="main" sx={{ flexGrow: 1, p: 3, overflow: 'auto', bgcolor: '#f5f5f5' }}>
        <Typography variant="h4" gutterBottom>Fraud Analysis — Interview #{videoInterviewId}</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {analysis && (
          <>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
              <Typography variant="h6" color="text.secondary">Overall Trust Score</Typography>
              <Typography variant="h1" sx={{ color: getScoreColor(analysis.overall_trust_score), fontWeight: 'bold' }}>
                {analysis.overall_trust_score}%
              </Typography>
            </Box>
            <Grid container spacing={3} sx={{ mb: 4 }}>
              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Voice Consistency</Typography>
                    <Typography variant="h3" sx={{ color: getScoreColor(analysis.voice_score) }}>
                      {analysis.voice_score}%
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      {analysis.voice_details || 'No additional details'}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Lip-Sync Analysis</Typography>
                    <Typography variant="h3" sx={{ color: getScoreColor(analysis.lip_sync_score) }}>
                      {analysis.lip_sync_score}%
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      {analysis.lip_sync_details || 'No additional details'}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Body Movement</Typography>
                    <Typography variant="h3" sx={{ color: getScoreColor(analysis.body_score) }}>
                      {analysis.body_score}%
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      {analysis.body_details || 'No additional details'}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
            <Divider sx={{ mb: 3 }} />
            <Typography variant="h5" gutterBottom>Flags</Typography>
            {(analysis.flags || []).map((flag: any, idx: number) => (
              <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                <Chip label={flag.type} size="small" />
                <Chip label={flag.severity} size="small"
                  color={flag.severity === 'high' ? 'error' : flag.severity === 'medium' ? 'warning' : 'info'} />
                <Typography variant="body2">{flag.description}</Typography>
              </Box>
            ))}
          </>
        )}
      </Box>
    </Box>
  );
};

export default FraudAnalysisPanel;
