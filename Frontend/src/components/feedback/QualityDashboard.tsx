import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Button, CircularProgress,
  Alert, Paper
} from '@mui/material';
import Grid from '@mui/material/GridLegacy'
import { Assessment, TrendingUp, People, CheckCircle } from '@mui/icons-material';
import Navigation from '../layout/sidebar';
import feedbackService from '../../services/feedbackService';

interface DashboardData {
  prediction_accuracy: number;
  correlation: number;
  total_hires_tracked: number;
  success_rate: number;
  by_recommendation: {
    strong_hire: { count: number; avg_performance: number };
    hire: { count: number; avg_performance: number };
    no_hire: { count: number; avg_performance: number };
  };
}

const QualityDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recomputing, setRecomputing] = useState(false);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const result = await feedbackService.getQualityDashboard();
      setData(result);
    } catch {
      setError('Failed to load quality dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      await feedbackService.recomputeQuality();
      await fetchDashboard();
    } catch {
      setError('Recompute failed');
    } finally {
      setRecomputing(false);
    }
  };

  const StatCard = ({ title, value, icon, color }: { title: string; value: string; icon: React.ReactNode; color: string }) => (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ textAlign: 'center' }}>
        <Box sx={{ color, mb: 1 }}>{icon}</Box>
        <Typography variant="h4" fontWeight="bold">{value}</Typography>
        <Typography color="text.secondary">{title}</Typography>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <Navigation >
        <Box component="main" sx={{ flexGrow: 1, p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: '#f5f5f5' }}>
          <CircularProgress />
        </Box>
      </Navigation>
    );
  }

  return (
    <Navigation >
      <Box component="main" sx={{ flexGrow: 1, p: 3, overflow: 'auto', bgcolor: '#f5f5f5' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
          <Typography variant="h4">Hiring Quality Dashboard</Typography>
          <Button variant="outlined" onClick={handleRecompute} disabled={recomputing}>
            {recomputing ? <CircularProgress size={20} /> : 'Recompute'}
          </Button>
        </Box>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
        {data && (
          <>
            <Grid container spacing={3} sx={{ mb: 4 }}>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard title="Prediction Accuracy" value={`${data.prediction_accuracy}%`} icon={<Assessment fontSize="large" />} color="#1976d2" />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard title="Correlation" value={data.correlation.toFixed(2)} icon={<TrendingUp fontSize="large" />} color="#2e7d32" />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard title="Hires Tracked" value={String(data.total_hires_tracked)} icon={<People fontSize="large" />} color="#ed6c02" />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard title="Success Rate" value={`${data.success_rate}%`} icon={<CheckCircle fontSize="large" />} color="#9c27b0" />
              </Grid>
            </Grid>
            <Typography variant="h6" sx={{ mb: 2 }}>Performance by Recommendation</Typography>
            <Grid container spacing={3}>
              {[
                { label: 'Strong Hire', data: data.by_recommendation.strong_hire, color: '#2e7d32' },
                { label: 'Hire', data: data.by_recommendation.hire, color: '#1976d2' },
                { label: 'No Hire', data: data.by_recommendation.no_hire, color: '#d32f2f' },
              ].map(item => (
                <Grid item xs={12} md={4} key={item.label}>
                  <Paper sx={{ p: 3, borderTop: `4px solid ${item.color}` }}>
                    <Typography variant="h6" sx={{ color: item.color }}>{item.label}</Typography>
                    <Typography variant="h3" fontWeight="bold">{item.data.avg_performance.toFixed(1)}</Typography>
                    <Typography color="text.secondary">Avg Performance ({item.data.count} hires)</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </>
        )}
      </Box>
    </Navigation>
  );
};

export default QualityDashboard;
