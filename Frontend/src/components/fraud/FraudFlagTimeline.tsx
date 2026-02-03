import React from 'react';
import { Card, CardContent, Typography, Chip, Box, Divider } from '@mui/material';

interface FraudFlag {
  type: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: string;
  description: string;
}

interface FraudFlagTimelineProps {
  flags: FraudFlag[];
}

const severityColorMap: Record<string, 'info' | 'warning' | 'error'> = {
  low: 'info',
  medium: 'warning',
  high: 'error',
};

const FraudFlagTimeline: React.FC<FraudFlagTimelineProps> = ({ flags }) => {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>Fraud Flag Timeline</Typography>
        {flags.length === 0 ? (
          <Typography color="text.secondary">No flags detected.</Typography>
        ) : (
          flags.map((flag, idx) => (
            <React.Fragment key={idx}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, py: 1.5 }}>
                <Chip label={flag.type} size="small" variant="outlined" />
                <Chip
                  label={flag.severity}
                  size="small"
                  color={severityColorMap[flag.severity] || 'default'}
                />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2">{flag.description}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(flag.timestamp).toLocaleString()}
                  </Typography>
                </Box>
              </Box>
              {idx < flags.length - 1 && <Divider />}
            </React.Fragment>
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default FraudFlagTimeline;
