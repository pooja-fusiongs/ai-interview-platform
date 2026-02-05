import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Button, CircularProgress, Alert, Snackbar,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Divider
} from '@mui/material';
import { AutoFixHigh } from '@mui/icons-material';
import Naivgation from '../layout/sidebar';
import feedbackService from '../../services/feedbackService';

interface CorrelationData {
  technical_score: number;
  communication_score: number;
  problem_solving: number;
  cultural_fit: number;
  experience_relevance: number;
  suggested_weights: {
    technical_score: number;
    communication_score: number;
    problem_solving: number;
    cultural_fit: number;
    experience_relevance: number;
  };
  suggestion: string;
}

const currentWeights = {
  technical_score: 0.25,
  communication_score: 0.20,
  problem_solving: 0.25,
  cultural_fit: 0.15,
  experience_relevance: 0.15,
};

const ScoringRefinementPanel: React.FC = () => {
  const [correlationData, setCorrelationData] = useState<CorrelationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toastOpen, setToastOpen] = useState(false);

  useEffect(() => {
    const fetchCorrelation = async () => {
      try {
        const data = await feedbackService.getCorrelationData();
        setCorrelationData(data);
      } catch {
        setError('Failed to load correlation data');
      } finally {
        setLoading(false);
      }
    };
    fetchCorrelation();
  }, []);

  const handleApply = () => {
    setToastOpen(true);
  };

  if (loading) {
    return (
      <Naivgation>
        <Box component="main" sx={{ flexGrow: 1, p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: '#f5f5f5' }}>
          <CircularProgress />
        </Box>
      </Naivgation>
    );
  }

  return (
    <Naivgation>
      <Box component="main" sx={{ flexGrow: 1, p: 3, overflow: 'auto', bgcolor: '#f5f5f5' }}>
        <Typography variant="h4" sx={{ mb: 3 }}>Scoring Refinement</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Current Scoring Weights</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Dimension</TableCell>
                  <TableCell align="right">Weight</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(currentWeights).map(([key, value]) => (
                  <TableRow key={key}>
                    <TableCell>{key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</TableCell>
                    <TableCell align="right">{(value * 100).toFixed(0)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {correlationData && (
          <>
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>Correlation with Job Performance</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Dimension</TableCell>
                      <TableCell align="right">Correlation</TableCell>
                      <TableCell align="right">Suggested Weight</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(correlationData.suggested_weights).map(([key, suggestedVal]) => (
                      <TableRow key={key}>
                        <TableCell>{key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</TableCell>
                        <TableCell align="right">
                          {(correlationData[key as keyof CorrelationData] as number)?.toFixed(3) ?? 'N/A'}
                        </TableCell>
                        <TableCell align="right">{(suggestedVal * 100).toFixed(0)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>

            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>Analysis Suggestion</Typography>
              <Divider sx={{ mb: 2 }} />
              <Typography>{correlationData.suggestion}</Typography>
            </Paper>
          </>
        )}

        <Button
          variant="contained"
          size="large"
          startIcon={<AutoFixHigh />}
          onClick={handleApply}
        >
          Apply Suggested Weights
        </Button>

        <Snackbar
          open={toastOpen}
          autoHideDuration={3000}
          onClose={() => setToastOpen(false)}
          message="Coming soon - weight adjustment is not yet available"
        />
      </Box>
    </Naivgation>
  );
};

export default ScoringRefinementPanel;
