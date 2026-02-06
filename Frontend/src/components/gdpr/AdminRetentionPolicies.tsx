import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  IconButton,
  Tooltip,
  Skeleton,
  Dialog,
  TextField,
  MenuItem,
} from '@mui/material';
import {
  Policy,
  Add,
  Refresh,
  Videocam,
  Person,
  Assessment,
  History,
  Storage,
  Delete,
  VisibilityOff,
  Archive,
  CheckCircle,
  Cancel,
  Close,
  Schedule,
  FolderOff,
} from '@mui/icons-material';
import Navigation from '../layout/sidebar';
import { gdprService } from '../../services/gdprService';
import toast from 'react-hot-toast';

interface RetentionPolicy {
  id: string;
  data_category: string;
  retention_days: number;
  action: string;
  is_active: boolean;
  created_at: string;
}

const DATA_TYPES = ['interview_recordings', 'candidate_profiles', 'assessment_results', 'audit_logs', 'session_data'];
const ACTIONS = ['delete', 'anonymize', 'archive'];

// Get icon for data type
const getDataTypeIcon = (type: string) => {
  switch (type) {
    case 'interview_recordings': return <Videocam sx={{ fontSize: 20 }} />;
    case 'candidate_profiles': return <Person sx={{ fontSize: 20 }} />;
    case 'assessment_results': return <Assessment sx={{ fontSize: 20 }} />;
    case 'audit_logs': return <History sx={{ fontSize: 20 }} />;
    case 'session_data': return <Storage sx={{ fontSize: 20 }} />;
    default: return <Storage sx={{ fontSize: 20 }} />;
  }
};

