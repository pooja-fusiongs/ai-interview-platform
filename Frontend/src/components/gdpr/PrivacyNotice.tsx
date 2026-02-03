import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, CircularProgress, Divider, Chip } from '@mui/material';
import Sidebar from '../layout/sidebar';
import { gdprService } from '../../services/gdprService';
import toast from 'react-hot-toast';

interface PrivacyNoticeData {
  id: string;
  version: string;
  effective_date: string;
  title: string;
  sections: { heading: string; content: string }[];
  last_updated: string;
}

const PrivacyNotice: React.FC = () => {
  const [notice, setNotice] = useState<PrivacyNoticeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await gdprService.getPrivacyNotice();
        setNotice(data);
      } catch {
        toast.error('Failed to load privacy notice');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <Sidebar />
      <Box component="main" sx={{ flexGrow: 1, p: 3, overflow: 'auto', bgcolor: '#f5f5f5' }}>
        <Typography variant="h4" sx={{ mb: 1, fontWeight: 600 }}>Privacy Notice</Typography>
        <Typography variant="body1" sx={{ mb: 3, color: 'text.secondary' }}>
          How we collect, use, and protect your personal data.
        </Typography>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
        ) : notice ? (
          <Paper sx={{ p: 4, maxWidth: 800 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Typography variant="h5" sx={{ fontWeight: 600 }}>{notice.title}</Typography>
              <Chip label={`v${notice.version}`} size="small" color="primary" variant="outlined" />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 3 }}>
              Effective: {new Date(notice.effective_date).toLocaleDateString()} | Last updated: {new Date(notice.last_updated).toLocaleDateString()}
            </Typography>
            <Divider sx={{ mb: 3 }} />
            {notice.sections.map((section, idx) => (
              <Box key={idx} sx={{ mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>{section.heading}</Typography>
                <Typography variant="body2" sx={{ lineHeight: 1.8, whiteSpace: 'pre-line' }}>{section.content}</Typography>
              </Box>
            ))}
          </Paper>
        ) : (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">Privacy notice is not available at this time.</Typography>
          </Paper>
        )}
      </Box>
    </Box>
  );
};

export default PrivacyNotice;
