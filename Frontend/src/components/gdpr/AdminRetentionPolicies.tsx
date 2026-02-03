import React, { useState, useEffect } from 'react';
import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Button, Chip, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import Sidebar from '../layout/sidebar';
import { gdprService } from '../../services/gdprService';
import toast from 'react-hot-toast';

interface RetentionPolicy {
  id: string;
  data_type: string;
  retention_days: number;
  action: string;
  is_active: boolean;
  created_at: string;
}

const DATA_TYPES = ['interview_recordings', 'candidate_profiles', 'assessment_results', 'audit_logs', 'session_data'];
const ACTIONS = ['delete', 'anonymize', 'archive'];

const AdminRetentionPolicies: React.FC = () => {
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ data_type: DATA_TYPES[0], retention_days: 90, action: ACTIONS[0] });
  const [saving, setSaving] = useState(false);

  const fetchPolicies = async () => {
    setLoading(true);
    try {
      const data = await gdprService.getRetentionPolicies();
      setPolicies(data);
    } catch {
      toast.error('Failed to load retention policies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPolicies(); }, []);

  const handleAdd = async () => {
    setSaving(true);
    try {
      await gdprService.createRetentionPolicy(form);
      toast.success('Retention policy created');
      setDialogOpen(false);
      setForm({ data_type: DATA_TYPES[0], retention_days: 90, action: ACTIONS[0] });
      fetchPolicies();
    } catch {
      toast.error('Failed to create policy');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <Sidebar />
      <Box component="main" sx={{ flexGrow: 1, p: 3, overflow: 'auto', bgcolor: '#f5f5f5' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" sx={{ fontWeight: 600 }}>Retention Policies</Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>Add Policy</Button>
        </Box>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
        ) : (
          <TableContainer component={Paper} elevation={2}>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#fafafa' }}>
                  <TableCell><strong>Data Type</strong></TableCell>
                  <TableCell><strong>Retention (Days)</strong></TableCell>
                  <TableCell><strong>Action</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                  <TableCell><strong>Created</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {policies.length === 0 ? (
                  <TableRow><TableCell colSpan={5} align="center">No retention policies configured.</TableCell></TableRow>
                ) : policies.map(p => (
                  <TableRow key={p.id} hover>
                    <TableCell>{p.data_type.replace(/_/g, ' ')}</TableCell>
                    <TableCell>{p.retention_days}</TableCell>
                    <TableCell><Chip label={p.action} size="small" variant="outlined" /></TableCell>
                    <TableCell><Chip label={p.is_active ? 'Active' : 'Inactive'} size="small" color={p.is_active ? 'success' : 'default'} /></TableCell>
                    <TableCell>{new Date(p.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Add Retention Policy</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
            <TextField select label="Data Type" value={form.data_type} onChange={e => setForm(f => ({ ...f, data_type: e.target.value }))}>
              {DATA_TYPES.map(d => <MenuItem key={d} value={d}>{d.replace(/_/g, ' ')}</MenuItem>)}
            </TextField>
            <TextField type="number" label="Retention Days" value={form.retention_days} onChange={e => setForm(f => ({ ...f, retention_days: parseInt(e.target.value) || 0 }))} />
            <TextField select label="Action" value={form.action} onChange={e => setForm(f => ({ ...f, action: e.target.value }))}>
              {ACTIONS.map(a => <MenuItem key={a} value={a}>{a}</MenuItem>)}
            </TextField>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleAdd} disabled={saving}>{saving ? 'Saving...' : 'Create Policy'}</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
};

export default AdminRetentionPolicies;
