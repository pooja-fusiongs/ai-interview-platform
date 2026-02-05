import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  CircularProgress,
  Card,
  CardContent,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  RadioGroup,
  FormControlLabel,
  Radio,
} from '@mui/material';
import Navigation from '../layout/sidebar';
import { gdprService } from '../../services/gdprService';
import toast from 'react-hot-toast';

interface ConsentRecord {
  id: number;
  consent_type: string;
  status: string;
  granted_at: string;
  expires_at: string | null;
}

// Available consent types that can be granted (must match backend ConsentType enum)
const CONSENT_TYPES = [
  { value: 'data_processing', label: 'Data Processing', description: 'Allow processing of your personal data for recruitment purposes' },
  { value: 'video_recording', label: 'Video Recording', description: 'Allow recording of video interviews' },
  { value: 'interview_data', label: 'Interview Data', description: 'Allow collection and storage of interview responses' },
  { value: 'biometric_analysis', label: 'Biometric Analysis', description: 'Allow AI-powered biometric analysis during interviews' },
];

const ConsentManager: React.FC = () => {
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [selectedConsent, setSelectedConsent] = useState<ConsentRecord | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [selectedConsentType, setSelectedConsentType] = useState('');
  const [granting, setGranting] = useState(false);

  const fetchConsents = async () => {
    setLoading(true);
    try {
      const data = await gdprService.getMyConsents();
      setConsents(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load consents');
      setConsents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleGrantConsent = async () => {
    if (!selectedConsentType) {
      toast.error('Please select a consent type');
      return;
    }
    setGranting(true);
    try {
      const consentInfo = CONSENT_TYPES.find((c) => c.value === selectedConsentType);
      await gdprService.grantConsent(selectedConsentType, consentInfo?.description || 'Consent granted');
      toast.success('Consent granted successfully');
      setGrantDialogOpen(false);
      setSelectedConsentType('');
      fetchConsents();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Failed to grant consent');
    } finally {
      setGranting(false);
    }
  };

  useEffect(() => {
    fetchConsents();
  }, []);

  const openRevokeDialog = (consent: ConsentRecord) => {
    setSelectedConsent(consent);
    setRevokeDialogOpen(true);
  };

  const handleRevoke = async () => {
    if (!selectedConsent) return;
    setRevoking(true);
    try {
      await gdprService.revokeConsent(selectedConsent.id);
      toast.success('Consent revoked successfully');
      setRevokeDialogOpen(false);
      setSelectedConsent(null);
      fetchConsents();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Failed to revoke consent');
    } finally {
      setRevoking(false);
      setRevokeDialogOpen(false);
      setSelectedConsent(null);
    }
  };

  // Get consent types that haven't been granted yet
  const availableConsentTypes = CONSENT_TYPES.filter(
    (type) => !consents.some((c) => c.consent_type === type.value && c.status === 'granted')
  );

  const getConsentIcon = (type: string) => {
    const icons: Record<string, string> = {
      data_processing: 'fa-database',
      video_recording: 'fa-video',
      interview_data: 'fa-clipboard-list',
      biometric_analysis: 'fa-fingerprint',
    };
    return icons[type] || 'fa-file-contract';
  };

  const getConsentColor = (type: string) => {
    const colors: Record<string, { bg: string; icon: string; gradient: string }> = {
      data_processing: { bg: '#ede9fe', icon: '#7c3aed', gradient: 'linear-gradient(135deg, #7c3aed, #5b21b6)' },
      video_recording: { bg: '#fef3c7', icon: '#d97706', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' },
      interview_data: { bg: '#dbeafe', icon: '#2563eb', gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)' },
      biometric_analysis: { bg: '#fce7f3', icon: '#db2777', gradient: 'linear-gradient(135deg, #ec4899, #db2777)' },
    };
    return colors[type] || { bg: '#f1f5f9', icon: '#64748b', gradient: 'linear-gradient(135deg, #64748b, #475569)' };
  };

  const formatConsentType = (type: string) => {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusChip = (status: string) => {
    const isGranted = status === 'granted';
    return (
      <Chip
        label={status.toUpperCase()}
        size="small"
        sx={{
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.5px',
          height: '22px',
          backgroundColor: isGranted ? '#dcfce7' : '#fef2f2',
          color: isGranted ? '#166534' : '#991b1b',
          border: `1px solid ${isGranted ? '#bbf7d0' : '#fecaca'}`,
        }}
      />
    );
  };

  return (
    <Navigation>
      <Box sx={{ padding: '24px', background: '#f8fafc', minHeight: '100%' }}>
        {/* Page Header */}
        <Box sx={{ mb: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography sx={{ fontSize: '22px', fontWeight: 700, color: '#1e293b' }}>
              <i className="fas fa-shield-alt" style={{ color: '#7c3aed', marginRight: 10 }}></i>
              Consent Manager
            </Typography>
            <Typography sx={{ fontSize: '13px', color: '#64748b', mt: '4px' }}>
              Manage your data processing consents. You may revoke any consent at any time.
            </Typography>
          </Box>
          <Button
            onClick={() => setGrantDialogOpen(true)}
            disabled={availableConsentTypes.length === 0}
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
            <i className="fas fa-plus" style={{ marginRight: 8 }}></i>
            Grant Consent
          </Button>
        </Box>

        {/* Stats Cards */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
            gap: '16px',
            mb: '24px',
          }}
        >
          <Card
            sx={{
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}
          >
            <CardContent sx={{ padding: '20px !important' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: '18px',
                  }}
                >
                  <i className="fas fa-check-circle"></i>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#1e293b' }}>
                    {consents.filter((c) => c.status === 'granted').length}
                  </Typography>
                  <Typography sx={{ fontSize: '12px', color: '#64748b' }}>Active Consents</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Card
            sx={{
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}
          >
            <CardContent sx={{ padding: '20px !important' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: '18px',
                  }}
                >
                  <i className="fas fa-clock"></i>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#1e293b' }}>
                    {consents.filter((c) => c.expires_at).length}
                  </Typography>
                  <Typography sx={{ fontSize: '12px', color: '#64748b' }}>With Expiry Date</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Card
            sx={{
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}
          >
            <CardContent sx={{ padding: '20px !important' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #64748b, #475569)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: '18px',
                  }}
                >
                  <i className="fas fa-ban"></i>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#1e293b' }}>
                    {consents.filter((c) => c.status !== 'granted').length}
                  </Typography>
                  <Typography sx={{ fontSize: '12px', color: '#64748b' }}>Revoked</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Main Content Card */}
        <Card
          sx={{
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}
        >
          {/* Card Header */}
          <Box
            sx={{
              padding: '18px 24px',
              borderBottom: '1px solid #f1f5f9',
              background: 'rgba(124, 58, 237, 0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '14px',
                }}
              >
                <i className="fas fa-list"></i>
              </Box>
              <Box>
                <Typography sx={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>
                  Your Consents
                </Typography>
                <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                  {consents.length} total records
                </Typography>
              </Box>
            </Box>
            <Tooltip title="Refresh">
              <IconButton
                onClick={fetchConsents}
                sx={{
                  color: '#64748b',
                  '&:hover': { background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed' },
                }}
              >
                <i className="fas fa-sync-alt" style={{ fontSize: '14px' }}></i>
              </IconButton>
            </Tooltip>
          </Box>

          <CardContent sx={{ padding: '0 !important' }}>
            {loading ? (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  py: '60px',
                  gap: '16px',
                }}
              >
                <CircularProgress size={40} sx={{ color: '#7c3aed' }} />
                <Typography sx={{ fontSize: '14px', color: '#64748b' }}>Loading consents...</Typography>
              </Box>
            ) : consents.length === 0 ? (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  py: '60px',
                  gap: '16px',
                }}
              >
                <Box
                  sx={{
                    width: 70,
                    height: 70,
                    borderRadius: '50%',
                    background: '#f1f5f9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '28px',
                    color: '#94a3b8',
                  }}
                >
                  <i className="fas fa-file-contract"></i>
                </Box>
                <Typography sx={{ fontSize: '15px', fontWeight: 600, color: '#475569' }}>
                  No consent records found
                </Typography>
                <Typography sx={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', maxWidth: 300 }}>
                  You haven't granted any data processing consents yet.
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                {consents.map((consent, index) => {
                  const colors = getConsentColor(consent.consent_type);
                  return (
                    <Box
                      key={consent.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '18px 24px',
                        borderBottom: index < consents.length - 1 ? '1px solid #f1f5f9' : 'none',
                        transition: 'background 0.15s',
                        '&:hover': { background: '#fafafa' },
                      }}
                    >
                      {/* Icon */}
                      <Box
                        sx={{
                          width: 44,
                          height: 44,
                          borderRadius: '10px',
                          background: colors.bg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: colors.icon,
                          fontSize: '18px',
                          flexShrink: 0,
                        }}
                      >
                        <i className={`fas ${getConsentIcon(consent.consent_type)}`}></i>
                      </Box>

                      {/* Details */}
                      <Box sx={{ flex: 1, ml: '16px' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '4px' }}>
                          <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                            {formatConsentType(consent.consent_type)}
                          </Typography>
                          {getStatusChip(consent.status)}
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                            <i className="fas fa-calendar-check" style={{ marginRight: 6, fontSize: 10 }}></i>
                            Granted: {formatDate(consent.granted_at)}
                          </Typography>
                          {consent.expires_at && (
                            <Typography sx={{ fontSize: '12px', color: '#f59e0b' }}>
                              <i className="fas fa-hourglass-half" style={{ marginRight: 6, fontSize: 10 }}></i>
                              Expires: {formatDate(consent.expires_at)}
                            </Typography>
                          )}
                        </Box>
                      </Box>

                      {/* Actions */}
                      <Box>
                        {consent.status === 'granted' ? (
                          <Button
                            size="small"
                            onClick={() => openRevokeDialog(consent)}
                            sx={{
                              textTransform: 'none',
                              fontWeight: 600,
                              fontSize: '13px',
                              color: '#dc2626',
                              border: '1px solid #fecaca',
                              borderRadius: '8px',
                              padding: '6px 14px',
                              background: '#fff',
                              '&:hover': {
                                background: '#fef2f2',
                                borderColor: '#f87171',
                              },
                            }}
                          >
                            <i className="fas fa-times-circle" style={{ marginRight: 6, fontSize: 12 }}></i>
                            Revoke
                          </Button>
                        ) : (
                          <Chip
                            label="Revoked"
                            size="small"
                            sx={{
                              fontSize: '11px',
                              fontWeight: 600,
                              backgroundColor: '#f1f5f9',
                              color: '#64748b',
                            }}
                          />
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card
          sx={{
            borderRadius: '12px',
            border: '1px solid #e0e7ff',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(124, 58, 237, 0.05))',
            boxShadow: 'none',
            mt: '20px',
          }}
        >
          <CardContent sx={{ padding: '18px 20px !important' }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '14px',
                  flexShrink: 0,
                }}
              >
                <i className="fas fa-info-circle"></i>
              </Box>
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', mb: '4px' }}>
                  Your Privacy Rights
                </Typography>
                <Typography sx={{ fontSize: '13px', color: '#64748b', lineHeight: 1.6 }}>
                  Under GDPR, you have the right to withdraw consent at any time. Revoking consent will not affect the
                  lawfulness of processing based on consent before its withdrawal. Some services may be limited after
                  consent is revoked.
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Revoke Confirmation Dialog */}
      <Dialog
        open={revokeDialogOpen}
        onClose={() => setRevokeDialogOpen(false)}
        PaperProps={{
          sx: {
            borderRadius: '16px',
            maxWidth: '420px',
            width: '100%',
          },
        }}
      >
        <DialogTitle sx={{ padding: '24px 24px 16px', textAlign: 'center' }}>
          <Box
            sx={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              background: '#fef2f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#dc2626',
              fontSize: '24px',
            }}
          >
            <i className="fas fa-exclamation-triangle"></i>
          </Box>
          <Typography sx={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>Revoke Consent</Typography>
        </DialogTitle>
        <DialogContent sx={{ padding: '0 24px 16px', textAlign: 'center' }}>
          <Typography sx={{ fontSize: '14px', color: '#64748b', lineHeight: 1.6 }}>
            Are you sure you want to revoke your consent for{' '}
            <strong style={{ color: '#1e293b' }}>
              {selectedConsent ? formatConsentType(selectedConsent.consent_type) : ''}
            </strong>
            ? This action may limit certain features.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px 24px', gap: '12px', justifyContent: 'center' }}>
          <Button
            onClick={() => setRevokeDialogOpen(false)}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '14px',
              color: '#64748b',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '10px 24px',
              '&:hover': { background: '#f8fafc', borderColor: '#cbd5e1' },
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleRevoke}
            disabled={revoking}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '14px',
              color: '#fff',
              background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
              borderRadius: '10px',
              padding: '10px 24px',
              boxShadow: '0 4px 12px rgba(220, 38, 38, 0.35)',
              '&:hover': {
                background: 'linear-gradient(135deg, #b91c1c, #991b1b)',
              },
              '&.Mui-disabled': {
                background: '#e2e8f0',
                color: '#94a3b8',
                boxShadow: 'none',
              },
            }}
          >
            {revoking ? (
              <>
                <CircularProgress size={16} sx={{ color: '#fff', mr: 1 }} />
                Revoking...
              </>
            ) : (
              'Revoke Consent'
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Grant Consent Dialog */}
      <Dialog
        open={grantDialogOpen}
        onClose={() => {
          setGrantDialogOpen(false);
          setSelectedConsentType('');
        }}
        PaperProps={{
          sx: {
            borderRadius: '16px',
            maxWidth: '500px',
            width: '100%',
          },
        }}
      >
        <DialogTitle sx={{ padding: '24px 24px 16px', textAlign: 'center' }}>
          <Box
            sx={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              background: '#d1fae5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#059669',
              fontSize: '24px',
            }}
          >
            <i className="fas fa-plus-circle"></i>
          </Box>
          <Typography sx={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>Grant Consent</Typography>
          <Typography sx={{ fontSize: '13px', color: '#64748b', mt: '4px' }}>
            Select the type of consent you want to grant
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ padding: '0 24px 16px' }}>
          {availableConsentTypes.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: '20px' }}>
              <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
                You have already granted all available consents.
              </Typography>
            </Box>
          ) : (
            <FormControl component="fieldset" sx={{ width: '100%' }}>
              <RadioGroup
                value={selectedConsentType}
                onChange={(e) => setSelectedConsentType(e.target.value)}
              >
                {availableConsentTypes.map((type) => {
                  const colors = getConsentColor(type.value);
                  return (
                    <Box
                      key={type.value}
                      sx={{
                        border: selectedConsentType === type.value ? '2px solid #10b981' : '1px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '14px 16px',
                        mb: '10px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        background: selectedConsentType === type.value ? '#f0fdf4' : '#fff',
                        '&:hover': { borderColor: '#10b981', background: '#f0fdf4' },
                      }}
                      onClick={() => setSelectedConsentType(type.value)}
                    >
                      <FormControlLabel
                        value={type.value}
                        control={<Radio sx={{ color: '#10b981', '&.Mui-checked': { color: '#10b981' } }} />}
                        label={
                          <Box sx={{ ml: '8px' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <Box
                                sx={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: '8px',
                                  background: colors.bg,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: colors.icon,
                                  fontSize: '14px',
                                }}
                              >
                                <i className={`fas ${getConsentIcon(type.value)}`}></i>
                              </Box>
                              <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                                {type.label}
                              </Typography>
                            </Box>
                            <Typography sx={{ fontSize: '12px', color: '#64748b', mt: '4px', ml: '42px' }}>
                              {type.description}
                            </Typography>
                          </Box>
                        }
                        sx={{ margin: 0, width: '100%' }}
                      />
                    </Box>
                  );
                })}
              </RadioGroup>
            </FormControl>
          )}
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px 24px', gap: '12px', justifyContent: 'center' }}>
          <Button
            onClick={() => {
              setGrantDialogOpen(false);
              setSelectedConsentType('');
            }}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '14px',
              color: '#64748b',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '10px 24px',
              '&:hover': { background: '#f8fafc', borderColor: '#cbd5e1' },
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleGrantConsent}
            disabled={granting || !selectedConsentType}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '14px',
              color: '#fff',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              borderRadius: '10px',
              padding: '10px 24px',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)',
              '&:hover': {
                background: 'linear-gradient(135deg, #059669, #047857)',
              },
              '&.Mui-disabled': {
                background: '#e2e8f0',
                color: '#94a3b8',
                boxShadow: 'none',
              },
            }}
          >
            {granting ? (
              <>
                <CircularProgress size={16} sx={{ color: '#fff', mr: 1 }} />
                Granting...
              </>
            ) : (
              <>
                <i className="fas fa-check" style={{ marginRight: 8 }}></i>
                Grant Consent
              </>
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Navigation>
  );
};

export default ConsentManager;
