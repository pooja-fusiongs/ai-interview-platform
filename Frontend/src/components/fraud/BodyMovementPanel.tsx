import React from 'react';
import { Card, CardContent, Typography, LinearProgress, Box } from '@mui/material';

interface BodyMovementPanelProps {
  score: number;
  details: any;
}

const getColor = (value: number): 'success' | 'warning' | 'error' => {
  if (value >= 80) return 'success';
  if (value >= 60) return 'warning';
  return 'error';
};

const BodyMovementPanel: React.FC<BodyMovementPanelProps> = ({ score, details }) => {
  const metrics = [
    { label: 'Posture Stability', value: details?.posture_stability ?? 0 },
    { label: 'Gesture Naturalness', value: details?.gesture_naturalness ?? 0 },
    { label: 'Eye Tracking Consistency', value: details?.eye_tracking_consistency ?? 0 },
    { label: 'Head Movement Pattern', value: details?.head_movement_pattern ?? 0 },
  ];

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>Body Movement</Typography>
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

export default BodyMovementPanel;
