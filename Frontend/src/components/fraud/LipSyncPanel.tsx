import React from 'react';
import { Card, CardContent, Typography, LinearProgress, Box } from '@mui/material';

interface LipSyncPanelProps {
  score: number;
  details: any;
}

const getColor = (value: number): 'success' | 'warning' | 'error' => {
  if (value >= 80) return 'success';
  if (value >= 60) return 'warning';
  return 'error';
};

const LipSyncPanel: React.FC<LipSyncPanelProps> = ({ score, details }) => {
  const metrics = [
    { label: 'Audio-Visual Sync', value: details?.audio_visual_sync ?? 0 },
    { label: 'Mouth Movement Accuracy', value: details?.mouth_movement_accuracy ?? 0 },
    { label: 'Phoneme Correlation', value: details?.phoneme_correlation ?? 0 },
    { label: 'Temporal Alignment', value: details?.temporal_alignment ?? 0 },
  ];

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>Lip-Sync Analysis</Typography>
        <Typography variant="h3" sx={{
          color: score >= 80 ? '#4caf50' : score >= 60 ? '#ff9800' : '#f44336',
          fontWeight: 'bold', mb: 3,
        }}>
          {score}%
        </Typography>
        {metrics.map((metric) => (
          <Box key={metric.label} sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2">{metric.label}</Typography>
              <Typography variant="body2" fontWeight="bold">{metric.value}%</Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={metric.value}
              color={getColor(metric.value)}
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>
        ))}
        {details?.notes && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {details.notes}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

export default LipSyncPanel;
