import React, { useEffect, useState, useRef } from 'react';
import {
  Box, Typography, Card, CardContent, Chip, LinearProgress, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, IconButton
} from '@mui/material';
import { Warning, CheckCircle, Error, Refresh, FiberManualRecord } from '@mui/icons-material';
import Navigation from '../layout/sidebar';
import fraudDetectionService from '../../services/fraudDetectionService';

interface LiveFlag {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  timestamp: string;
  metric: string;
  value: number;
  threshold: number;
}

interface MonitorSession {
  videoInterviewId: number;
  candidateName: string;
  trustScore: number;
  flags: LiveFlag[];
  status: 'monitoring' | 'completed' | 'flagged';
  voiceScore: number;
  lipSyncScore: number;
  bodyScore: number;
}

const severityColor = (sev: string) => {
  switch (sev) {
    case 'high': return 'error';
    case 'medium': return 'warning';
    default: return 'info';
  }
};

const statusIcon = (status: string) => {
  switch (status) {
    case 'flagged': return <Error color="error" />;
    case 'completed': return <CheckCircle color="success" />;
    default: return <FiberManualRecord color="success" sx={{ animation: 'pulse 1.5s infinite' }} />;
  }
};

const RealTimeFlagMonitor: React.FC = () => {
  const [sessions, setSessions] = useState<MonitorSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const generateSimulatedSession = (id: number): MonitorSession => {
    const names = ['Alice Johnson', 'Bob Smith', 'Carol Williams', 'David Brown', 'Eva Martinez'];
    const voiceScore = 60 + Math.random() * 35;
    const lipSyncScore = 55 + Math.random() * 40;
    const bodyScore = 50 + Math.random() * 45;
    const trustScore = Math.round(voiceScore * 0.35 + lipSyncScore * 0.35 + bodyScore * 0.30);
    const flags: LiveFlag[] = [];

    if (voiceScore < 70) {
      flags.push({
        id: `f-${id}-v`, type: 'voice_anomaly', severity: voiceScore < 60 ? 'high' : 'medium',
        message: 'Voice pattern inconsistency detected', timestamp: new Date().toISOString(),
        metric: 'voice_consistency', value: Math.round(voiceScore), threshold: 70,
      });
    }
    if (lipSyncScore < 65) {
      flags.push({
        id: `f-${id}-l`, type: 'lip_sync_mismatch', severity: lipSyncScore < 55 ? 'high' : 'medium',
        message: 'Lip-sync offset exceeds threshold', timestamp: new Date().toISOString(),
        metric: 'lip_sync_offset', value: Math.round(100 - lipSyncScore), threshold: 35,
      });
    }
    if (bodyScore < 60) {
      flags.push({
        id: `f-${id}-b`, type: 'body_movement', severity: 'low',
        message: 'Unusual body movement pattern', timestamp: new Date().toISOString(),
        metric: 'body_movement_score', value: Math.round(bodyScore), threshold: 60,
      });
    }

    return {
      videoInterviewId: id,
      candidateName: names[id % names.length],
      trustScore,
      flags,
      status: trustScore < 60 ? 'flagged' : 'monitoring',
      voiceScore: Math.round(voiceScore),
      lipSyncScore: Math.round(lipSyncScore),
      bodyScore: Math.round(bodyScore),
    };
  };

  const loadSessions = () => {
    try {
      const simulated = Array.from({ length: 4 }, (_, i) => generateSimulatedSession(i + 1));
      setSessions(simulated);
      setError('');
    } catch (err: any) {
      setError('Failed to load monitoring data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
    intervalRef.current = setInterval(loadSessions, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const ScoreBar = ({ label, value }: { label: string; value: number }) => (
    <Box sx={{ mb: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="caption">{label}</Typography>
        <Typography variant="caption" fontWeight="bold">{value}%</Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={value}
        color={value >= 80 ? 'success' : value >= 60 ? 'warning' : 'error'}
        sx={{ height: 6, borderRadius: 3 }}
      />
    </Box>
  );

  return (
    <Navigation >
      <Box component="main" sx={{ flexGrow: 1, p: 3, overflow: 'auto', bgcolor: '#f5f5f5' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4">Real-Time Flag Monitor</Typography>
          <IconButton onClick={loadSessions} color="primary"><Refresh /></IconButton>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {loading ? (
          <LinearProgress />
        ) : (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, mb: 4 }}>
              {sessions.map((session) => (
                <Card key={session.videoInterviewId} sx={{
                  border: session.status === 'flagged' ? '2px solid #ef4444' : '1px solid #e5e7eb'
                }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {statusIcon(session.status)}
                        <Typography variant="h6">{session.candidateName}</Typography>
                      </Box>
                      <Chip
                        label={`Trust: ${session.trustScore}%`}
                        color={session.trustScore >= 80 ? 'success' : session.trustScore >= 60 ? 'warning' : 'error'}
                        size="small"
                      />
                    </Box>
                    <ScoreBar label="Voice Consistency" value={session.voiceScore} />
                    <ScoreBar label="Lip Sync" value={session.lipSyncScore} />
                    <ScoreBar label="Body Movement" value={session.bodyScore} />
                    {session.flags.length > 0 && (
                      <Box sx={{ mt: 2 }}>
                        {session.flags.map((flag) => (
                          <Chip
                            key={flag.id}
                            icon={<Warning />}
                            label={flag.message}
                            color={severityColor(flag.severity) as any}
                            size="small"
                            variant="outlined"
                            sx={{ mr: 0.5, mb: 0.5 }}
                          />
                        ))}
                      </Box>
                    )}
                  </CardContent>
                </Card>
              ))}
            </Box>

            <Typography variant="h5" gutterBottom>Flag Activity Log</Typography>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Time</TableCell>
                    <TableCell>Candidate</TableCell>
                    <TableCell>Flag Type</TableCell>
                    <TableCell>Severity</TableCell>
                    <TableCell>Metric</TableCell>
                    <TableCell>Value / Threshold</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sessions.flatMap(s => s.flags.map(f => ({ ...f, candidateName: s.candidateName })))
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                    .map((flag: any) => (
                      <TableRow key={flag.id}>
                        <TableCell>{new Date(flag.timestamp).toLocaleTimeString()}</TableCell>
                        <TableCell>{flag.candidateName}</TableCell>
                        <TableCell>{flag.type.replace(/_/g, ' ')}</TableCell>
                        <TableCell>
                          <Chip label={flag.severity} color={severityColor(flag.severity) as any} size="small" />
                        </TableCell>
                        <TableCell>{flag.metric}</TableCell>
                        <TableCell>{flag.value} / {flag.threshold}</TableCell>
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

export default RealTimeFlagMonitor;
