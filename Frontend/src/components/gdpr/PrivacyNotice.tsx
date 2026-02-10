import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Skeleton,
  Alert,
} from '@mui/material';
import {
  Refresh,
  Download,
  Person,
  Work,
  Videocam,
  Fingerprint,
  Description,
  Storage,
  Schedule,
  Visibility,
  Edit,
  DeleteOutline,
  Block,
  HistoryToggleOff,
  Policy,
  Gavel,
  ContactSupport,
  AccessTime,
} from '@mui/icons-material';
import Navigation from '../layout/Sidebar';
import { gdprService } from '../../services/gdprService';
import toast from 'react-hot-toast';
import html2pdf from 'html2pdf.js';

interface RetentionSummary {
  personal_data?: string;
  interview_data?: string;
  video_recordings?: string;
  biometric_data?: string;
  audit_logs?: string;
}

interface PrivacyNoticeData {
  version?: string;
  effective_date?: string;
  content?: string;
  data_categories?: string[];
  retention_summary?: RetentionSummary;
}

// Get icon for data category
const getCategoryIcon = (category: string) => {
  const lower = (category || '').toLowerCase();
  if (lower.includes('personal') || lower.includes('name') || lower.includes('email')) return <Person sx={{ fontSize: 20, color: '#3b82f6' }} />;
  if (lower.includes('professional') || lower.includes('resume') || lower.includes('skill')) return <Work sx={{ fontSize: 20, color: '#8b5cf6' }} />;
  if (lower.includes('interview') || lower.includes('question') || lower.includes('score')) return <Description sx={{ fontSize: 20, color: '#f59e0b' }} />;
  if (lower.includes('video') || lower.includes('audio') || lower.includes('recording')) return <Videocam sx={{ fontSize: 20, color: '#ec4899' }} />;
  if (lower.includes('biometric') || lower.includes('facial')) return <Fingerprint sx={{ fontSize: 20, color: '#ef4444' }} />;
  return <Storage sx={{ fontSize: 20, color: '#64748b' }} />;
};

// Rights with icons
const userRights = [
  { icon: <Visibility sx={{ fontSize: 20 }} />, title: 'Access your data', color: '#3b82f6' },
  { icon: <Edit sx={{ fontSize: 20 }} />, title: 'Correct your data', color: '#22c55e' },
  { icon: <DeleteOutline sx={{ fontSize: 20 }} />, title: 'Delete your data', color: '#ef4444' },
  { icon: <Download sx={{ fontSize: 20 }} />, title: 'Export your data', color: '#8b5cf6' },
  { icon: <Block sx={{ fontSize: 20 }} />, title: 'Object to processing', color: '#f59e0b' },
  { icon: <HistoryToggleOff sx={{ fontSize: 20 }} />, title: 'Withdraw consent', color: '#ec4899' },
];

// Retention icons
const getRetentionIcon = (key: string) => {
  switch (key) {
    case 'personal_data': return <Person sx={{ fontSize: 20, color: '#3b82f6' }} />;
    case 'interview_data': return <Description sx={{ fontSize: 20, color: '#f59e0b' }} />;
    case 'video_recordings': return <Videocam sx={{ fontSize: 20, color: '#ec4899' }} />;
    case 'biometric_data': return <Fingerprint sx={{ fontSize: 20, color: '#ef4444' }} />;
    case 'audit_logs': return <Policy sx={{ fontSize: 20, color: '#64748b' }} />;
    default: return <Storage sx={{ fontSize: 20, color: '#64748b' }} />;
  }
};

