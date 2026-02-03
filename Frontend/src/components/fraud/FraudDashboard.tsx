import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Button, CircularProgress, Alert
} from '@mui/material';
import Grid from '@mui/material/GridLegacy'
import { Security, Flag, CheckCircle, Warning } from '@mui/icons-material';
import Navigation from '../layout/sidebar';
import fraudDetectionService from '../../services/fraudDetectionService';

const FraudDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [flagged, setFlagged] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsData, flaggedData] = await Promise.all([
          fraudDetectionService.getDashboardStats(),
          fraudDetectionService.getFlaggedInterviews(),
        ]);
        setStats(statsData);
        setFlagged(flaggedData.flagged_interviews || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const statCards = stats ? [
    { label: 'Total Analyzed', value: stats.analyzed_count, icon: <Security fontSize="large" color="primary" /> },
    { label: 'Flagged', value: stats.flagged_count, icon: <Flag fontSize="large" color="error" /> },
    { label: 'Cleared', value: stats.cleared_count, icon: <CheckCircle fontSize="large" color="success" /> },
    { label: 'Avg Trust Score', value: `${stats.average_trust_score}%`, icon: <Warning fontSize="large" color="warning" /> },
  ] : [];

  return (
    <Navigation >
      <Box component="main" sx={{ flexGrow: 1, p: 3, overflow: 'auto', bgcolor: '#f5f5f5' }}>
        <Typography variant="h4" gutterBottom>Fraud Detection Dashboard</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
        ) : (
          <>
            <Grid container spacing={3} sx={{ mb: 4 }}>
              {statCards.map((card) => (
                <Grid item xs={12} sm={6} md={3} key={card.label}>
                  <Card>
                    <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      {card.icon}
                      <Box>
                        <Typography variant="h4">{card.value}</Typography>
                        <Typography color="text.secondary">{card.label}</Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
            <Typography variant="h5" gutterBottom>Flagged Interviews</Typography>
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Interview ID</TableCell>
                    <TableCell>Candidate</TableCell>
                    <TableCell>Trust Score</TableCell>
                    <TableCell>Flags</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {flagged.map((row) => (
                    <TableRow key={row.fraud_analysis_id}>
                      <TableCell>{row.fraud_analysis_id}</TableCell>
                      <TableCell>{row.candidate_name || 'N/A'}</TableCell>
                      <TableCell>{row.overall_trust_score}%</TableCell>
                      <TableCell>{row.flag_count}</TableCell>
                      <TableCell>{row.analyzed_at ? new Date(row.analyzed_at).toLocaleDateString() : 'N/A'}</TableCell>
                      <TableCell>
                        <Button variant="outlined" size="small" href={`/fraud-analysis/${row.video_interview_id}`}>Analyze</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Box>
    </Navigation>
  );
};

export default FraudDashboard;
