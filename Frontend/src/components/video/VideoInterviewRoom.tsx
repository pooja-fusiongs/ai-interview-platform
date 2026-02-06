import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Button, Divider, CircularProgress, Alert,
  Avatar, Chip, IconButton, Tooltip, TextField
} from '@mui/material';
import {
  Videocam, ArrowBack, AccessTime,
  Description, Security, Mic, MicOff, VideocamOff, CallEnd,
  ScreenShare, Chat, MoreVert, FiberManualRecord, VolumeUp
} from '@mui/icons-material';
import Navigation from '../layout/sidebar';
import videoInterviewService from '../../services/videoInterviewService';
import { toast } from 'react-hot-toast';

const VideoInterviewRoom: React.FC = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const [interview, setInterview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [ending, setEnding] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcriptText, setTranscriptText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [scoreResult, setScoreResult] = useState<any>(null);
  const intervalRef = useRef<NodeJS.Timer | null>(null);
  const audioRef = useRef<NodeJS.Timer | null>(null);

  useEffect(() => {
    const fetchInterview = async () => {
      try {
        const data = await videoInterviewService.getInterview(Number(videoId));
        setInterview(data);
        if (data.status === 'in_progress') {
          setIsActive(true);
          if (data.started_at) {
            const startTime = new Date(data.started_at).getTime();
            const now = Date.now();
            setElapsed(Math.floor((now - startTime) / 1000));
          }
        }
      } catch (err: any) {
        setError(err.response?.data?.detail || err.message || 'Failed to load interview.');
      } finally {
        setLoading(false);
      }
    };
    if (videoId) fetchInterview();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (audioRef.current) clearInterval(audioRef.current);
    };
  }, [videoId]);

  useEffect(() => {
    if (isActive) {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          setElapsed((prev) => prev + 1);
        }, 1000);
      }
      if (!audioRef.current) {
        audioRef.current = setInterval(() => {
          setAudioLevel(Math.random() * 100);
        }, 200);
      }
    }
    return () => {
      if (!isActive) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (audioRef.current) {
          clearInterval(audioRef.current);
          audioRef.current = null;
        }
      }
    };
  }, [isActive]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const handleStart = async () => {
    try {
      await videoInterviewService.startInterview(Number(videoId));
      setIsActive(true);
      setElapsed(0);
      setInterview((prev: any) => ({ ...prev, status: 'in_progress' }));
      toast.success('Interview started!');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to start interview');
    }
  };

  const handleEnd = async () => {
    try {
      setEnding(true);
      const result = await videoInterviewService.endInterview(Number(videoId));
      setIsActive(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (audioRef.current) {
        clearInterval(audioRef.current);
        audioRef.current = null;
      }
      setInterview(result);
      toast.success('Interview completed! You can now upload the transcript.');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to end interview');
    } finally {
      setEnding(false);
    }
  };

  const handleUploadTranscript = async () => {
    if (!transcriptText.trim()) {
      toast.error('Please paste the transcript text');
      return;
    }
    try {
      setUploading(true);
      const result = await videoInterviewService.uploadTranscriptAndScore(Number(videoId), transcriptText);
      setScoreResult(result.score_result);
      toast.success(result.message);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to upload transcript');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <Navigation>
        <Box sx={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          minHeight: '100vh', background: 'linear-gradient(180deg, #f8f9fb 0%, #eef2f6 100%)'
        }}>
          <Box sx={{ textAlign: 'center' }}>
            <CircularProgress sx={{ color: '#f59e0b', mb: 2 }} />
            <Typography sx={{ color: '#64748b' }}>Loading interview room...</Typography>
          </Box>
        </Box>
      </Navigation>
    );
  }

  const isCompleted = interview?.status === 'completed';

  return (
    <Navigation>
      <Box sx={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #f8f9fb 0%, #eef2f6 100%)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Top Bar */}
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          background: 'white',
          borderBottom: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconButton
              onClick={() => navigate('/video-interviews')}
              sx={{
                color: '#64748b',
                background: '#f1f5f9',
                '&:hover': { background: '#e2e8f0' }
              }}
            >
              <ArrowBack />
            </IconButton>
            <Box>
              <Typography sx={{ color: '#1e293b', fontWeight: 700, fontSize: '18px' }}>
                {interview?.job_title || 'Video Interview'}
              </Typography>
              <Typography sx={{ color: '#64748b', fontSize: '13px' }}>
                {interview?.candidate_name || 'Candidate'} • Interview #{videoId}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {isActive && (
              <Chip
                icon={<FiberManualRecord sx={{ fontSize: 12, color: '#ef4444 !important', animation: 'blink 1s infinite' }} />}
                label="LIVE"
                sx={{
                  background: '#fef2f2',
                  color: '#ef4444',
                  fontWeight: 700,
                  fontSize: '12px',
                  border: '1px solid #fecaca',
                  '@keyframes blink': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.3 } }
                }}
              />
            )}
            <Box sx={{
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              borderRadius: '10px',
              padding: '10px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)'
            }}>
              <AccessTime sx={{ color: 'white', fontSize: 20 }} />
              <Typography sx={{ color: 'white', fontFamily: 'monospace', fontWeight: 700, fontSize: '20px' }}>
                {formatTime(elapsed)}
              </Typography>
            </Box>
          </Box>
        </Box>

        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}

        {/* Main Content */}
        <Box sx={{ flex: 1, display: 'flex', padding: '20px', gap: 3 }}>
          {/* Video Area */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Main Video */}
            <Paper sx={{
              flex: 1,
              background: '#1e293b',
              borderRadius: '20px',
              position: 'relative',
              overflow: 'hidden',
              minHeight: '450px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 10px 40px rgba(0,0,0,0.15)'
            }}>
              {isActive ? (
                <Box sx={{ textAlign: 'center' }}>
                  <Avatar sx={{
                    width: 140,
                    height: 140,
                    fontSize: '56px',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                    mb: 2,
                    boxShadow: '0 0 60px rgba(59, 130, 246, 0.4)'
                  }}>
                    {interview?.candidate_name?.charAt(0).toUpperCase() || 'C'}
                  </Avatar>
                  <Typography sx={{ color: 'white', fontSize: '24px', fontWeight: 600 }}>
                    {interview?.candidate_name || 'Candidate'}
                  </Typography>
                  <Typography sx={{ color: '#94a3b8', fontSize: '14px', mt: 1 }}>
                    Interview in progress
                  </Typography>

                  {/* Audio Level Indicator */}
                  <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                    <VolumeUp sx={{ color: '#10b981', fontSize: 20 }} />
                    <Box sx={{ width: 120, height: 6, background: '#334155', borderRadius: 3, overflow: 'hidden' }}>
                      <Box sx={{
                        width: `${audioLevel}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #10b981, #f59e0b)',
                        transition: 'width 0.1s ease',
                        borderRadius: 3
                      }} />
                    </Box>
                  </Box>
                </Box>
              ) : isCompleted ? (
                <Box sx={{ textAlign: 'center', width: '100%', maxWidth: 500, mx: 'auto', p: 3 }}>
                  {scoreResult ? (
                    // Show score results
                    <Box>
                      <Box sx={{
                        width: 80,
                        height: 80,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px',
                        boxShadow: '0 0 40px rgba(16, 185, 129, 0.4)'
                      }}>
                        <Typography sx={{ color: 'white', fontSize: '24px', fontWeight: 700 }}>
                          {Math.round(scoreResult.overall_score)}%
                        </Typography>
                      </Box>
                      <Typography sx={{ color: 'white', fontSize: '20px', fontWeight: 700, mb: 1 }}>
                        Score Generated!
                      </Typography>
                      <Chip
                        label={scoreResult.recommendation?.toUpperCase() || 'N/A'}
                        sx={{
                          mb: 2,
                          fontWeight: 700,
                          background: scoreResult.recommendation === 'select' ? '#10b981' :
                                     scoreResult.recommendation === 'next_round' ? '#f59e0b' : '#ef4444',
                          color: 'white'
                        }}
                      />
                      {scoreResult.strengths && (
                        <Box sx={{ textAlign: 'left', mb: 2 }}>
                          <Typography sx={{ color: '#10b981', fontSize: '14px', fontWeight: 600, mb: 0.5 }}>
                            Strengths:
                          </Typography>
                          <Typography sx={{ color: '#94a3b8', fontSize: '13px' }}>
                            {scoreResult.strengths}
                          </Typography>
                        </Box>
                      )}
                      {scoreResult.weaknesses && (
                        <Box sx={{ textAlign: 'left', mb: 2 }}>
                          <Typography sx={{ color: '#f59e0b', fontSize: '14px', fontWeight: 600, mb: 0.5 }}>
                            Areas to Improve:
                          </Typography>
                          <Typography sx={{ color: '#94a3b8', fontSize: '13px' }}>
                            {scoreResult.weaknesses}
                          </Typography>
                        </Box>
                      )}
                      <Button
                        variant="contained"
                        startIcon={<Description />}
                        onClick={() => navigate(`/video-detail/${videoId}`)}
                        sx={{
                          mt: 2,
                          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                          fontWeight: 600,
                          textTransform: 'none',
                          borderRadius: '10px',
                          padding: '12px 24px'
                        }}
                      >
                        View Full Details
                      </Button>
                    </Box>
                  ) : (
                    // Show transcript upload form
                    <Box>
                      <Typography sx={{ color: 'white', fontSize: '20px', fontWeight: 700, mb: 1 }}>
                        Interview Completed
                      </Typography>
                      <Typography sx={{ color: '#94a3b8', fontSize: '14px', mb: 3 }}>
                        Paste the interview transcript below to generate score
                      </Typography>
                      <TextField
                        multiline
                        rows={8}
                        fullWidth
                        placeholder="Paste the interview transcript here..."
                        value={transcriptText}
                        onChange={(e) => setTranscriptText(e.target.value)}
                        sx={{
                          mb: 2,
                          '& .MuiOutlinedInput-root': {
                            background: '#1e293b',
                            color: 'white',
                            borderRadius: '12px',
                            '& fieldset': { borderColor: '#334155' },
                            '&:hover fieldset': { borderColor: '#475569' },
                            '&.Mui-focused fieldset': { borderColor: '#f59e0b' },
                          },
                          '& .MuiInputBase-input::placeholder': {
                            color: '#64748b',
                            opacity: 1,
                          },
                        }}
                      />
                      <Button
                        variant="contained"
                        fullWidth
                        onClick={handleUploadTranscript}
                        disabled={uploading || !transcriptText.trim()}
                        startIcon={uploading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : <Description />}
                        sx={{
                          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                          fontWeight: 600,
                          textTransform: 'none',
                          borderRadius: '10px',
                          padding: '14px 24px',
                          fontSize: '15px',
                          '&:disabled': {
                            background: '#334155',
                            color: '#64748b'
                          }
                        }}
                      >
                        {uploading ? 'Generating Score...' : 'Upload & Generate Score'}
                      </Button>
                      <Button
                        variant="text"
                        onClick={() => navigate(`/video-detail/${videoId}`)}
                        sx={{
                          mt: 2,
                          color: '#64748b',
                          textTransform: 'none',
                          '&:hover': { color: '#94a3b8' }
                        }}
                      >
                        Skip for now
                      </Button>
                    </Box>
                  )}
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center' }}>
                  <Box sx={{
                    width: 100,
                    height: 100,
                    borderRadius: '50%',
                    background: '#334155',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 24px'
                  }}>
                    <Videocam sx={{ color: '#64748b', fontSize: 48 }} />
                  </Box>
                  <Typography sx={{ color: '#94a3b8', fontSize: '18px' }}>
                    Ready to start interview
                  </Typography>
                  <Typography sx={{ color: '#64748b', fontSize: '14px', mt: 1 }}>
                    Click "Start Interview" to begin
                  </Typography>
                </Box>
              )}

              {/* Self View (Picture-in-Picture) */}
              {isActive && (
                <Box sx={{
                  position: 'absolute',
                  bottom: 20,
                  right: 20,
                  width: 180,
                  height: 120,
                  background: '#334155',
                  borderRadius: '12px',
                  border: '3px solid #475569',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
                }}>
                  <Avatar sx={{
                    width: 50,
                    height: 50,
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  }}>
                    {interview?.interviewer_name?.charAt(0).toUpperCase() || 'I'}
                  </Avatar>
                  <Typography sx={{
                    position: 'absolute',
                    bottom: 8,
                    left: 8,
                    color: 'white',
                    fontSize: '11px',
                    background: 'rgba(0,0,0,0.6)',
                    padding: '2px 8px',
                    borderRadius: '4px'
                  }}>
                    You
                  </Typography>
                </Box>
              )}
            </Paper>

            {/* Control Bar */}
            <Paper sx={{
              background: 'white',
              borderRadius: '16px',
              padding: '16px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
            }}>
              {!isCompleted && (
                <>
                  <Tooltip title={micOn ? 'Mute' : 'Unmute'}>
                    <IconButton
                      onClick={() => setMicOn(!micOn)}
                      sx={{
                        width: 56,
                        height: 56,
                        background: micOn ? '#f1f5f9' : '#fef2f2',
                        border: micOn ? '1px solid #e2e8f0' : '1px solid #fecaca',
                        '&:hover': { background: micOn ? '#e2e8f0' : '#fee2e2' }
                      }}
                    >
                      {micOn ? <Mic sx={{ color: '#1e293b' }} /> : <MicOff sx={{ color: '#ef4444' }} />}
                    </IconButton>
                  </Tooltip>

                  <Tooltip title={camOn ? 'Turn off camera' : 'Turn on camera'}>
                    <IconButton
                      onClick={() => setCamOn(!camOn)}
                      sx={{
                        width: 56,
                        height: 56,
                        background: camOn ? '#f1f5f9' : '#fef2f2',
                        border: camOn ? '1px solid #e2e8f0' : '1px solid #fecaca',
                        '&:hover': { background: camOn ? '#e2e8f0' : '#fee2e2' }
                      }}
                    >
                      {camOn ? <Videocam sx={{ color: '#1e293b' }} /> : <VideocamOff sx={{ color: '#ef4444' }} />}
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="Share screen">
                    <IconButton sx={{
                      width: 56,
                      height: 56,
                      background: '#f1f5f9',
                      border: '1px solid #e2e8f0',
                      '&:hover': { background: '#e2e8f0' }
                    }}>
                      <ScreenShare sx={{ color: '#1e293b' }} />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="Chat">
                    <IconButton sx={{
                      width: 56,
                      height: 56,
                      background: '#f1f5f9',
                      border: '1px solid #e2e8f0',
                      '&:hover': { background: '#e2e8f0' }
                    }}>
                      <Chat sx={{ color: '#1e293b' }} />
                    </IconButton>
                  </Tooltip>

                  <Divider orientation="vertical" sx={{ height: 40, mx: 1 }} />

                  {!isActive ? (
                    <Button
                      variant="contained"
                      startIcon={<Videocam />}
                      onClick={handleStart}
                      sx={{
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        padding: '14px 36px',
                        borderRadius: '28px',
                        fontWeight: 600,
                        fontSize: '15px',
                        textTransform: 'none',
                        boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                        '&:hover': {
                          background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                          boxShadow: '0 6px 20px rgba(16, 185, 129, 0.5)'
                        }
                      }}
                    >
                      Start Interview
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      startIcon={ending ? <CircularProgress size={20} sx={{ color: 'white' }} /> : <CallEnd />}
                      onClick={handleEnd}
                      disabled={ending}
                      sx={{
                        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                        padding: '14px 36px',
                        borderRadius: '28px',
                        fontWeight: 600,
                        fontSize: '15px',
                        textTransform: 'none',
                        boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)',
                        '&:hover': {
                          background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                          boxShadow: '0 6px 20px rgba(239, 68, 68, 0.5)'
                        }
                      }}
                    >
                      {ending ? 'Ending...' : 'End Interview'}
                    </Button>
                  )}

                  <Tooltip title="More options">
                    <IconButton sx={{
                      width: 56,
                      height: 56,
                      background: '#f1f5f9',
                      border: '1px solid #e2e8f0',
                      '&:hover': { background: '#e2e8f0' }
                    }}>
                      <MoreVert sx={{ color: '#1e293b' }} />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Paper>
          </Box>

          {/* Sidebar */}
          <Box sx={{ width: 340, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Participants */}
            <Paper sx={{
              background: 'white',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
            }}>
              <Typography sx={{ color: '#64748b', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', mb: 2 }}>
                Participants
              </Typography>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, p: 2, background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <Avatar sx={{ width: 44, height: 44, background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)' }}>
                  {interview?.candidate_name?.charAt(0).toUpperCase() || 'C'}
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ color: '#1e293b', fontWeight: 600, fontSize: '14px' }}>
                    {interview?.candidate_name || 'Candidate'}
                  </Typography>
                  <Typography sx={{ color: '#64748b', fontSize: '12px' }}>Candidate</Typography>
                </Box>
                {isActive && <Box sx={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />}
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <Avatar sx={{ width: 44, height: 44, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
                  {interview?.interviewer_name?.charAt(0).toUpperCase() || 'I'}
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ color: '#1e293b', fontWeight: 600, fontSize: '14px' }}>
                    {interview?.interviewer_name || 'Interviewer'}
                  </Typography>
                  <Typography sx={{ color: '#64748b', fontSize: '12px' }}>Interviewer (You)</Typography>
                </Box>
                {isActive && <Box sx={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />}
              </Box>
            </Paper>

            {/* Interview Info */}
            <Paper sx={{
              background: 'white',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
            }}>
              <Typography sx={{ color: '#64748b', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', mb: 2 }}>
                Interview Details
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ color: '#64748b', fontSize: '14px' }}>Position</Typography>
                  <Typography sx={{ color: '#1e293b', fontSize: '14px', fontWeight: 600 }}>{interview?.job_title || 'N/A'}</Typography>
                </Box>
                <Divider />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ color: '#64748b', fontSize: '14px' }}>Duration</Typography>
                  <Typography sx={{ color: '#1e293b', fontSize: '14px', fontWeight: 600 }}>{interview?.duration_minutes || 30} min</Typography>
                </Box>
                <Divider />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ color: '#64748b', fontSize: '14px' }}>Status</Typography>
                  <Chip
                    label={interview?.status?.replace('_', ' ').toUpperCase()}
                    size="small"
                    sx={{
                      fontWeight: 700,
                      fontSize: '11px',
                      background: interview?.status === 'completed' ? '#ecfdf5' : interview?.status === 'in_progress' ? '#fffbeb' : '#eff6ff',
                      color: interview?.status === 'completed' ? '#10b981' : interview?.status === 'in_progress' ? '#f59e0b' : '#3b82f6',
                      border: `1px solid ${interview?.status === 'completed' ? '#a7f3d0' : interview?.status === 'in_progress' ? '#fde68a' : '#bfdbfe'}`
                    }}
                  />
                </Box>
              </Box>
            </Paper>

            {/* Quick Actions */}
            <Paper sx={{
              background: 'white',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
            }}>
              <Typography sx={{ color: '#64748b', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', mb: 2 }}>
                Quick Actions
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Button
                  fullWidth
                  startIcon={<Description />}
                  onClick={() => navigate(`/video-detail/${videoId}`)}
                  sx={{
                    justifyContent: 'flex-start',
                    color: '#475569',
                    textTransform: 'none',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    border: '1px solid #e2e8f0',
                    '&:hover': { background: '#f8fafc', borderColor: '#f59e0b', color: '#f59e0b' }
                  }}
                >
                  View Details & Transcript
                </Button>
                <Button
                  fullWidth
                  startIcon={<Security />}
                  onClick={() => navigate(`/fraud-analysis/${videoId}`)}
                  sx={{
                    justifyContent: 'flex-start',
                    color: '#475569',
                    textTransform: 'none',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    border: '1px solid #e2e8f0',
                    '&:hover': { background: '#f8fafc', borderColor: '#f59e0b', color: '#f59e0b' }
                  }}
                >
                  Fraud Analysis
                </Button>
              </Box>
            </Paper>

            {/* Transcript Status */}
            {isCompleted && (
              <Paper sx={{
                background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                borderRadius: '16px',
                padding: '20px',
                border: '1px solid #a7f3d0'
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box sx={{
                    width: 48,
                    height: 48,
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Description sx={{ color: 'white', fontSize: 24 }} />
                  </Box>
                  <Box>
                    <Typography sx={{ color: '#065f46', fontWeight: 700, fontSize: '15px' }}>
                      Transcript Ready
                    </Typography>
                    <Typography sx={{ color: '#047857', fontSize: '13px' }}>
                      Click to view full transcript
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            )}
          </Box>
        </Box>
      </Box>
    </Navigation>
  );
};

export default VideoInterviewRoom;
