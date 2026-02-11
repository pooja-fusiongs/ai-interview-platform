import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Chip, CircularProgress, Alert, IconButton, LinearProgress
} from '@mui/material';
import {
  ArrowBack,
  Security,
  Mic,
  RecordVoiceOver,
  Accessibility,
  Warning,
  CheckCircle,
  Error,
  Info,
  Shield,
  TrendingUp,
  Flag
} from '@mui/icons-material';
import Navigation from '../layout/Sidebar';
import fraudDetectionService from '../../services/fraudDetectionService';

const getScoreColor = (score: number): string => {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#020291';
  return '#ef4444';
};

const getScoreBg = (score: number): string => {
  if (score >= 80) return '#ecfdf5';
  if (score >= 60) return '#EEF0FF';
  return '#fef2f2';
};

const getScoreLabel = (score: number): string => {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Moderate';
  return 'Concerning';
};

const getSeverityConfig = (severity: string) => {
  switch (severity?.toLowerCase()) {
    case 'high':
      return { color: '#ef4444', bg: '#fef2f2', icon: <Error sx={{ fontSize: 16 }} /> };
    case 'medium':
      return { color: '#020291', bg: '#EEF0FF', icon: <Warning sx={{ fontSize: 16 }} /> };
    default:
      return { color: '#3b82f6', bg: '#eff6ff', icon: <Info sx={{ fontSize: 16 }} /> };
  }
};

// Circular Progress Score Component
const CircularScore: React.FC<{ score: number; size?: number; thickness?: number }> = ({
  score,
  size = 160,
  thickness = 8
}) => {
  const normalizedScore = Math.min(Math.max(score || 0, 0), 100);
  const circumference = 2 * Math.PI * ((size - thickness) / 2);
  const strokeDashoffset = circumference - (normalizedScore / 100) * circumference;
  const color = getScoreColor(normalizedScore);

  return (
    <Box sx={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={(size - thickness) / 2}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={(size - thickness) / 2}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center'
        }}
      >
        <Typography sx={{ fontSize: size / 3.5, fontWeight: 800, color, lineHeight: 1 }}>
          {normalizedScore}%
        </Typography>
        <Typography sx={{ fontSize: size / 12, color: '#64748b', fontWeight: 600 }}>
          {getScoreLabel(normalizedScore)}
        </Typography>
      </Box>
    </Box>
  );
};

