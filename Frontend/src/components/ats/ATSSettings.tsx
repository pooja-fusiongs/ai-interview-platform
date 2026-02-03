import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Grid, Card, CardContent, CardActions, Button,
  Chip, IconButton, CircularProgress, Alert
} from '@mui/material';
import { Add, Sync, Delete, CheckCircle, Error as ErrorIcon } from '@mui/icons-material';
import Sidebar from '../layout/sidebar';
import atsService from '../../services/atsService';
import ATSConnectionForm from './ATSConnectionForm';

interface Connection {
  id: number;
  provider: string;
  is_active: boolean;
  last_sync_at: string | null;
  sync_status: string;
}

const ATSSettings: React.FC = () => {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState('');

  const fetchConnections = async () => {
    setLoading(true);
    try {
      const data = await atsService.getConnections();
      setConnections(data);
    } catch (err) {
      setError('Failed to load ATS connections');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  const handleTest = async (id: number) => {
    try {
      await atsService.testConnection(id);
      fetchConnections();
    } catch {
      setError('Connection test failed');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await atsService.deleteConnection(id);
      setConnections(prev => prev.filter(c => c.id !== id));
    } catch {
      setError('Failed to delete connection');
    }
  };

  const handleSync = async (id: number) => {
    try {
      await atsService.triggerSync(id, 'full');
      fetchConnections();
    } catch {
      setError('Sync trigger failed');
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <Sidebar />
      <Box component="main" sx={{ flexGrow: 1, p: 3, overflow: 'auto', bgcolor: '#f5f5f5' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
          <Typography variant="h4">ATS Integrations</Typography>
          <Button variant="contained" startIcon={<Add />} onClick={() => setDialogOpen(true)}>
            Add Connection
          </Button>
        </Box>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
        ) : (
          <Grid container spacing={3}>
            {connections.map(conn => (
              <Grid item xs={12} sm={6} md={4} key={conn.id}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="h6">{conn.provider}</Typography>
                      <Chip
                        label={conn.is_active ? 'Active' : 'Inactive'}
                        color={conn.is_active ? 'success' : 'default'}
                        size="small"
                      />
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      Last Sync: {conn.last_sync_at ? new Date(conn.last_sync_at).toLocaleString() : 'Never'}
                    </Typography>
                    <Chip
                      icon={conn.sync_status === 'success' ? <CheckCircle /> : <ErrorIcon />}
                      label={conn.sync_status || 'Pending'}
                      size="small"
                      sx={{ mt: 1 }}
                      color={conn.sync_status === 'success' ? 'success' : 'warning'}
                    />
                  </CardContent>
                  <CardActions>
                    <Button size="small" onClick={() => handleTest(conn.id)}>Test</Button>
                    <IconButton size="small" onClick={() => handleSync(conn.id)}><Sync /></IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(conn.id)}><Delete /></IconButton>
                  </CardActions>
                </Card>
              </Grid>
            ))}
            {connections.length === 0 && (
              <Grid item xs={12}>
                <Typography color="text.secondary" align="center" sx={{ mt: 4 }}>
                  No ATS connections configured. Click "Add Connection" to get started.
                </Typography>
              </Grid>
            )}
          </Grid>
        )}
        <ATSConnectionForm
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSaved={() => { setDialogOpen(false); fetchConnections(); }}
        />
      </Box>
    </Box>
  );
};

export default ATSSettings;
