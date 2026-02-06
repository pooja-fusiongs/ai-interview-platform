import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Chip, CircularProgress, Alert,
  TextField, Button, IconButton, Tooltip, Avatar, Divider,
  LinearProgress
} from '@mui/material';
import {
  ArrowBack,
  CalendarMonth,
  AccessTime,
  Videocam,
  Person,
  Work,
  Security,
  Save,
  ContentCopy,
  OpenInNew,
  PlayArrow,
  Cancel,
  CheckCircle,
  Description,
  Refresh,
  CloudUpload,
  Assessment,
  Star
} from '@mui/icons-material';
import Navigation from '../layout/sidebar';
import videoInterviewService from '../../services/videoInterviewService';
import { toast } from 'react-hot-toast';

const statusConfig: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
  scheduled: { color: '#3b82f6', bg: '#eff6ff', icon: <CalendarMonth sx={{ fontSize: 18 }} /> },
  in_progress: { color: '#f59e0b', bg: '#fffbeb', icon: <PlayArrow sx={{ fontSize: 18 }} /> },
  completed: { color: '#10b981', bg: '#ecfdf5', icon: <CheckCircle sx={{ fontSize: 18 }} /> },
  cancelled: { color: '#ef4444', bg: '#fef2f2', icon: <Cancel sx={{ fontSize: 18 }} /> },
};

