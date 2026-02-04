import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  Button,
  TextField,
  Alert,
  Box,
  Typography,
  IconButton,
  InputAdornment,
  Fade,
  Chip,
} from '@mui/material';
import {
  Close,
  Visibility,
  VisibilityOff,
  CheckCircle,
  Cable,
  Key,
  Link,
  ArrowForward,
} from '@mui/icons-material';
import atsService from '../../services/atsService';

interface Connection {
  id?: number;
  provider: string;
  api_key?: string;
  base_url?: string;
}

interface ATSConnectionFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  connection?: Connection;
}

// Provider configuration
const providers = [
  {
    id: 'greenhouse',
    name: 'Greenhouse',
    color: '#24a47f',
    bg: '#e6f7f1',
    description: 'Recruiting software for growing companies',
    popular: true,
  },
  {
    id: 'lever',
    name: 'Lever',
    color: '#5c5ce0',
    bg: '#eeeeff',
    description: 'Talent acquisition suite',
    popular: true,
  },
  {
    id: 'bamboohr',
    name: 'BambooHR',
    color: '#73c41d',
    bg: '#f0f9e6',
    description: 'HR software for small & medium businesses',
    popular: false,
  },
  {
    id: 'workday',
    name: 'Workday',
    color: '#0062ff',
    bg: '#e6f0ff',
    description: 'Enterprise HR management',
    popular: false,
  },
  {
    id: 'icims',
    name: 'iCIMS',
    color: '#ff6b00',
    bg: '#fff3e6',
    description: 'Talent cloud platform',
    popular: false,
  },
  {
    id: 'taleo',
    name: 'Taleo',
    color: '#c74634',
    bg: '#fbeae8',
    description: 'Oracle talent management',
    popular: false,
  },
];

