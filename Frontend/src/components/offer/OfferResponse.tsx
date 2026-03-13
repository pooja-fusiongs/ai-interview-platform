import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Typography, CircularProgress, Paper } from '@mui/material';
import { CheckCircle, Cancel, ErrorOutline } from '@mui/icons-material';
import apiClient from '../../services/api';

const OfferResponse: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const action = searchParams.get('action');

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<{ status: string; message: string; action?: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || !action) {
      setError('Invalid link. Missing token or action.');
      setLoading(false);
      return;
    }

    const submitResponse = async () => {
      try {
        const res = await apiClient.post(`/api/applications/offer-response?token=${encodeURIComponent(token)}&action=${encodeURIComponent(action)}`);
        setResult(res.data);
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to process your response. The link may have expired.');
      } finally {
        setLoading(false);
      }
    };

    submitResponse();
  }, [token, action]);

  const isAccepted = result?.action === 'accept' || result?.status === 'Hired';
  const isDeclined = result?.action === 'reject' || result?.status === 'Offer Declined';

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f0f4ff 0%, #e8f5e9 100%)',
      p: 2,
    }}>
      <Paper elevation={3} sx={{
        maxWidth: 500,
        width: '100%',
        borderRadius: '16px',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <Box sx={{
          background: loading ? '#64748b' : error ? '#dc2626' : isAccepted ? '#059669' : '#f59e0b',
          py: 4,
          textAlign: 'center',
        }}>
          {loading ? (
            <CircularProgress sx={{ color: 'white' }} />
          ) : error ? (
            <ErrorOutline sx={{ color: 'white', fontSize: 64 }} />
          ) : isAccepted ? (
            <CheckCircle sx={{ color: 'white', fontSize: 64 }} />
          ) : isDeclined ? (
            <Cancel sx={{ color: 'white', fontSize: 64 }} />
          ) : (
            <CheckCircle sx={{ color: 'white', fontSize: 64 }} />
          )}
        </Box>

        {/* Body */}
        <Box sx={{ p: 4, textAlign: 'center' }}>
          {loading ? (
            <Typography sx={{ color: '#64748b', fontSize: '16px' }}>
              Processing your response...
            </Typography>
          ) : error ? (
            <>
              <Typography sx={{ fontSize: '22px', fontWeight: 700, color: '#1e293b', mb: 2 }}>
                Something went wrong
              </Typography>
              <Typography sx={{ color: '#64748b', fontSize: '15px' }}>
                {error}
              </Typography>
            </>
          ) : (
            <>
              <Typography sx={{ fontSize: '22px', fontWeight: 700, color: '#1e293b', mb: 2 }}>
                {isAccepted ? 'Offer Accepted!' : isDeclined ? 'Offer Declined' : 'Response Recorded'}
              </Typography>
              <Typography sx={{ color: '#64748b', fontSize: '15px', mb: 3 }}>
                {result?.message}
              </Typography>
              {isAccepted && (
                <Box sx={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '8px',
                  p: 2,
                  mt: 2,
                }}>
                  <Typography sx={{ color: '#059669', fontSize: '14px', fontWeight: 600 }}>
                    The recruiter has been notified. They will reach out to you with next steps.
                  </Typography>
                </Box>
              )}
            </>
          )}
        </Box>
      </Paper>
    </Box>
  );
};

export default OfferResponse;