// Get icon and color for action
const getActionStyle = (action: string) => {
  switch (action) {
    case 'delete': return { icon: <Delete sx={{ fontSize: 14 }} />, bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
    case 'anonymize': return { icon: <VisibilityOff sx={{ fontSize: 14 }} />, bg: '#f5f3ff', color: '#7c3aed', border: '#ddd6fe' };
    case 'archive': return { icon: <Archive sx={{ fontSize: 14 }} />, bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' };
    default: return { icon: <Storage sx={{ fontSize: 14 }} />, bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' };
  }
};

const AdminRetentionPolicies: React.FC = () => {
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ data_category: DATA_TYPES[0], retention_days: 90, action: ACTIONS[0] });
  const [saving, setSaving] = useState(false);

  const fetchPolicies = async () => {
    setLoading(true);
    try {
      const data = await gdprService.getRetentionPolicies();
      setPolicies(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load retention policies');
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, []);

  const handleAdd = async () => {
    setSaving(true);
    try {
      await gdprService.createRetentionPolicy(form);
      toast.success('Retention policy created');
      setDialogOpen(false);
      setForm({ data_category: DATA_TYPES[0], retention_days: 90, action: ACTIONS[0] });
      fetchPolicies();
    } catch {
      toast.error('Failed to create policy');
    } finally {
      setSaving(false);
    }
  };

  const formatDataType = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <Navigation>
      <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', p: { xs: 2, md: 4 } }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4, flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ width: 52, height: 52, borderRadius: '14px', bgcolor: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Policy sx={{ color: '#fff', fontSize: 26 }} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: '26px', fontWeight: 700, color: '#0f172a' }}>Retention Policies</Typography>
              <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
                Manage data retention rules
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="Refresh">
              <IconButton onClick={fetchPolicies} sx={{ bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                <Refresh sx={{ fontSize: 20, color: '#64748b' }} />
              </IconButton>
            </Tooltip>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => setDialogOpen(true)}
               sx={{
                background: 'rgba(245, 158, 11, 0.1)',
                color: '#f59e0b',
                border: '2px solid #f59e0b',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 600,
                textTransform: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                minWidth: '120px',
                '&:hover': {
                  background: 'rgba(245, 158, 11, 0.1)',
                  borderColor: '#f59e0b',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 8px 25px rgba(99, 102, 241, 0.25)'
                }
              }}
            >
              Add Policy
            </Button>
          </Box>
        </Box>

        {/* Stats Cards */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
          <Card sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <CardContent sx={{ p: '16px !important' }}>
              <Typography sx={{ fontSize: '12px', color: '#64748b', mb: 0.5 }}>Total Policies</Typography>
              <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>{loading ? '-' : policies.length}</Typography>
            </CardContent>
          </Card>
          <Card sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <CardContent sx={{ p: '16px !important' }}>
              <Typography sx={{ fontSize: '12px', color: '#64748b', mb: 0.5 }}>Active</Typography>
              <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#16a34a' }}>
                {loading ? '-' : policies.filter(p => p.is_active).length}
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <CardContent sx={{ p: '16px !important' }}>
              <Typography sx={{ fontSize: '12px', color: '#64748b', mb: 0.5 }}>Delete Actions</Typography>
              <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#dc2626' }}>
                {loading ? '-' : policies.filter(p => p.action === 'delete').length}
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <CardContent sx={{ p: '16px !important' }}>
              <Typography sx={{ fontSize: '12px', color: '#64748b', mb: 0.5 }}>Archive Actions</Typography>
              <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#2563eb' }}>
                {loading ? '-' : policies.filter(p => p.action === 'archive').length}
              </Typography>
            </CardContent>
          </Card>
        </Box>

        {/* Policies List */}
        <Card sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
          <CardContent sx={{ p: '0 !important' }}>
            {/* Table Header */}
            <Box sx={{ display: { xs: 'none', md: 'grid' }, gridTemplateColumns: '1fr 120px 120px 100px 100px', gap: 2, p: 2, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Data Type</Typography>
              <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Retention</Typography>
              <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Action</Typography>
              <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Status</Typography>
              <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Created</Typography>
            </Box>

            {/* Loading State */}
            {loading ? (
              <Box sx={{ p: 2 }}>
                {[1, 2, 3, 4].map(i => (
                  <Box key={i} sx={{ display: { xs: 'flex', md: 'grid' }, flexDirection: 'column', gridTemplateColumns: '1fr 120px 120px 100px 100px', gap: 2, py: 2, borderBottom: '1px solid #f1f5f9' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Skeleton variant="rounded" width={40} height={40} sx={{ borderRadius: '10px' }} />
                      <Skeleton variant="text" width="60%" height={24} />
                    </Box>
                    <Skeleton variant="text" width="80%" height={24} />
                    <Skeleton variant="rounded" width={80} height={26} sx={{ borderRadius: '6px' }} />
                    <Skeleton variant="rounded" width={70} height={26} sx={{ borderRadius: '6px' }} />
                    <Skeleton variant="text" width="70%" height={24} />
                  </Box>
                ))}
              </Box>
            ) : policies.length === 0 ? (
              /* Empty State */
              <Box sx={{ py: 8, textAlign: 'center' }}>
                <Box sx={{ width: 64, height: 64, borderRadius: '16px', bgcolor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
                  <FolderOff sx={{ fontSize: 32, color: '#94a3b8' }} />
                </Box>
                <Typography sx={{ fontSize: '16px', fontWeight: 600, color: '#334155', mb: 0.5 }}>No policies configured</Typography>
                <Typography sx={{ fontSize: '14px', color: '#64748b', mb: 3 }}>Create your first retention policy to get started</Typography>
                <Button
                  variant="contained"
                  startIcon={<Add />}
                  onClick={() => setDialogOpen(true)}
                  sx={{
                    borderRadius: '10px',
                    textTransform: 'none',
                    fontWeight: 600,
                    bgcolor: '#3b82f6',
                    '&:hover': { bgcolor: '#2563eb' },
                  }}
                >
                  Add Policy
                </Button>
              </Box>
            ) : (
              /* Policies */
              <Box>
                {policies.map((policy, idx) => {
                  const actionStyle = getActionStyle(policy.action || '');
                  return (
                    <Box
                      key={policy.id || idx}
                      sx={{
                        display: { xs: 'flex', md: 'grid' },
                        flexDirection: { xs: 'column', md: 'row' },
                        gridTemplateColumns: '1fr 120px 120px 100px 100px',
                        gap: { xs: 1.5, md: 2 },
                        p: 2,
                        borderBottom: idx < policies.length - 1 ? '1px solid #f1f5f9' : 'none',
                        '&:hover': { bgcolor: '#f8fafc' },
                        transition: 'background-color 0.15s',
                      }}
                    >
                      {/* Data Type */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ width: 40, height: 40, borderRadius: '10px', bgcolor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
                          {getDataTypeIcon(policy.data_category)}
                        </Box>
                        <Typography sx={{ fontSize: '14px', fontWeight: 500, color: '#0f172a' }}>
                          {formatDataType(policy.data_category)}
                        </Typography>
                      </Box>

                      {/* Retention Days */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Schedule sx={{ fontSize: 16, color: '#94a3b8' }} />
                        <Typography sx={{ fontSize: '14px', color: '#475569', fontWeight: 500 }}>
                          {policy.retention_days} days
                        </Typography>
                      </Box>

                      {/* Action */}
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Chip
                          icon={actionStyle.icon}
                          label={(policy.action || 'unknown').charAt(0).toUpperCase() + (policy.action || 'unknown').slice(1)}
                          size="small"
                          sx={{
                            bgcolor: actionStyle.bg,
                            color: actionStyle.color,
                            border: `1px solid ${actionStyle.border}`,
                            fontWeight: 500,
                            fontSize: '12px',
                            '& .MuiChip-icon': { color: actionStyle.color },
                          }}
                        />
                      </Box>

                      {/* Status */}
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Chip
                          icon={policy.is_active ? <CheckCircle sx={{ fontSize: 14 }} /> : <Cancel sx={{ fontSize: 14 }} />}
                          label={policy.is_active ? 'Active' : 'Inactive'}
                          size="small"
                          sx={{
                            bgcolor: policy.is_active ? '#f0fdf4' : '#f8fafc',
                            color: policy.is_active ? '#16a34a' : '#64748b',
                            border: `1px solid ${policy.is_active ? '#bbf7d0' : '#e2e8f0'}`,
                            fontWeight: 500,
                            fontSize: '12px',
                            '& .MuiChip-icon': { color: policy.is_active ? '#16a34a' : '#64748b' },
                          }}
                        />
                      </Box>

                      {/* Created */}
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
                          {new Date(policy.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Add Policy Modal */}
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          PaperProps={{
            sx: {
              borderRadius: { xs: '12px', md: '16px' },
              width: '100%',
              maxWidth: '400px',
              margin: { xs: '12px', md: '32px' },
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            },
          }}
        >
          {/* Header */}
          <Box sx={{ p: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>Add Retention Policy</Typography>
            <IconButton onClick={() => setDialogOpen(false)} size="small" sx={{ bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}>
              <Close sx={{ fontSize: 18, color: '#64748b' }} />
            </IconButton>
          </Box>

          {/* Content */}
          <Box sx={{ p: '24px' }}>
            {/* Data Type */}
            <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#475569', mb: 1.5 }}>Data Type</Typography>
            <TextField
              select
              fullWidth
              size="small"
              value={form.data_category}
              onChange={e => setForm(f => ({ ...f, data_category: e.target.value }))}
              sx={{
                mb: 3,
                '& .MuiOutlinedInput-root': {
                  borderRadius: '10px',
                  bgcolor: '#f8fafc',
                  '& fieldset': { borderColor: '#e2e8f0' },
                  '&:hover fieldset': { borderColor: '#cbd5e1' },
                  '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                },
              }}
            >
              {DATA_TYPES.map(d => (
                <MenuItem key={d} value={d}>{formatDataType(d)}</MenuItem>
              ))}
            </TextField>

            {/* Retention Days */}
            <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#475569', mb: 1.5 }}>Retention Period (Days)</Typography>
            <TextField
              fullWidth
              size="small"
              type="number"
              value={form.retention_days}
              onChange={e => setForm(f => ({ ...f, retention_days: parseInt(e.target.value) || 0 }))}
              sx={{
                mb: 3,
                '& .MuiOutlinedInput-root': {
                  borderRadius: '10px',
                  bgcolor: '#f8fafc',
                  '& fieldset': { borderColor: '#e2e8f0' },
                  '&:hover fieldset': { borderColor: '#cbd5e1' },
                  '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                },
              }}
            />

            {/* Action */}
            <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#475569', mb: 1.5 }}>Action After Retention</Typography>
            <TextField
              select
              fullWidth
              size="small"
              value={form.action}
              onChange={e => setForm(f => ({ ...f, action: e.target.value }))}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '10px',
                  bgcolor: '#f8fafc',
                  '& fieldset': { borderColor: '#e2e8f0' },
                  '&:hover fieldset': { borderColor: '#cbd5e1' },
                  '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                },
              }}
            >
              {ACTIONS.map(a => (
                <MenuItem key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</MenuItem>
              ))}
            </TextField>
          </Box>

          {/* Footer */}
          <Box sx={{ p: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button
              onClick={() => setDialogOpen(false)}
              sx={{
                borderRadius: '10px',
                textTransform: 'none',
                color: '#64748b',
                px: 3,
                '&:hover': { bgcolor: '#f1f5f9' }
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleAdd}
              disabled={saving}
              sx={{
                borderRadius: '10px',
                textTransform: 'none',
                fontWeight: 600,
                bgcolor: '#3b82f6',
                px: 3,
                '&:hover': { bgcolor: '#2563eb' },
              }}
            >
              {saving ? 'Creating...' : 'Create Policy'}
            </Button>
          </Box>
        </Dialog>
      </Box>
    </Navigation>
  );
};

export default AdminRetentionPolicies;