// Score Card Component
const ScoreCard: React.FC<{
  title: string;
  score: number;
  details: string;
  icon: React.ReactNode;
  iconBg: string;
}> = ({ title, score, details, icon, iconBg }) => {
  const color = getScoreColor(score);
  const bg = getScoreBg(score);

  return (
    <Box sx={{
      background: 'white',
      borderRadius: '16px',
      border: '1px solid #e2e8f0',
      padding: '24px',
      height: '100%',
      transition: 'all 0.3s ease',
      '&:hover': {
        boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
        transform: 'translateY(-2px)'
      }
    }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{
          width: 48,
          height: 48,
          borderRadius: '12px',
          background: iconBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {icon}
        </Box>
        <Chip
          label={getScoreLabel(score)}
          size="small"
          sx={{
            background: bg,
            color: color,
            fontWeight: 600,
            fontSize: '11px',
            border: `1px solid ${color}30`
          }}
        />
      </Box>

      <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#64748b', mb: 1 }}>
        {title}
      </Typography>

      <Typography sx={{ fontSize: '36px', fontWeight: 800, color, mb: 2, lineHeight: 1 }}>
        {score}%
      </Typography>

      <Box sx={{ mb: 2 }}>
        <LinearProgress
          variant="determinate"
          value={score}
          sx={{
            height: 8,
            borderRadius: 4,
            backgroundColor: '#f1f5f9',
            '& .MuiLinearProgress-bar': {
              borderRadius: 4,
              backgroundColor: color
            }
          }}
        />
      </Box>

      <Typography sx={{ fontSize: '13px', color: '#64748b', lineHeight: 1.6 }}>
        {details || 'No additional details available'}
      </Typography>
    </Box>
  );
};

const FraudAnalysisPanel: React.FC = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    const fetchOrTriggerAnalysis = async () => {
      try {
        // First try to get existing analysis
        const data = await fraudDetectionService.getAnalysis(Number(videoId));
        setAnalysis(data);
        setLoading(false);
      } catch (err: any) {
        // If 404, trigger new analysis
        if (err.response?.status === 404 || err.message?.includes('404')) {
          setAnalyzing(true);
          try {
            // Trigger fraud analysis
            const newAnalysis = await fraudDetectionService.triggerAnalysis(Number(videoId));
            setAnalysis(newAnalysis);
          } catch (triggerErr: any) {
            setError(triggerErr.response?.data?.detail || triggerErr.message || 'Failed to trigger analysis.');
          } finally {
            setAnalyzing(false);
            setLoading(false);
          }
        } else {
          setError(err.response?.data?.detail || err.message || 'Failed to load analysis.');
          setLoading(false);
        }
      }
    };
    if (videoId) fetchOrTriggerAnalysis();
  }, [videoId]);

  if (loading || analyzing) {
    return (
      <Navigation>
        <Box sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #f8f9fb 0%, #eef2f6 100%)'
        }}>
          <Box sx={{ textAlign: 'center' }}>
            <CircularProgress sx={{ color: '#020291', mb: 2 }} />
            <Typography sx={{ color: '#64748b', fontWeight: 600 }}>
              {analyzing ? 'Running fraud analysis...' : 'Loading analysis data...'}
            </Typography>
            {analyzing && (
              <Typography sx={{ color: '#94a3b8', fontSize: '14px', mt: 1 }}>
                This may take a few moments
              </Typography>
            )}
          </Box>
        </Box>
      </Navigation>
    );
  }

  const overallScore = analysis?.overall_trust_score || 0;
  // Parse flags - may be JSON string or array
  let flags: any[] = [];
  if (analysis?.flags) {
    if (typeof analysis.flags === 'string') {
      try {
        flags = JSON.parse(analysis.flags);
      } catch {
        flags = [];
      }
    } else if (Array.isArray(analysis.flags)) {
      flags = analysis.flags;
    }
  }

  return (
    <Navigation>
      <Box sx={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #f8f9fb 0%, #eef2f6 100%)',
        padding: '24px'
      }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconButton
              onClick={() => navigate(`/video-detail/${videoId}`)}
              sx={{
                background: 'white',
                border: '1px solid #e2e8f0',
                '&:hover': { background: '#f8fafc' }
              }}
            >
              <ArrowBack sx={{ color: '#64748b' }} />
            </IconButton>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{
                width: 48,
                height: 48,
                borderRadius: '12px',
                background: ' #020291',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(2, 2, 145, 0.3)'
              }}>
                <Security sx={{ color: 'white', fontSize: 24 }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '28px', fontWeight: 700, color: '#1e293b' }}>
                  Fraud Analysis
                </Typography>
                <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
                  Interview #{videoId} • AI-Powered Detection
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: '12px' }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {analysis && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '350px 1fr' }, gap: 3 }}>
            {/* Left Sidebar - Overall Score */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Trust Score Card */}
              <Box sx={{
                background: 'white',
                borderRadius: '20px',
                border: '1px solid #e2e8f0',
                padding: '32px',
                textAlign: 'center'
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 3 }}>
                  <Shield sx={{ color: '#020291', fontSize: 24 }} />
                  <Typography sx={{ fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>
                    Overall Trust Score
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
                  <CircularScore score={overallScore} size={180} thickness={12} />
                </Box>

                <Box sx={{
                  background: getScoreBg(overallScore),
                  borderRadius: '12px',
                  padding: '16px',
                  border: `1px solid ${getScoreColor(overallScore)}30`
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
                    {overallScore >= 80 ? (
                      <CheckCircle sx={{ color: '#10b981', fontSize: 20 }} />
                    ) : overallScore >= 60 ? (
                      <Warning sx={{ color: '#020291', fontSize: 20 }} />
                    ) : (
                      <Error sx={{ color: '#ef4444', fontSize: 20 }} />
                    )}
                    <Typography sx={{ fontSize: '14px', fontWeight: 700, color: getScoreColor(overallScore) }}>
                      {overallScore >= 80 ? 'Low Risk' : overallScore >= 60 ? 'Moderate Risk' : 'High Risk'}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                    {overallScore >= 80
                      ? 'Interview appears authentic with no significant concerns.'
                      : overallScore >= 60
                      ? 'Some anomalies detected. Manual review recommended.'
                      : 'Multiple red flags detected. Thorough review required.'}
                  </Typography>
                </Box>
              </Box>

              {/* Quick Stats */}
              <Box sx={{
                background: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                padding: '24px'
              }}>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TrendingUp sx={{ fontSize: 18 }} />
                  Analysis Summary
                </Typography>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography sx={{ fontSize: '14px', color: '#64748b' }}>Total Flags</Typography>
                    <Chip
                      label={flags.length}
                      size="small"
                      sx={{
                        background: flags.length > 0 ? '#fef2f2' : '#ecfdf5',
                        color: flags.length > 0 ? '#ef4444' : '#10b981',
                        fontWeight: 700
                      }}
                    />
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography sx={{ fontSize: '14px', color: '#64748b' }}>High Severity</Typography>
                    <Chip
                      label={flags.filter((f: any) => f.severity === 'high').length}
                      size="small"
                      sx={{ background: '#fef2f2', color: '#ef4444', fontWeight: 700 }}
                    />
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography sx={{ fontSize: '14px', color: '#64748b' }}>Medium Severity</Typography>
                    <Chip
                      label={flags.filter((f: any) => f.severity === 'medium').length}
                      size="small"
                      sx={{ background: '#EEF0FF', color: '#020291', fontWeight: 700 }}
                    />
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography sx={{ fontSize: '14px', color: '#64748b' }}>Low Severity</Typography>
                    <Chip
                      label={flags.filter((f: any) => f.severity === 'low').length}
                      size="small"
                      sx={{ background: '#eff6ff', color: '#3b82f6', fontWeight: 700 }}
                    />
                  </Box>
                </Box>
              </Box>
            </Box>

            {/* Right Content */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Score Cards Grid */}
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3 }}>
                <ScoreCard
                  title="Voice Consistency"
                  score={analysis.voice_consistency_score || 0}
                  details={analysis.voice_consistency_details}
                  icon={<Mic sx={{ color: '#3b82f6', fontSize: 24 }} />}
                  iconBg="#eff6ff"
                />
                <ScoreCard
                  title="Lip-Sync Analysis"
                  score={analysis.lip_sync_score || 0}
                  details={analysis.lip_sync_details}
                  icon={<RecordVoiceOver sx={{ color: '#8b5cf6', fontSize: 24 }} />}
                  iconBg="#f5f3ff"
                />
                <ScoreCard
                  title="Body Movement"
                  score={analysis.body_movement_score || 0}
                  details={analysis.body_movement_details}
                  icon={<Accessibility sx={{ color: '#10b981', fontSize: 24 }} />}
                  iconBg="#ecfdf5"
                />
              </Box>

              {/* Flags Section */}
              <Box sx={{
                background: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                overflow: 'hidden'
              }}>
                <Box sx={{
                  padding: '20px 24px',
                  borderBottom: '1px solid #f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{
                      width: 40,
                      height: 40,
                      borderRadius: '10px',
                      background: '#fef2f2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Flag sx={{ color: '#ef4444', fontSize: 20 }} />
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
                        Detected Flags
                      </Typography>
                      <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
                        Anomalies and concerns identified during analysis
                      </Typography>
                    </Box>
                  </Box>
                  <Chip
                    label={`${flags.length} ${flags.length === 1 ? 'Flag' : 'Flags'}`}
                    sx={{
                      background: flags.length > 0 ? '#fef2f2' : '#ecfdf5',
                      color: flags.length > 0 ? '#ef4444' : '#10b981',
                      fontWeight: 700,
                      fontSize: '13px'
                    }}
                  />
                </Box>

                <Box sx={{ padding: '24px' }}>
                  {flags.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                      <Box sx={{
                        width: 64,
                        height: 64,
                        borderRadius: '50%',
                        background: '#ecfdf5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px'
                      }}>
                        <CheckCircle sx={{ color: '#10b981', fontSize: 32 }} />
                      </Box>
                      <Typography sx={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', mb: 1 }}>
                        No Flags Detected
                      </Typography>
                      <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
                        The interview analysis did not identify any concerning behaviors.
                      </Typography>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {flags.map((flag: any, idx: number) => {
                        const severityConfig = getSeverityConfig(flag.severity);
                        return (
                          <Box
                            key={idx}
                            sx={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 3,
                              padding: '16px',
                              background: '#f8fafc',
                              borderRadius: '12px',
                              border: '1px solid #e2e8f0',
                              transition: 'all 0.2s ease',
                              '&:hover': {
                                background: '#f1f5f9',
                                borderColor: '#cbd5e1'
                              }
                            }}
                          >
                            <Box sx={{
                              width: 36,
                              height: 36,
                              borderRadius: '10px',
                              background: severityConfig.bg,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              {severityConfig.icon}
                            </Box>
                            <Box sx={{ flex: 1 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                                  {flag.type || 'Unknown Flag'}
                                </Typography>
                                <Chip
                                  label={flag.severity?.toUpperCase() || 'INFO'}
                                  size="small"
                                  sx={{
                                    background: severityConfig.bg,
                                    color: severityConfig.color,
                                    fontWeight: 700,
                                    fontSize: '10px',
                                    height: '20px',
                                    border: `1px solid ${severityConfig.color}30`
                                  }}
                                />
                              </Box>
                              <Typography sx={{ fontSize: '13px', color: '#64748b', lineHeight: 1.6 }}>
                                {flag.description || 'No description provided'}
                              </Typography>
                              {flag.timestamp && (
                                <Typography sx={{ fontSize: '12px', color: '#94a3b8', mt: 1 }}>
                                  Detected at: {flag.timestamp}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                </Box>
              </Box>

              {/* Recommendations */}
              <Box sx={{
                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                borderRadius: '16px',
                padding: '24px',
                border: '1px solid #93c5fd'
              }}>
                <Typography sx={{ fontSize: '16px', fontWeight: 700, color: '#1e40af', mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Info sx={{ fontSize: 20 }} />
                  Recommendations
                </Typography>
                <Box component="ul" sx={{
                  margin: 0,
                  paddingLeft: '20px',
                  color: '#1e3a8a',
                  fontSize: '14px',
                  lineHeight: 2
                }}>
                  {overallScore >= 80 ? (
                    <>
                      <li>Interview appears authentic - proceed with standard evaluation</li>
                      <li>Consider for next stage based on performance metrics</li>
                      <li>No additional verification needed</li>
                    </>
                  ) : overallScore >= 60 ? (
                    <>
                      <li>Review flagged segments manually before proceeding</li>
                      <li>Consider scheduling a follow-up verification interview</li>
                      <li>Cross-reference with other assessment data</li>
                    </>
                  ) : (
                    <>
                      <li>Conduct thorough manual review of the interview</li>
                      <li>Schedule an in-person or live verification interview</li>
                      <li>Verify candidate identity through additional means</li>
                      <li>Consider involving senior recruiters in the decision</li>
                    </>
                  )}
                </Box>
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </Navigation>
  );
};

export default FraudAnalysisPanel;
