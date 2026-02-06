import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, ButtonGroup, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Chip, CircularProgress, Alert
} from '@mui/material';
import {  Work, People, CloudSync } from '@mui/icons-material';
import Naivgation from '../layout/sidebar';
import atsService from '../../services/atsService';

interface SyncLog {
  id: number;
  sync_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  records_synced: number;
  error_message: string | null;
}

const ATSSyncDashboard: React.FC = () => {
  const [connectionId] = useState(1);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState('');
  const [error, setError] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await atsService.getSyncLogs(connectionId);
      setSyncLogs(data);
    } catch {
      setError('Failed to load sync logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [connectionId]);

  const handleSync = async (type: string) => {
    setSyncing(type);
    setError('');
    try {
      await atsService.triggerSync(connectionId, type);
      await fetchLogs();
    } catch {
      setError(`Failed to trigger ${type} sync`);
    } finally {
      setSyncing('');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'success';
      case 'failed': return 'error';
      case 'in_progress': return 'info';
      default: return 'warning';
    }
  };

  return (
    <Naivgation>
      <Box component="main" sx={{ flexGrow: 1, p: { xs: '12px', sm: 2, md: 3 }, overflow: 'auto', bgcolor: '#f5f5f5', minHeight: '100vh' }}>
        <Typography variant="h4" sx={{ mb: { xs: 2, md: 3 }, fontSize: { xs: '20px', sm: '24px', md: '28px' }, fontWeight: 600 }}>ATS Sync Dashboard</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
        <Box sx={{ mb: { xs: 3, md: 4 } }}>
          <Typography variant="h6" sx={{ mb: 1, fontSize: { xs: '16px', md: '18px' } }}>Trigger Sync</Typography>
          <ButtonGroup variant="contained" orientation={{ xs: 'vertical', sm: 'horizontal' } as any} sx={{ flexDirection: { xs: 'column', sm: 'row' }, '& .MuiButton-root': { minWidth: { xs: '100%', sm: 'auto' } } }}>
            <Button startIcon={<Work />} onClick={() => handleSync('jobs')} disabled={!!syncing}>
              {syncing === 'jobs' ? <CircularProgress size={20} /> : 'Sync Jobs'}
            </Button>
            <Button startIcon={<People />} onClick={() => handleSync('candidates')} disabled={!!syncing}>
              {syncing === 'candidates' ? <CircularProgress size={20} /> : 'Sync Candidates'}
            </Button>
            <Button startIcon={<CloudSync />} onClick={() => handleSync('full')} disabled={!!syncing}>
              {syncing === 'full' ? <CircularProgress size={20} /> : 'Full Sync'}
            </Button>
          </ButtonGroup>
        </Box>
        <Typography variant="h6" sx={{ mb: 1, fontSize: { xs: '16px', md: '18px' } }}>Sync History</Typography>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
        ) : (
          <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
            <Table sx={{ minWidth: { xs: 650, md: 'auto' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Started</TableCell>
                  <TableCell>Completed</TableCell>
                  <TableCell>Records</TableCell>
                  <TableCell>Error</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {syncLogs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell>{log.id}</TableCell>
                    <TableCell>{log.sync_type}</TableCell>
                    <TableCell>
                      <Chip label={log.status} color={getStatusColor(log.status) as any} size="small" />
                    </TableCell>
                    <TableCell>{new Date(log.started_at).toLocaleString()}</TableCell>
                    <TableCell>{log.completed_at ? new Date(log.completed_at).toLocaleString() : '-'}</TableCell>
                    <TableCell>{log.records_synced}</TableCell>
                    <TableCell>{log.error_message || '-'}</TableCell>
                  </TableRow>
                ))}
                {syncLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center">No sync logs available</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Naivgation>
  );
};

export default ATSSyncDashboard;
