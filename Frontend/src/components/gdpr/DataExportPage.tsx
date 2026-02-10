import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, CircularProgress, Alert } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import Naivgation from '../layout/Sidebar';
import { gdprService } from '../../services/gdprService';
import toast from 'react-hot-toast';

interface ExportRequest {
  id: string;
  status: string;
  format: string;
  requested_at: string;
  download_url: string | null;
  expires_at: string | null;
}

const DataExportPage: React.FC = () => {
  const [requests, setRequests] = useState<ExportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const data = await gdprService.getMyExportRequests();
      setRequests(data);
    } catch {
      toast.error('Failed to load export requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, []);

  const handleRequest = async () => {
    setRequesting(true);
    try {
      await gdprService.requestDataExport('json');
      toast.success('Export request submitted');
      fetchRequests();
    } catch {
      toast.error('Failed to submit export request');
    } finally {
      setRequesting(false);
    }
  };

  const statusColor = (s: string) => {
    if (s === 'completed') return 'success';
    if (s === 'processing') return 'warning';
    if (s === 'failed') return 'error';
    return 'default';
  };

  return (
    <Naivgation>
      <Box component="main" sx={{ flexGrow: 1, p: { xs: '12px', sm: 2, md: 3 }, overflow: 'auto', bgcolor: '#f5f5f5', minHeight: '100vh' }}>
        <Typography variant="h4" sx={{ mb: 1, fontWeight: 600, fontSize: { xs: '20px', sm: '24px', md: '28px' } }}>Data Export</Typography>
        <Typography variant="body1" sx={{ mb: 3, color: 'text.secondary' }}>
          Request a copy of all your personal data in JSON format (GDPR Article 20).
        </Typography>
        <Alert severity="info" sx={{ mb: 3 }}>Export files are available for download for 7 days after generation.</Alert>
        <Button variant="contained" onClick={handleRequest} disabled={requesting} sx={{ mb: 3 }}>
          {requesting ? 'Submitting...' : 'Request Data Export'}
        </Button>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
        ) : (
          <TableContainer component={Paper} elevation={2} sx={{ overflowX: 'auto' }}>
            <Table sx={{ minWidth: { xs: 600, md: 'auto' } }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#fafafa' }}>
                  <TableCell><strong>Request ID</strong></TableCell>
                  <TableCell><strong>Format</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                  <TableCell><strong>Requested</strong></TableCell>
                  <TableCell><strong>Expires</strong></TableCell>
                  <TableCell align="right"><strong>Download</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {requests.length === 0 ? (
                  <TableRow><TableCell colSpan={6} align="center">No export requests yet.</TableCell></TableRow>
                ) : requests.map(r => (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{r.id.slice(0, 8)}...</TableCell>
                    <TableCell>{r.format.toUpperCase()}</TableCell>
                    <TableCell><Chip label={r.status} size="small" color={statusColor(r.status)} /></TableCell>
                    <TableCell>{new Date(r.requested_at).toLocaleDateString()}</TableCell>
                    <TableCell>{r.expires_at ? new Date(r.expires_at).toLocaleDateString() : '—'}</TableCell>
                    <TableCell align="right">
                      {r.download_url ? (
                        <Button size="small" startIcon={<DownloadIcon />} href={r.download_url} target="_blank">Download</Button>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Naivgation>
  );
};

export default DataExportPage;
