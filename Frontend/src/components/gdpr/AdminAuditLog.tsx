import React, { useState, useEffect } from 'react';
import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, CircularProgress, TextField, MenuItem, Button } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import Navigation from '../layout/sidebar';
import { gdprService } from '../../services/gdprService';
import toast from 'react-hot-toast';

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  user_id: string;
  timestamp: string;
  details: string;
  ip_address: string;
}

const ACTION_TYPES = ['all', 'consent_granted', 'consent_revoked', 'data_export', 'data_deletion', 'data_access'];

const AdminAuditLog: React.FC = () => {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (actionFilter !== 'all') params.action = actionFilter;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      const data = await gdprService.getAuditLogs(params);
      setLogs(data);
    } catch {
      toast.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  const actionColor = (a: string) => {
    if (a.includes('granted')) return 'success';
    if (a.includes('revoked') || a.includes('deletion')) return 'error';
    if (a.includes('export')) return 'info';
    return 'default';
  };

  return (
    <Navigation >
      <Box component="main" sx={{ flexGrow: 1, p: 3, overflow: 'auto', bgcolor: '#f5f5f5' }}>
        <Typography variant="h4" sx={{ mb: 3, fontWeight: 600 }}>GDPR Audit Log</Typography>
        <Paper sx={{ p: 2, mb: 3, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <FilterListIcon color="action" />
          <TextField select size="small" label="Action" value={actionFilter} onChange={e => setActionFilter(e.target.value)} sx={{ minWidth: 180 }}>
            {ACTION_TYPES.map(a => <MenuItem key={a} value={a}>{a === 'all' ? 'All Actions' : a.replace(/_/g, ' ')}</MenuItem>)}
          </TextField>
          <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
          <Button variant="outlined" onClick={fetchLogs}>Apply Filters</Button>
        </Paper>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
        ) : (
          <TableContainer component={Paper} elevation={2}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#fafafa' }}>
                  <TableCell><strong>Timestamp</strong></TableCell>
                  <TableCell><strong>Action</strong></TableCell>
                  <TableCell><strong>Entity</strong></TableCell>
                  <TableCell><strong>User ID</strong></TableCell>
                  <TableCell><strong>IP Address</strong></TableCell>
                  <TableCell><strong>Details</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow><TableCell colSpan={6} align="center">No audit log entries found.</TableCell></TableRow>
                ) : logs.map(log => (
                  <TableRow key={log.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(log.timestamp).toLocaleString()}</TableCell>
                    <TableCell><Chip label={log.action.replace(/_/g, ' ')} size="small" color={actionColor(log.action)} /></TableCell>
                    <TableCell>{log.entity_type}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{log.user_id.slice(0, 8)}...</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{log.ip_address}</TableCell>
                    <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.details}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Navigation>
  );
};

export default AdminAuditLog;