const ATSConnectionForm: React.FC<ATSConnectionFormProps> = ({ open, onClose, onSaved, connection }) => {
  const [step, setStep] = useState(1);
  const [provider, setProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [touched, setTouched] = useState({ apiKey: false });

  useEffect(() => {
    if (open) {
      if (connection) {
        setProvider(connection.provider || '');
        setApiKey('');
        setBaseUrl(connection.base_url || '');
        setStep(2);
      } else {
        setProvider('');
        setApiKey('');
        setBaseUrl('');
        setStep(1);
      }
      setError('');
      setTouched({ apiKey: false });
      setShowApiKey(false);
    }
  }, [connection, open]);

  const selectedProvider = providers.find((p) => p.id === provider.toLowerCase() || p.name === provider);

  const handleSelectProvider = (providerId: string) => {
    setProvider(providerId);
    setStep(2);
  };

  const handleBack = () => {
    if (!connection) {
      setStep(1);
      setProvider('');
    }
  };

  const handleSubmit = async () => {
    if (!provider || !apiKey) {
      setError('API Key is required');
      setTouched({ apiKey: true });
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { provider: selectedProvider?.name || provider, api_key: apiKey, base_url: baseUrl };
      if (connection?.id) {
        await atsService.updateConnection(connection.id, payload);
      } else {
        await atsService.createConnection(payload);
      }
      onSaved();
    } catch (err) {
      setError('Failed to save connection. Please check your credentials.');
    } finally {
      setSaving(false);
    }
  };

  const isApiKeyValid = apiKey.length >= 10;

  // Input styles
  const inputStyles = {
    '& .MuiOutlinedInput-root': {
      borderRadius: '10px',
      backgroundColor: '#fff',
      transition: 'all 0.15s ease',
      '&:hover': {
        backgroundColor: '#fafafa',
      },
      '&.Mui-focused': {
        backgroundColor: '#fff',
        boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.15)',
        '& .MuiOutlinedInput-notchedOutline': {
          borderColor: '#3b82f6',
          borderWidth: '1.5px',
        },
      },
      '&.Mui-error .MuiOutlinedInput-notchedOutline': {
        borderColor: '#ef4444',
      },
    },
    '& .MuiInputLabel-root.Mui-focused': {
      color: '#3b82f6',
    },
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '20px',
          overflow: 'hidden',
          maxHeight: '90vh',
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          padding: '24px 24px 20px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(180deg, #fff 0%, #fafbfc 100%)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '12px',
              background: selectedProvider
                ? `linear-gradient(135deg, ${selectedProvider.color}20 0%, ${selectedProvider.color}40 100%)`
                : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: selectedProvider ? `2px solid ${selectedProvider.color}30` : 'none',
            }}
          >
            {selectedProvider ? (
              <Typography sx={{ fontSize: '20px', fontWeight: 700, color: selectedProvider.color }}>
                {selectedProvider.name[0]}
              </Typography>
            ) : (
              <Cable sx={{ color: '#fff', fontSize: '24px' }} />
            )}
          </Box>
          <Box>
            <Typography sx={{ fontSize: '18px', fontWeight: 600, color: '#1e293b' }}>
              {connection ? 'Edit Connection' : step === 1 ? 'Choose ATS Provider' : 'Connect to ' + (selectedProvider?.name || 'ATS')}
            </Typography>
            <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
              {step === 1 ? 'Select your Applicant Tracking System' : 'Enter your API credentials'}
            </Typography>
          </Box>
        </Box>
        <IconButton
          onClick={onClose}
          sx={{
            color: '#94a3b8',
            '&:hover': { backgroundColor: '#f1f5f9', color: '#64748b' },
          }}
        >
          <Close />
        </IconButton>
      </Box>

      <DialogContent sx={{ padding: '24px !important' }}>
        {error && (
          <Alert
            severity="error"
            sx={{
              mb: 3,
              borderRadius: '10px',
              border: '1px solid #fecaca',
            }}
            onClose={() => setError('')}
          >
            {error}
          </Alert>
        )}

        {/* Step 1: Provider Selection */}
        {step === 1 && (
          <Fade in>
            <Box>
              {/* Popular Providers */}
              <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', mb: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Popular Integrations
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', mb: '20px' }}>
                {providers
                  .filter((p) => p.popular)
                  .map((p) => (
                    <Box
                      key={p.id}
                      onClick={() => handleSelectProvider(p.id)}
                      sx={{
                        padding: '16px',
                        borderRadius: '12px',
                        border: '1px solid #e5e7eb',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          borderColor: p.color,
                          backgroundColor: p.bg,
                          transform: 'translateY(-2px)',
                          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                        },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', mb: '8px' }}>
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: '10px',
                            backgroundColor: p.bg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: p.color,
                            fontSize: '18px',
                            fontWeight: 700,
                            border: `2px solid ${p.color}30`,
                          }}
                        >
                          {p.name[0]}
                        </Box>
                        <Box>
                          <Typography sx={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>{p.name}</Typography>
                          <Chip label="Popular" size="small" sx={{ height: '18px', fontSize: '10px', backgroundColor: '#fffbeb', color: '#d97706' }} />
                        </Box>
                      </Box>
                      <Typography sx={{ fontSize: '12px', color: '#64748b' }}>{p.description}</Typography>
                    </Box>
                  ))}
              </Box>

              {/* All Providers */}
              <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', mb: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                All Providers
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {providers
                  .filter((p) => !p.popular)
                  .map((p) => (
                    <Box
                      key={p.id}
                      onClick={() => handleSelectProvider(p.id)}
                      sx={{
                        padding: '12px 16px',
                        borderRadius: '10px',
                        border: '1px solid #e5e7eb',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          borderColor: p.color,
                          backgroundColor: p.bg,
                        },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Box
                          sx={{
                            width: 36,
                            height: 36,
                            borderRadius: '8px',
                            backgroundColor: p.bg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: p.color,
                            fontSize: '15px',
                            fontWeight: 700,
                          }}
                        >
                          {p.name[0]}
                        </Box>
                        <Box>
                          <Typography sx={{ fontSize: '14px', fontWeight: 500, color: '#1e293b' }}>{p.name}</Typography>
                          <Typography sx={{ fontSize: '12px', color: '#94a3b8' }}>{p.description}</Typography>
                        </Box>
                      </Box>
                      <ArrowForward sx={{ color: '#cbd5e1', fontSize: '18px' }} />
                    </Box>
                  ))}
              </Box>
            </Box>
          </Fade>
        )}

        {/* Step 2: Credentials Form */}
        {step === 2 && (
          <Fade in>
            <Box>
              {/* Selected Provider Info */}
              {selectedProvider && !connection && (
                <Box
                  sx={{
                    padding: '16px',
                    borderRadius: '12px',
                    backgroundColor: selectedProvider.bg,
                    border: `1px solid ${selectedProvider.color}20`,
                    mb: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Box
                      sx={{
                        width: 44,
                        height: 44,
                        borderRadius: '10px',
                        backgroundColor: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: selectedProvider.color,
                        fontSize: '20px',
                        fontWeight: 700,
                        border: `2px solid ${selectedProvider.color}30`,
                      }}
                    >
                      {selectedProvider.name[0]}
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>{selectedProvider.name}</Typography>
                      <Typography sx={{ fontSize: '12px', color: '#64748b' }}>{selectedProvider.description}</Typography>
                    </Box>
                  </Box>
                  <Button
                    size="small"
                    onClick={handleBack}
                    sx={{
                      textTransform: 'none',
                      color: '#64748b',
                      fontSize: '13px',
                      '&:hover': { backgroundColor: '#fff' },
                    }}
                  >
                    Change
                  </Button>
                </Box>
              )}

              {/* API Key Field */}
              <Box sx={{ mb: '20px' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: '8px' }}>
                  <Typography
                    sx={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#374151',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Key sx={{ fontSize: '14px', color: '#6b7280' }} />
                    API Key <span style={{ color: '#ef4444' }}>*</span>
                  </Typography>
                  {touched.apiKey && (
                    <Fade in>
                      <Box
                        sx={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: isApiKeyValid ? '#dcfce7' : '#fef2f2',
                        }}
                      >
                        {isApiKeyValid ? (
                          <CheckCircle sx={{ fontSize: '14px', color: '#16a34a' }} />
                        ) : (
                          <Close sx={{ fontSize: '12px', color: '#ef4444' }} />
                        )}
                      </Box>
                    </Fade>
                  )}
                </Box>
                <TextField
                  type={showApiKey ? 'text' : 'password'}
                  fullWidth
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onBlur={() => setTouched({ ...touched, apiKey: true })}
                  placeholder={connection ? '••••••••••••••••' : 'Enter your API key'}
                  error={touched.apiKey && !isApiKeyValid}
                  helperText={touched.apiKey && !isApiKeyValid ? 'API key must be at least 10 characters' : ''}
                  sx={inputStyles}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowApiKey(!showApiKey)}
                          edge="end"
                          sx={{ color: '#94a3b8' }}
                        >
                          {showApiKey ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>

              {/* Base URL Field */}
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: '8px' }}>
                  <Typography
                    sx={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#374151',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Link sx={{ fontSize: '14px', color: '#6b7280' }} />
                    Base URL
                    <Chip label="Optional" size="small" sx={{ ml: 1, height: '18px', fontSize: '10px', backgroundColor: '#f1f5f9', color: '#64748b' }} />
                  </Typography>
                </Box>
                <TextField
                  fullWidth
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com"
                  sx={inputStyles}
                />
                <Typography sx={{ fontSize: '12px', color: '#94a3b8', mt: '6px', ml: '2px' }}>
                  Override the default API endpoint if needed
                </Typography>
              </Box>

              {/* Help Text */}
              <Box
                sx={{
                  mt: '24px',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e5e7eb',
                }}
              >
                <Typography sx={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
                  <strong style={{ color: '#475569' }}>Where to find your API key:</strong> Go to your{' '}
                  {selectedProvider?.name || 'ATS'} account settings → Integrations or API section → Generate a new API key
                  or copy your existing one.
                </Typography>
              </Box>
            </Box>
          </Fade>
        )}
      </DialogContent>

      {/* Footer Actions */}
      {step === 2 && (
        <Box
          sx={{
            padding: '16px 24px 24px',
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
          }}
        >
          <Button
            onClick={onClose}
            sx={{
              borderRadius: '10px',
              textTransform: 'none',
              fontWeight: 500,
              fontSize: '14px',
              padding: '10px 20px',
              color: '#64748b',
              '&:hover': { backgroundColor: '#f1f5f9' },
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={saving || !apiKey}
            sx={{
              borderRadius: '10px',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '14px',
              padding: '10px 24px',
              background: saving || !apiKey ? '#e5e7eb' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: saving || !apiKey ? '#9ca3af' : '#fff',
              boxShadow: saving || !apiKey ? 'none' : '0 4px 14px rgba(245, 158, 11, 0.35)',
              '&:hover': {
                background: saving || !apiKey ? '#e5e7eb' : 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
              },
              '&.Mui-disabled': {
                background: '#e5e7eb',
                color: '#9ca3af',
              },
            }}
          >
            {saving ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Box
                  sx={{
                    width: 16,
                    height: 16,
                    border: '2px solid #fff',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    '@keyframes spin': {
                      '0%': { transform: 'rotate(0deg)' },
                      '100%': { transform: 'rotate(360deg)' },
                    },
                  }}
                />
                Connecting...
              </Box>
            ) : connection ? (
              'Update Connection'
            ) : (
              'Connect'
            )}
          </Button>
        </Box>
      )}
    </Dialog>
  );
};

export default ATSConnectionForm;
