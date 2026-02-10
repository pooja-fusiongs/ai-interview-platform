import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, CircularProgress, Alert, Divider
} from '@mui/material';
import Naivgation from '../layout/Sidebar';
import atsService from '../../services/atsService';

interface JobMapping {
  id: number;
  ats_job_id: string;
  local_job_id: number;
  last_synced_at: string;
}

interface CandidateMapping {
  id: number;
  ats_candidate_id: string;
  local_application_id: number;
  resume_synced: boolean;
}

const ATSJobMappings: React.FC = () => {
  const [connectionId] = useState(1);
  const [jobMappings, setJobMappings] = useState<JobMapping[]>([]);
  const [candidateMappings, setCandidateMappings] = useState<CandidateMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchMappings = async () => {
      setLoading(true);
      try {
        const [jobs, candidates] = await Promise.all([
          atsService.getJobMappings(connectionId),
          atsService.getCandidateMappings(connectionId),
        ]);
        setJobMappings(jobs);
        setCandidateMappings(candidates);
      } catch {
        setError('Failed to load mappings');
      } finally {
        setLoading(false);
      }
    };
    fetchMappings();
  }, [connectionId]);

  if (loading) {
    return (
      <Naivgation>
        <Box component="main" sx={{ flexGrow: 1, p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: '#f5f5f5' }}>
          <CircularProgress />
        </Box>
      </Naivgation>
    );
  }

  return (
    <Naivgation>
      <Box component="main" sx={{ flexGrow: 1, p: { xs: '12px', sm: 2, md: 3 }, overflow: 'auto', bgcolor: '#f5f5f5', minHeight: '100vh' }}>
        <Typography variant="h4" sx={{ mb: { xs: 2, md: 3 }, fontSize: { xs: '20px', sm: '24px', md: '28px' }, fontWeight: 600 }}>ATS Field Mappings</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        <Typography variant="h6" sx={{ mb: 1, fontSize: { xs: '16px', md: '18px' } }}>Job Mappings</Typography>
        <TableContainer component={Paper} sx={{ mb: { xs: 3, md: 4 }, overflowX: 'auto' }}>
          <Table sx={{ minWidth: { xs: 400, md: 'auto' } }}>
            <TableHead>
              <TableRow>
                <TableCell>ATS Job ID</TableCell>
                <TableCell>Local Job ID</TableCell>
                <TableCell>Last Synced</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {jobMappings.map(m => (
                <TableRow key={m.id}>
                  <TableCell>{m.ats_job_id}</TableCell>
                  <TableCell>{m.local_job_id}</TableCell>
                  <TableCell>{new Date(m.last_synced_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {jobMappings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} align="center">No job mappings found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Divider sx={{ my: 2 }} />

        <Typography variant="h6" sx={{ mb: 1, fontSize: { xs: '16px', md: '18px' } }}>Candidate Mappings</Typography>
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
          <Table sx={{ minWidth: { xs: 400, md: 'auto' } }}>
            <TableHead>
              <TableRow>
                <TableCell>ATS Candidate ID</TableCell>
                <TableCell>Local Application ID</TableCell>
                <TableCell>Resume Synced</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {candidateMappings.map(m => (
                <TableRow key={m.id}>
                  <TableCell>{m.ats_candidate_id}</TableCell>
                  <TableCell>{m.local_application_id}</TableCell>
                  <TableCell>
                    <Chip
                      label={m.resume_synced ? 'Yes' : 'No'}
                      color={m.resume_synced ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                </TableRow>
              ))}
              {candidateMappings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} align="center">No candidate mappings found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Naivgation>
  );
};

export default ATSJobMappings;
