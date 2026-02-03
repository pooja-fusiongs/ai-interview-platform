import React, { useState, useEffect } from 'react';
import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Button, Chip, CircularProgress } from '@mui/material';
import Navigation from '../layout/sidebar';
import { gdprService } from '../../services/gdprService';
import toast from 'react-hot-toast';

interface ConsentRecord {
  id: string;
  consent_type: string;
  status: string;
  granted_at: string;
  expires_at: string | null;
}

const ConsentManager: React.FC = () => {
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConsents = async () => {
    setLoading(true);
    try {
      const data = await gdprService.getConsents();
      setConsents(data);
    } catch {
      toast.error('Failed to load consents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchConsents(); }, []);

  const handleRevoke = async (consentType: string) => {
    try {
      await gdprService.revokeConsent(consentType);
      toast.success('Consent revoked successfully');
      fetchConsents();
    } catch {
      toast.error('Failed to revoke consent');
    }
  };

  return (
    <Navigation >
      <Box component="main" sx={{ flexGrow: 1, p: 3, overflow: 'auto', bgcolor: '#f5f5f5' }}>
        <Typography variant="h4" sx={{ mb: 3, fontWeight: 600 }}>Consent Manager</Typography>
        <Typography variant="body1" sx={{ mb: 3, color: 'text.secondary' }}>
          Manage your data processing consents. You may revoke any consent at any time.
        </Typography>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
        ) : (
          <TableContainer component={Paper} elevation={2}>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#fafafa' }}>
                  <TableCell><strong>Consent Type</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                  <TableCell><strong>Granted At</strong></TableCell>
                  <TableCell><strong>Expires At</strong></TableCell>
                  <TableCell align="right"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {consents.length === 0 ? (
                  <TableRow><TableCell colSpan={5} align="center">No consent records found.</TableCell></TableRow>
                ) : consents.map(c => (
                  <TableRow key={c.id} hover>
                    <TableCell>{c.consent_type.replace(/_/g, ' ').toUpperCase()}</TableCell>
                    <TableCell>
                      <Chip label={c.status} size="small" color={c.status === 'active' ? 'success' : 'default'} />
                    </TableCell>
                    <TableCell>{new Date(c.granted_at).toLocaleDateString()}</TableCell>
                    <TableCell>{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : 'N/A'}</TableCell>
                    <TableCell align="right">
                      {c.status === 'active' && (
                        <Button size="small" color="error" variant="outlined" onClick={() => handleRevoke(c.consent_type)}>
                          Revoke
                        </Button>
                      )}
                    </TableCell>
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

export default ConsentManager;