const formatRetentionKey = (key: string) => {
  return key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const PrivacyNotice: React.FC = () => {
  const [notice, setNotice] = useState<PrivacyNoticeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const fetchNotice = async () => {
    setLoading(true);
    try {
      const data = await gdprService.getPrivacyNotice();
      setNotice(data);
    } catch {
      setError('Failed to load privacy notice');
      toast.error('Failed to load privacy notice');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotice();
  }, []);

  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return 'January 1, 2025';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const handleDownloadPDF = async () => {
    if (!contentRef.current) return;

    setDownloading(true);
    try {
      const element = contentRef.current;
      const opt = {
         margin: [10, 10, 10, 10] as [number, number, number, number],
        filename: `Privacy_Notice_v${version}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
      };

      await html2pdf().set(opt).from(element).save();
      toast.success('PDF downloaded successfully');
    } catch (err) {
      toast.error('Failed to download PDF');
    } finally {
      setDownloading(false);
    }
  };

  const version = notice?.version || '1.0';
  const effectiveDate = notice?.effective_date;
  const content = notice?.content || '';
  const dataCategories = notice?.data_categories || [];
  const retentionSummary = notice?.retention_summary || {};

  return (
    <Navigation>
      <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', p: { xs: 2, md: 4 } }}>
        {error && <Alert severity="error" sx={{ mb: 3, borderRadius: '12px', maxWidth: '800px', mx: 'auto' }} onClose={() => setError('')}>{error}</Alert>}

        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: '800px', mx: 'auto' }}>
            <Skeleton variant="rounded" height={180} sx={{ borderRadius: '16px' }} />
            <Skeleton variant="rounded" height={250} sx={{ borderRadius: '16px' }} />
            <Skeleton variant="rounded" height={200} sx={{ borderRadius: '16px' }} />
          </Box>
        ) : (
          /* Card Container */
          <Box sx={{ bgcolor: '#fff', borderRadius: '16px', maxWidth: '800px', mx: 'auto', overflow: 'hidden' }}>
            {/* Action Buttons - Not included in PDF */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, p: 2, borderBottom: '1px solid #f1f5f9' }}>
              <Tooltip title="Download PDF">
                <IconButton
                  onClick={handleDownloadPDF}
                  disabled={downloading || loading}
                  sx={{ bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', '&:hover': { bgcolor: '#f1f5f9' } }}
                >
                  <Download sx={{ fontSize: 20, color: downloading ? '#94a3b8' : '#64748b' }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Refresh">
                <IconButton onClick={fetchNotice} sx={{ bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', '&:hover': { bgcolor: '#f1f5f9' } }}>
                  <Refresh sx={{ fontSize: 20, color: '#64748b' }} />
                </IconButton>
              </Tooltip>
            </Box>

            {/* PDF Content Area */}
            <Box ref={contentRef} sx={{ p: 3 }}>
            {/* PDF Header */}
            <Box sx={{ mb: 4, pb: 3, borderBottom: '2px solid #e2e8f0' }}>
              <Typography sx={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', mb: 1 }}>Privacy Notice</Typography>
              <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
                Version {version} • Effective Date: {formatDate(effectiveDate)}
              </Typography>
            </Box>

            {/* Policy Overview */}
            {content && (
              <Box sx={{ mb: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <Box sx={{ width: 36, height: 36, borderRadius: '8px', bgcolor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Policy sx={{ fontSize: 20, color: '#3b82f6' }} />
                  </Box>
                  <Typography sx={{ fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>Overview</Typography>
                </Box>
                <Typography sx={{ fontSize: '14px', color: '#475569', lineHeight: 1.8, pl: { xs: 0, sm: '52px' } }}>{content}</Typography>
              </Box>
            )}

            {/* Data Categories */}
            {dataCategories.length > 0 && (
              <Box sx={{ mb: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <Box sx={{ width: 36, height: 36, borderRadius: '8px', bgcolor: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Storage sx={{ fontSize: 20, color: '#22c55e' }} />
                  </Box>
                  <Typography sx={{ fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>Data We Collect</Typography>
                </Box>
                <Box sx={{ pl: { xs: 0, sm: '52px' }, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1 }}>
                  {dataCategories.map((category, idx) => (
                    <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 2, p: '10px 14px', bgcolor: '#f8fafc', borderRadius: '8px' }}>
                      {getCategoryIcon(category)}
                      <Typography sx={{ fontSize: '13px', color: '#334155' }}>{category}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* Data Retention */}
            {Object.keys(retentionSummary).length > 0 && (
              <Box sx={{ mb: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <Box sx={{ width: 36, height: 36, borderRadius: '8px', bgcolor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Schedule sx={{ fontSize: 20, color: '#f59e0b' }} />
                  </Box>
                  <Typography sx={{ fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>Data Retention</Typography>
                </Box>
                <Box sx={{ pl: { xs: 0, sm: '52px' }, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1 }}>
                  {Object.entries(retentionSummary).map(([key, value], idx) => (
                    <Box key={idx} sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, p: '12px 14px', bgcolor: '#f8fafc', borderRadius: '8px' }}>
                      {getRetentionIcon(key)}
                      <Box>
                        <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{formatRetentionKey(key)}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                          <AccessTime sx={{ fontSize: 12, color: '#64748b' }} />
                          <Typography sx={{ fontSize: '12px', color: '#64748b' }}>{value}</Typography>
                        </Box>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* Your Rights */}
            <Box sx={{ mb: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: '8px', bgcolor: '#fce7f3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Gavel sx={{ fontSize: 20, color: '#ec4899' }} />
                </Box>
                <Typography sx={{ fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>Your Rights</Typography>
              </Box>
              <Box sx={{ pl: { xs: 0, sm: '52px' }, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1 }}>
                {userRights.map((right, idx) => (
                  <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: '10px 14px', bgcolor: '#f8fafc', borderRadius: '8px' }}>
                    <Box sx={{ color: right.color }}>{right.icon}</Box>
                    <Typography sx={{ fontSize: '13px', color: '#334155' }}>{right.title}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>

            {/* Contact */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: '8px', bgcolor: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ContactSupport sx={{ fontSize: 20, color: '#8b5cf6' }} />
                </Box>
                <Typography sx={{ fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>Contact Us</Typography>
              </Box>
              <Typography sx={{ fontSize: '13px', color: '#64748b', lineHeight: 1.7, pl: { xs: 0, sm: '52px' } }}>
                If you have questions about this privacy notice or wish to exercise your data rights, please contact our Data Protection Officer or use the data management options in your account settings.
              </Typography>
            </Box>

            {/* Footer */}
            <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
              <Typography sx={{ fontSize: '11px', color: '#94a3b8' }}>
                © {new Date().getFullYear()} Interview Platform. All rights reserved. This document was generated on {new Date().toLocaleDateString()}.
              </Typography>
            </Box>
            </Box>
          </Box>
        )}

       
      </Box>
    </Navigation>
  );
};

export default PrivacyNotice;