const VideoInterviewDetail: React.FC = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const [interview, setInterview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptText, setTranscriptText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [scoreResult, setScoreResult] = useState<any>(null);
  const [editingTranscript, setEditingTranscript] = useState(false);

  useEffect(() => {
    const fetchInterview = async () => {
      try {
        const data = await videoInterviewService.getInterview(Number(videoId));
        setInterview(data);
        setNotes(data.notes || '');
        // Set transcript if it exists in the response
        if (data.transcript) {
          setTranscript(data.transcript);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load interview details.');
      } finally {
        setLoading(false);
      }
    };
    if (videoId) fetchInterview();
  }, [videoId]);

  const fetchTranscript = async () => {
    try {
      setTranscriptLoading(true);
      const data = await videoInterviewService.getTranscript(Number(videoId));
      setTranscript(data.transcript);
      toast.success('Transcript loaded successfully');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to load transcript');
    } finally {
      setTranscriptLoading(false);
    }
  };

  const handleUploadTranscript = async () => {
    if (!transcriptText.trim()) {
      toast.error('Please enter or paste the transcript text');
      return;
    }

    try {
      setUploading(true);
      const result = await videoInterviewService.uploadTranscriptAndScore(Number(videoId), transcriptText);

      if (result.score_generated && result.score_result) {
        setScoreResult(result.score_result);
        setTranscript(transcriptText);
        setEditingTranscript(false);
        setTranscriptText('');
        toast.success('Transcript uploaded and score generated successfully!');
        // Update interview status
        setInterview((prev: any) => ({ ...prev, status: 'completed' }));
      } else {
        setTranscript(transcriptText);
        setEditingTranscript(false);
        setTranscriptText('');
        // Show detailed error message
        if (result.scoring_error) {
          toast.error(`Scoring failed: ${result.scoring_error}`, { duration: 6000 });
        } else if (result.questions_found === 0) {
          toast.error('No questions found. Please generate and approve questions first.', { duration: 5000 });
        } else {
          toast.success(result.message || 'Transcript uploaded (scoring not available)');
        }
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error(err.response?.data?.detail || 'Failed to upload transcript');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveNotes = async () => {
    try {
      setSaving(true);
      await videoInterviewService.updateNotes(Number(videoId), notes);
      toast.success('Notes saved successfully');
    } catch {
      toast.error('Failed to save notes');
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  if (loading) {
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
            <CircularProgress sx={{ color: '#f59e0b', mb: 2 }} />
            <Typography sx={{ color: '#64748b' }}>Loading interview details...</Typography>
          </Box>
        </Box>
      </Navigation>
    );
  }

  const status = interview?.status || 'scheduled';
  const statusStyle = statusConfig[status] || statusConfig.scheduled;

  return (
    <Navigation>
      <Box sx={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #f8f9fb 0%, #eef2f6 100%)',
        padding: { xs: '12px', sm: '16px', md: '24px' }
      }}>
        {/* Header */}
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', mb: 3, gap: { xs: 2, sm: 0 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconButton
              onClick={() => navigate('/video-interviews')}
              sx={{
                background: 'white',
                border: '1px solid #e2e8f0',
                '&:hover': { background: '#f8fafc' }
              }}
            >
              <ArrowBack sx={{ color: '#64748b' }} />
            </IconButton>
            <Box>
              <Typography sx={{ fontSize: { xs: '22px', sm: '24px', md: '28px' }, fontWeight: 700, color: '#1e293b' }}>
                Interview Details
              </Typography>
              <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
                Interview ID: #{videoId}
              </Typography>
            </Box>
          </Box>
          <Chip
            icon={statusStyle.icon}
            label={status.replace('_', ' ').toUpperCase()}
            sx={{
              background: statusStyle.bg,
              color: statusStyle.color,
              fontWeight: 600,
              fontSize: '13px',
              padding: '4px 8px',
              border: `1px solid ${statusStyle.color}30`,
              '& .MuiChip-icon': { color: statusStyle.color }
            }}
          />
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: '12px' }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {interview && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3 }}>
            {/* Main Content */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Schedule & Meeting Card */}
              <Box sx={{
                background: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                overflow: 'hidden'
              }}>
                <Box sx={{
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  padding: '24px',
                  color: 'white'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Box sx={{
                      width: 48,
                      height: 48,
                      borderRadius: '12px',
                      background: 'rgba(255,255,255,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Videocam sx={{ fontSize: 24 }} />
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '20px', fontWeight: 700 }}>
                        {interview.job_title || 'Video Interview'}
                      </Typography>
                      <Typography sx={{ fontSize: '14px', opacity: 0.9 }}>
                        {interview.duration_minutes} minutes session
                      </Typography>
                    </Box>
                  </Box>
                </Box>

                <Box sx={{ padding: '24px' }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3 }}>
                    {/* Date */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                      <Box sx={{
                        width: 44,
                        height: 44,
                        borderRadius: '10px',
                        background: '#eff6ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <CalendarMonth sx={{ color: '#3b82f6', fontSize: 22 }} />
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', mb: 0.5 }}>
                          Date
                        </Typography>
                        <Typography sx={{ fontSize: '15px', color: '#1e293b', fontWeight: 600 }}>
                          {formatDate(interview.scheduled_at)}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Time */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                      <Box sx={{
                        width: 44,
                        height: 44,
                        borderRadius: '10px',
                        background: '#f0fdf4',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <AccessTime sx={{ color: '#10b981', fontSize: 22 }} />
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', mb: 0.5 }}>
                          Time
                        </Typography>
                        <Typography sx={{ fontSize: '15px', color: '#1e293b', fontWeight: 600 }}>
                          {formatTime(interview.scheduled_at)}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>

                  {/* Meeting Link */}
                  {(interview.zoom_meeting_url || interview.zoom_meeting_link) && (
                    <Box sx={{ mt: 3, pt: 3, borderTop: '1px solid #f1f5f9' }}>
                      <Typography sx={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', mb: 2 }}>
                        Meeting Link
                      </Typography>
                      <Box sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        background: '#f8fafc',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0'
                      }}>
                        <Typography sx={{
                          fontSize: '14px',
                          color: '#3b82f6',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {interview.zoom_meeting_url || interview.zoom_meeting_link}
                        </Typography>
                        <Tooltip title="Copy Link">
                          <IconButton
                            size="small"
                            onClick={() => copyToClipboard(interview.zoom_meeting_url || interview.zoom_meeting_link)}
                            sx={{ color: '#64748b' }}
                          >
                            <ContentCopy sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Open Meeting">
                          <IconButton
                            size="small"
                            onClick={() => window.open(interview.zoom_meeting_url || interview.zoom_meeting_link, '_blank')}
                            sx={{ color: '#3b82f6' }}
                          >
                            <OpenInNew sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                      {interview.zoom_passcode && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
                          <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
                            Passcode: <strong style={{ color: '#1e293b' }}>{interview.zoom_passcode}</strong>
                          </Typography>
                          <Tooltip title="Copy Passcode">
                            <IconButton
                              size="small"
                              onClick={() => copyToClipboard(interview.zoom_passcode)}
                              sx={{ color: '#64748b', padding: '4px' }}
                            >
                              <ContentCopy sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      )}
                    </Box>
                  )}

                  {/* Join Meeting Button */}
                  {(interview.zoom_meeting_url || interview.zoom_meeting_link) && status === 'scheduled' && (
                    <Button
                      variant="contained"
                      startIcon={<Videocam />}
                      onClick={() => window.open(interview.zoom_meeting_url || interview.zoom_meeting_link, '_blank')}
                      sx={{
                        mt: 3,
                        width: '100%',
                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        padding: '14px',
                        borderRadius: '10px',
                        fontWeight: 600,
                        fontSize: '15px',
                        textTransform: 'none',
                        boxShadow: '0 4px 14px rgba(245, 158, 11, 0.3)',
                        '&:hover': {
                          background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                          boxShadow: '0 6px 20px rgba(245, 158, 11, 0.4)'
                        }
                      }}
                    >
                      Join Meeting
                    </Button>
                  )}
                </Box>
              </Box>

              {/* Notes Section */}
              <Box sx={{
                background: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                padding: '24px'
              }}>
                <Typography sx={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <i className="fas fa-sticky-note" style={{ color: '#f59e0b' }}></i>
                  Interview Notes
                </Typography>
                <TextField
                  multiline
                  rows={5}
                  fullWidth
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about the interview, candidate performance, observations..."
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '12px',
                      background: '#f8fafc',
                      '&:hover': { background: '#f1f5f9' },
                      '&.Mui-focused': { background: 'white' }
                    }
                  }}
                />
                <Button
                  variant="contained"
                  startIcon={saving ? <CircularProgress size={18} sx={{ color: 'white' }} /> : <Save />}
                  onClick={handleSaveNotes}
                  disabled={saving}
                  sx={{
                    mt: 2,
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    padding: '10px 24px',
                    borderRadius: '10px',
                    fontWeight: 600,
                    textTransform: 'none',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
                    }
                  }}
                >
                  {saving ? 'Saving...' : 'Save Notes'}
                </Button>
              </Box>

              {/* Transcript Section */}
              <Box sx={{
                background: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                padding: '24px'
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography sx={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Description sx={{ color: '#8b5cf6' }} />
                    Interview Transcript
                  </Typography>
                  {transcript && (
                    <Tooltip title="Copy Transcript">
                      <IconButton
                        onClick={() => copyToClipboard(transcript)}
                        sx={{
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          '&:hover': {
                            background: '#f59e0b',
                            color: 'white',
                            borderColor: '#f59e0b'
                          }
                        }}
                      >
                        <ContentCopy sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>

                {/* Show existing transcript or upload form */}
                {transcript && !editingTranscript ? (
                  <Box>
                    <Box sx={{
                      background: '#f8fafc',
                      borderRadius: '12px',
                      padding: '20px',
                      maxHeight: '300px',
                      overflow: 'auto',
                      border: '1px solid #e2e8f0',
                      mb: 2
                    }}>
                      <Typography
                        component="pre"
                        sx={{
                          fontFamily: 'inherit',
                          fontSize: '14px',
                          color: '#374151',
                          lineHeight: 1.8,
                          whiteSpace: 'pre-wrap',
                          wordWrap: 'break-word',
                          margin: 0
                        }}
                      >
                        {transcript}
                      </Typography>
                    </Box>
                    {/* Re-upload button if no score generated yet */}
                    {!scoreResult && (
                      <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
                        <Button
                          variant="contained"
                          fullWidth
                          startIcon={uploading ? <CircularProgress size={18} sx={{ color: 'white' }} /> : <Refresh />}
                          onClick={async () => {
                            try {
                              setUploading(true);
                              const result = await videoInterviewService.uploadTranscriptAndScore(Number(videoId), transcript!);
                              if (result.score_generated && result.score_result) {
                                setScoreResult(result.score_result);
                                toast.success('Score generated successfully!');
                                setInterview((prev: any) => ({ ...prev, status: 'completed' }));
                              } else if (result.scoring_error) {
                                toast.error(`Scoring failed: ${result.scoring_error}`, { duration: 6000 });
                              } else {
                                toast.error('Scoring failed. Check backend logs for details.');
                              }
                            } catch (err: any) {
                              toast.error(err.response?.data?.detail || 'Failed to generate score');
                            } finally {
                              setUploading(false);
                            }
                          }}
                          disabled={uploading}
                          sx={{
                            padding: '12px',
                            borderRadius: '10px',
                            fontWeight: 600,
                            textTransform: 'none',
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            '&:hover': {
                              background: 'linear-gradient(135deg, #059669 0%, #047857 100%)'
                            }
                          }}
                        >
                          {uploading ? 'Generating Score...' : 'Retry Generate Score'}
                        </Button>
                        <Button
                          variant="outlined"
                          fullWidth
                          startIcon={<CloudUpload />}
                          onClick={() => {
                            setEditingTranscript(true);
                            setTranscriptText(transcript);
                          }}
                          disabled={uploading}
                          sx={{
                            padding: '12px',
                            borderRadius: '10px',
                            fontWeight: 600,
                            textTransform: 'none',
                            borderColor: '#8b5cf6',
                            color: '#8b5cf6',
                            '&:hover': {
                              borderColor: '#7c3aed',
                              background: 'rgba(139, 92, 246, 0.05)'
                            }
                          }}
                        >
                          Edit Transcript
                        </Button>
                      </Box>
                    )}
                  </Box>
                ) : (
                  <Box>
                    <TextField
                      multiline
                      rows={6}
                      fullWidth
                      value={transcriptText}
                      onChange={(e) => setTranscriptText(e.target.value)}
                      placeholder="Paste the interview transcript here...&#10;&#10;Example format:&#10;[00:00:00] Interviewer: Hello, welcome to the interview...&#10;[00:00:15] Candidate: Thank you for having me..."
                      sx={{
                        mb: 2,
                        '& .MuiOutlinedInput-root': {
                          borderRadius: '12px',
                          background: '#f8fafc',
                          fontSize: '14px',
                          '&:hover': { background: '#f1f5f9' },
                          '&.Mui-focused': { background: 'white' }
                        }
                      }}
                    />
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      {editingTranscript && (
                        <Button
                          variant="outlined"
                          onClick={() => {
                            setEditingTranscript(false);
                            setTranscriptText('');
                          }}
                          sx={{
                            padding: '14px 24px',
                            borderRadius: '10px',
                            fontWeight: 600,
                            textTransform: 'none',
                            borderColor: '#e2e8f0',
                            color: '#64748b',
                            '&:hover': {
                              borderColor: '#94a3b8',
                              background: '#f8fafc'
                            }
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                      <Button
                        variant="contained"
                        fullWidth
                        startIcon={uploading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : <CloudUpload />}
                        onClick={handleUploadTranscript}
                        disabled={uploading || !transcriptText.trim()}
                        sx={{
                          background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                          padding: '14px',
                          borderRadius: '10px',
                          fontWeight: 600,
                          fontSize: '15px',
                          textTransform: 'none',
                          boxShadow: '0 4px 14px rgba(139, 92, 246, 0.3)',
                          '&:hover': {
                            background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)'
                          },
                          '&:disabled': {
                            background: '#94a3b8',
                            color: 'white'
                          }
                        }}
                      >
                        {uploading ? 'Uploading & Generating Score...' : 'Upload & Generate Score'}
                      </Button>
                    </Box>
                  </Box>
                )}

                {interview.transcript_generated_at && (
                  <Typography sx={{ fontSize: '12px', color: '#94a3b8', mt: 2, textAlign: 'right' }}>
                    Generated: {new Date(interview.transcript_generated_at).toLocaleString()}
                  </Typography>
                )}
              </Box>

              {/* Score Results Section */}
              {scoreResult && (
                <Box sx={{
                  background: 'white',
                  borderRadius: '16px',
                  border: '1px solid #e2e8f0',
                  overflow: 'hidden'
                }}>
                  {/* Score Header */}
                  <Box sx={{
                    background: scoreResult.recommendation === 'select'
                      ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                      : scoreResult.recommendation === 'next_round'
                      ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                      : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    padding: '24px',
                    color: 'white',
                    textAlign: 'center'
                  }}>
                    <Box sx={{
                      width: 80,
                      height: 80,
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                      border: '3px solid rgba(255,255,255,0.3)'
                    }}>
                      <Typography sx={{ fontSize: '28px', fontWeight: 700 }}>
                        {Math.round(scoreResult.overall_score * 10)}%
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: '20px', fontWeight: 700, mb: 1 }}>
                      Interview Score
                    </Typography>
                    <Chip
                      icon={<Star sx={{ color: 'white !important' }} />}
                      label={scoreResult.recommendation?.replace('_', ' ').toUpperCase() || 'N/A'}
                      sx={{
                        background: 'rgba(255,255,255,0.2)',
                        color: 'white',
                        fontWeight: 700,
                        fontSize: '13px',
                        '& .MuiChip-icon': { color: 'white' }
                      }}
                    />
                  </Box>

                  <Box sx={{ padding: '24px' }}>
                    {/* Strengths & Weaknesses */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3, mb: 3 }}>
                      <Box sx={{
                        background: '#ecfdf5',
                        borderRadius: '12px',
                        padding: '16px',
                        border: '1px solid #a7f3d0'
                      }}>
                        <Typography sx={{ fontSize: '14px', fontWeight: 700, color: '#059669', mb: 1 }}>
                          Strengths
                        </Typography>
                        <Typography sx={{ fontSize: '13px', color: '#047857', lineHeight: 1.6 }}>
                          {scoreResult.strengths || 'N/A'}
                        </Typography>
                      </Box>
                      <Box sx={{
                        background: '#fef2f2',
                        borderRadius: '12px',
                        padding: '16px',
                        border: '1px solid #fecaca'
                      }}>
                        <Typography sx={{ fontSize: '14px', fontWeight: 700, color: '#dc2626', mb: 1 }}>
                          Areas for Improvement
                        </Typography>
                        <Typography sx={{ fontSize: '13px', color: '#b91c1c', lineHeight: 1.6 }}>
                          {scoreResult.weaknesses || 'N/A'}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Per Question Scores */}
                    {scoreResult.per_question && scoreResult.per_question.length > 0 && (
                      <Box>
                        <Typography sx={{ fontSize: '16px', fontWeight: 700, color: '#1e293b', mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Assessment sx={{ color: '#8b5cf6' }} />
                          Question-wise Analysis
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {scoreResult.per_question.map((pq: any, index: number) => (
                            <Box key={pq.question_id || index} sx={{
                              background: '#f8fafc',
                              borderRadius: '12px',
                              padding: '16px',
                              border: '1px solid #e2e8f0'
                            }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                                  Question {index + 1}
                                </Typography>
                                <Chip
                                  label={`${Math.round(pq.score * 10)}%`}
                                  size="small"
                                  sx={{
                                    background: pq.score >= 7 ? '#ecfdf5' : pq.score >= 5 ? '#fffbeb' : '#fef2f2',
                                    color: pq.score >= 7 ? '#059669' : pq.score >= 5 ? '#d97706' : '#dc2626',
                                    fontWeight: 700
                                  }}
                                />
                              </Box>
                              <LinearProgress
                                variant="determinate"
                                value={pq.score * 10}
                                sx={{
                                  height: 6,
                                  borderRadius: 3,
                                  mb: 1,
                                  backgroundColor: '#e2e8f0',
                                  '& .MuiLinearProgress-bar': {
                                    background: pq.score >= 7 ? '#10b981' : pq.score >= 5 ? '#f59e0b' : '#ef4444',
                                    borderRadius: 3
                                  }
                                }}
                              />
                              {pq.extracted_answer && (
                                <Typography sx={{ fontSize: '12px', color: '#64748b', mb: 1 }}>
                                  <strong>Answer:</strong> {pq.extracted_answer.substring(0, 150)}...
                                </Typography>
                              )}
                              {pq.feedback && (
                                <Typography sx={{ fontSize: '12px', color: '#475569', fontStyle: 'italic' }}>
                                  {pq.feedback}
                                </Typography>
                              )}
                            </Box>
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Box>
                </Box>
              )}
            </Box>

            {/* Sidebar */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Candidate Card */}
              <Box sx={{
                background: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                padding: '24px'
              }}>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Person sx={{ fontSize: 18 }} />
                  Candidate
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                  <Avatar sx={{
                    width: 56,
                    height: 56,
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    fontSize: '20px',
                    fontWeight: 600
                  }}>
                    {interview.candidate_name?.charAt(0).toUpperCase() || 'C'}
                  </Avatar>
                  <Box>
                    <Typography sx={{ fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>
                      {interview.candidate_name || 'N/A'}
                    </Typography>
                    <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
                      ID: {interview.candidate_id}
                    </Typography>
                  </Box>
                </Box>
                <Divider sx={{ my: 2 }} />
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Work sx={{ fontSize: 18 }} />
                  Interviewer
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Avatar sx={{
                    width: 48,
                    height: 48,
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    fontSize: '18px',
                    fontWeight: 600
                  }}>
                    {interview.interviewer_name?.charAt(0).toUpperCase() || 'I'}
                  </Avatar>
                  <Box>
                    <Typography sx={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>
                      {interview.interviewer_name || 'N/A'}
                    </Typography>
                    <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                      {interview.interviewer_id ? `ID: ${interview.interviewer_id}` : 'Not assigned'}
                    </Typography>
                  </Box>
                </Box>
              </Box>

              {/* Quick Actions */}
              <Box sx={{
                background: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                padding: '24px'
              }}>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', mb: 3 }}>
                  Quick Actions
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Button
                    variant="outlined"
                    startIcon={<Security />}
                    onClick={() => navigate(`/fraud-analysis/${videoId}`)}
                    sx={{
                      justifyContent: 'flex-start',
                      padding: '12px 16px',
                      borderRadius: '10px',
                      borderColor: '#e2e8f0',
                      color: '#475569',
                      fontWeight: 600,
                      textTransform: 'none',
                      '&:hover': {
                        borderColor: '#f59e0b',
                        background: 'rgba(245, 158, 11, 0.05)',
                        color: '#f59e0b'
                      }
                    }}
                  >
                    View Fraud Analysis
                  </Button>
                  <Tooltip title={scoreResult || transcript ? 'Interview completed - Video room not available' : 'Open video room for interview'}>
                    <span style={{ width: '100%' }}>
                      <Button
                        variant="outlined"
                        startIcon={<PlayArrow />}
                        onClick={() => navigate(`/video-room/${videoId}`)}
                        disabled={!!scoreResult || !!transcript || status === 'completed'}
                        sx={{
                          justifyContent: 'flex-start',
                          padding: '12px 16px',
                          borderRadius: '10px',
                          borderColor: '#e2e8f0',
                          color: '#475569',
                          fontWeight: 600,
                          textTransform: 'none',
                          width: '100%',
                          '&:hover': {
                            borderColor: '#3b82f6',
                            background: 'rgba(59, 130, 246, 0.05)',
                            color: '#3b82f6'
                          },
                          '&:disabled': {
                            borderColor: '#e2e8f0',
                            color: '#94a3b8',
                            background: '#f8fafc'
                          }
                        }}
                      >
                        {scoreResult || transcript ? 'Interview Completed' : 'Open Video Room'}
                      </Button>
                    </span>
                  </Tooltip>
                </Box>
              </Box>

              {/* Interview Info */}
              <Box sx={{
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                borderRadius: '16px',
                padding: '24px',
                border: '1px solid #fbbf24'
              }}>
                <Typography sx={{ fontSize: '14px', fontWeight: 700, color: '#92400e', mb: 2 }}>
                  ℹ️ Interview Tips
                </Typography>
                <Box component="ul" sx={{
                  margin: 0,
                  paddingLeft: '20px',
                  color: '#78350f',
                  fontSize: '13px',
                  lineHeight: 1.8
                }}>
                  <li>Review candidate resume before the interview</li>
                  <li>Prepare structured questions</li>
                  <li>Take notes during the interview</li>
                  <li>Check fraud analysis after completion</li>
                </Box>
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </Navigation>
  );
};

export default VideoInterviewDetail;
