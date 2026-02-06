import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Button, CircularProgress, Alert,
  Avatar, Chip, IconButton, LinearProgress, Card
} from '@mui/material';
import {
  ArrowBack, AccessTime, NavigateNext, Check, SmartToy,
  FiberManualRecord, Mic, MicOff, Videocam, VideocamOff, Timer
} from '@mui/icons-material';
import Navigation from '../layout/sidebar';
import videoInterviewService from '../../services/videoInterviewService';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';

// Declare Daily.co types
declare global {
  interface Window {
    DailyIframe: any;
  }
}

interface Question {
  id: number;
  question_text: string;
  question_type: string;
  difficulty: string;
  skill_focus?: string;
}

interface Answer {
  question_id: number;
  answer_text: string;
}

const QUESTION_TIME_LIMIT = 120; // 2 minutes per question

const AIInterviewRoom: React.FC = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [interview, setInterview] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [questionTime, setQuestionTime] = useState(QUESTION_TIME_LIMIT);
  const [scoreResult, setScoreResult] = useState<any>(null);

  // Daily.co states
  const [dailyLoaded, setDailyLoaded] = useState(false);
  const [callJoined, setCallJoined] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const dailyContainerRef = useRef<HTMLDivElement>(null);
  const dailyCallRef = useRef<any>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load Daily.co script
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@daily-co/daily-js';
    script.async = true;
    script.onload = () => {
      setDailyLoaded(true);
      console.log('✅ Daily.co SDK loaded for AI Interview');
    };
    script.onerror = () => {
      console.error('❌ Failed to load Daily.co SDK');
      toast.error('Failed to load video. Please refresh.');
    };
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (questionTimerRef.current) clearInterval(questionTimerRef.current);
      if (dailyCallRef.current) {
        dailyCallRef.current.leave();
        dailyCallRef.current.destroy();
        dailyCallRef.current = null;
      }
    };
  }, []);

  // Fetch interview and questions
  useEffect(() => {
    const fetchData = async () => {
      try {
        const interviewData = await videoInterviewService.getInterview(Number(videoId));
        setInterview(interviewData);

        const questionsData = await videoInterviewService.getAIInterviewQuestions(Number(videoId));
        setQuestions(questionsData.questions || []);

        if (interviewData.status === 'in_progress') {
          setIsActive(true);
        }
      } catch (err: any) {
        setError(err.response?.data?.detail || err.message || 'Failed to load interview.');
      } finally {
        setLoading(false);
      }
    };
    if (videoId) fetchData();
  }, [videoId]);

  // Total elapsed time timer
  useEffect(() => {
    if (isActive) {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          setElapsed((prev) => prev + 1);
        }, 1000);
      }
    }
    return () => {
      if (!isActive && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive]);

  // Question countdown timer
  useEffect(() => {
    if (isActive && callJoined && !completing) {
      // Clear any existing timer
      if (questionTimerRef.current) {
        clearInterval(questionTimerRef.current);
      }

      // Reset question time
      setQuestionTime(QUESTION_TIME_LIMIT);

      // Start countdown
      questionTimerRef.current = setInterval(() => {
        setQuestionTime((prev) => {
          if (prev <= 1) {
            // Time's up, auto move to next question
            handleNextQuestion();
            return QUESTION_TIME_LIMIT;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (questionTimerRef.current) {
        clearInterval(questionTimerRef.current);
        questionTimerRef.current = null;
      }
    };
  }, [isActive, callJoined, currentIndex, completing]);

  // Initialize Daily.co when interview becomes active
  useEffect(() => {
    if (isActive && dailyLoaded && dailyContainerRef.current && !dailyCallRef.current && interview?.zoom_meeting_url) {
      initializeDaily();
    }
  }, [isActive, dailyLoaded, interview]);

  const initializeDaily = async () => {
    if (!dailyContainerRef.current || !window.DailyIframe) {
      console.error('Daily container or SDK not available');
      return;
    }

    const meetingUrl = interview?.zoom_meeting_url;
    if (!meetingUrl) {
      console.error('No meeting URL available');
      toast.error('Meeting URL not available');
      return;
    }

    console.log('🎥 Initializing Daily.co for AI Interview:', meetingUrl);

    try {
      dailyCallRef.current = window.DailyIframe.createFrame(dailyContainerRef.current, {
        iframeStyle: {
          width: '100%',
          height: '100%',
          border: '0',
          borderRadius: '16px',
        },
        showLeaveButton: false,
        showFullscreenButton: true,
      });

      dailyCallRef.current.on('joined-meeting', () => {
        console.log('✅ Joined AI Interview meeting');
        setCallJoined(true);
        toast.success('Connected! AI Interview starting...');
      });

      dailyCallRef.current.on('error', (error: any) => {
        console.error('Daily.co error:', error);
        toast.error('Video call error. Please try again.');
      });

      const displayName = interview?.candidate_name || user?.name || 'Candidate';

      await dailyCallRef.current.join({
        url: meetingUrl,
        userName: displayName,
      });

      console.log('✅ Daily.co AI Interview initialized');
    } catch (err) {
      console.error('Failed to initialize Daily.co:', err);
      toast.error('Failed to start video. Please try again.');
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const formatQuestionTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleStart = async () => {
    try {
      // Request permissions
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach(track => track.stop());
        console.log('✅ Media permissions granted');
      } catch (err: any) {
        console.warn('⚠️ Media device warning:', err.name);
        if (err.name === 'NotFoundError') {
          toast('No camera/mic found. Video will open anyway.', { icon: '⚠️' });
        } else {
          toast('Camera access issue. Video will open anyway.', { icon: '⚠️' });
        }
      }

      await videoInterviewService.startInterview(Number(videoId));

      // Refresh interview data
      const data = await videoInterviewService.getInterview(Number(videoId));
      setInterview(data);

      setIsActive(true);
      setElapsed(0);
      toast.success('AI Interview started! Speak your answers clearly.');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to start interview');
    }
  };

  const handleNextQuestion = useCallback(() => {
    const currentQuestion = questions[currentIndex];

    // Save answer placeholder (verbal answer)
    const existingIndex = answers.findIndex(a => a.question_id === currentQuestion?.id);
    if (existingIndex < 0 && currentQuestion) {
      setAnswers(prev => [...prev, {
        question_id: currentQuestion.id,
        answer_text: '[Verbal response - recorded in video]'
      }]);
    }

    // Move to next question or submit
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setQuestionTime(QUESTION_TIME_LIMIT);
      toast.success('Moving to next question...');
    } else {
      // Last question - auto submit
      handleSubmitAll();
    }
  }, [currentIndex, questions, answers]);

  const handleSubmitAll = async () => {
    if (completing) return;

    // Stop question timer
    if (questionTimerRef.current) {
      clearInterval(questionTimerRef.current);
      questionTimerRef.current = null;
    }

    // Prepare all answers
    const finalAnswers: Answer[] = questions.map((q, idx) => {
      const existing = answers.find(a => a.question_id === q.id);
      return {
        question_id: q.id,
        answer_text: existing?.answer_text || '[Verbal response - recorded in video]'
      };
    });

    try {
      setCompleting(true);

      // Leave Daily call
      if (dailyCallRef.current) {
        await dailyCallRef.current.leave();
        dailyCallRef.current.destroy();
        dailyCallRef.current = null;
      }

      const result = await videoInterviewService.submitAIInterviewAnswers(Number(videoId), finalAnswers);
      setScoreResult(result.score_result);
      setIsActive(false);
      setCallJoined(false);

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      setInterview((prev: any) => ({ ...prev, status: 'completed' }));
      toast.success('Interview completed! Your responses have been recorded.');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to submit interview');
    } finally {
      setCompleting(false);
    }
  };

  const toggleMic = () => {
    if (dailyCallRef.current) {
      const newState = !micOn;
      dailyCallRef.current.setLocalAudio(newState);
      setMicOn(newState);
    }
  };

  const toggleCam = () => {
    if (dailyCallRef.current) {
      const newState = !camOn;
      dailyCallRef.current.setLocalVideo(newState);
      setCamOn(newState);
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
            <CircularProgress sx={{ color: '#8b5cf6', mb: 2 }} />
            <Typography sx={{ color: '#64748b' }}>Loading AI Interview...</Typography>
          </Box>
        </Box>
      </Navigation>
    );
  }

  if (error) {
    return (
      <Navigation>
        <Box sx={{ p: 3 }}>
          <Alert severity="error">{error}</Alert>
          <Button onClick={() => navigate('/video-interviews')} sx={{ mt: 2 }}>
            Back to Interviews
          </Button>
        </Box>
      </Navigation>
    );
  }

  const currentQuestion = questions[currentIndex];
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;
  const isCompleted = interview?.status === 'completed' || scoreResult;
  const questionTimeProgress = (questionTime / QUESTION_TIME_LIMIT) * 100;
  const isTimeWarning = questionTime <= 30;

  return (
    <Navigation>
      <Box sx={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #f0f4ff 0%, #e8f0fe 100%)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Top Bar */}
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SmartToy sx={{ color: '#8b5cf6', fontSize: 24 }} />
                <Typography sx={{ color: '#1e293b', fontWeight: 700, fontSize: '16px' }}>
                  AI Video Interview - {interview?.job_title || 'Interview'}
                </Typography>
              </Box>
              <Typography sx={{ color: '#64748b', fontSize: '12px' }}>
                {interview?.candidate_name || 'Candidate'} • Speak your answers clearly
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {isActive && callJoined && (
              <Chip
                icon={<FiberManualRecord sx={{ fontSize: 12, color: '#ef4444 !important', animation: 'pulse 1s infinite' }} />}
                label="RECORDING"
                sx={{
                  background: '#fef2f2',
                  color: '#ef4444',
                  fontWeight: 700,
                  fontSize: '11px',
                  border: '1px solid #fecaca',
                  '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.5 } }
                }}
              />
            )}
            <Box sx={{
              background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
              borderRadius: '8px',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)'
            }}>
              <AccessTime sx={{ color: 'white', fontSize: 18 }} />
              <Typography sx={{ color: 'white', fontFamily: 'monospace', fontWeight: 700, fontSize: '16px' }}>
                {formatTime(elapsed)}
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Main Content */}
        <Box sx={{ flex: 1, display: 'flex', padding: '16px', gap: 2 }}>
          {/* Left Side - Video */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {!isActive && !isCompleted ? (
              // Start Screen
              <Paper sx={{
                flex: 1,
                background: '#1e293b',
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                p: 4
              }}>
                <Box sx={{
                  width: 100, height: 100,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 3,
                  boxShadow: '0 10px 40px rgba(139, 92, 246, 0.4)'
                }}>
                  <SmartToy sx={{ color: 'white', fontSize: 50 }} />
                </Box>
                <Typography sx={{ color: 'white', fontSize: '22px', fontWeight: 700, mb: 1 }}>
                  AI Video Interview Ready
                </Typography>
                <Typography sx={{ color: '#94a3b8', fontSize: '14px', mb: 1, textAlign: 'center', maxWidth: 450 }}>
                  You will see {questions.length} questions one by one.
                  <strong style={{ color: '#a78bfa' }}> Speak your answers verbally.</strong>
                </Typography>
                <Typography sx={{ color: '#64748b', fontSize: '13px', mb: 3 }}>
                  Each question has a 2-minute timer. Click "Done" when finished speaking.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<Videocam />}
                  onClick={handleStart}
                  disabled={!dailyLoaded}
                  sx={{
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                    padding: '14px 40px',
                    borderRadius: '25px',
                    fontWeight: 600,
                    fontSize: '15px',
                    textTransform: 'none',
                    boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)'
                    },
                    '&:disabled': { background: '#64748b' }
                  }}
                >
                  {dailyLoaded ? 'Start AI Video Interview' : 'Loading...'}
                </Button>
              </Paper>
            ) : isCompleted ? (
              // Score Result Screen
              <Paper sx={{
                flex: 1,
                background: '#1e293b',
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                p: 4
              }}>
                {scoreResult ? (
                  <Box sx={{ textAlign: 'center', maxWidth: 450 }}>
                    <Box sx={{
                      width: 90, height: 90,
                      borderRadius: '50%',
                      background: scoreResult.overall_score >= 7 ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' :
                                 scoreResult.overall_score >= 5 ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' :
                                 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 20px',
                      boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
                    }}>
                      <Typography sx={{ color: 'white', fontSize: '26px', fontWeight: 700 }}>
                        {Math.round(scoreResult.overall_score * 10)}%
                      </Typography>
                    </Box>
                    <Typography sx={{ color: 'white', fontSize: '22px', fontWeight: 700, mb: 2 }}>
                      Interview Completed!
                    </Typography>
                    <Chip
                      label={scoreResult.recommendation?.toUpperCase() || 'SCORED'}
                      sx={{
                        mb: 3,
                        fontWeight: 700,
                        fontSize: '13px',
                        padding: '6px 14px',
                        background: scoreResult.recommendation === 'select' ? '#10b981' :
                                   scoreResult.recommendation === 'next_round' ? '#f59e0b' : '#ef4444',
                        color: 'white'
                      }}
                    />
                    {scoreResult.strengths && (
                      <Box sx={{ textAlign: 'left', mb: 2, p: 2, background: 'rgba(16, 185, 129, 0.1)', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                        <Typography sx={{ color: '#10b981', fontSize: '13px', fontWeight: 600, mb: 0.5 }}>
                          Strengths:
                        </Typography>
                        <Typography sx={{ color: '#94a3b8', fontSize: '13px' }}>
                          {scoreResult.strengths}
                        </Typography>
                      </Box>
                    )}
                    <Button
                      variant="contained"
                      onClick={() => navigate(`/video-detail/${videoId}`)}
                      sx={{
                        background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                        padding: '12px 28px',
                        borderRadius: '10px',
                        fontWeight: 600,
                        textTransform: 'none'
                      }}
                    >
                      View Full Details
                    </Button>
                  </Box>
                ) : (
                  <CircularProgress sx={{ color: '#8b5cf6' }} />
                )}
              </Paper>
            ) : (
              // Video Call Area
              <Paper sx={{
                flex: 1,
                background: '#1e293b',
                borderRadius: '16px',
                position: 'relative',
                overflow: 'hidden',
                minHeight: '400px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 10px 40px rgba(0,0,0,0.15)'
              }}>
                <Box
                  ref={dailyContainerRef}
                  sx={{
                    width: '100%',
                    height: '100%',
                    minHeight: '400px',
                  }}
                />
                {!callJoined && (
                  <Box sx={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(0,0,0,0.7)'
                  }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <CircularProgress sx={{ color: '#8b5cf6', mb: 2 }} />
                      <Typography sx={{ color: 'white' }}>Connecting to video...</Typography>
                    </Box>
                  </Box>
                )}
              </Paper>
            )}

            {/* Video Controls */}
            {isActive && !isCompleted && (
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                background: 'white',
                borderRadius: '12px',
                padding: '12px 20px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
              }}>
                <IconButton
                  onClick={toggleMic}
                  disabled={!callJoined}
                  sx={{
                    width: 48, height: 48,
                    background: micOn ? '#f1f5f9' : '#fef2f2',
                    border: micOn ? '1px solid #e2e8f0' : '1px solid #fecaca',
                    '&:hover': { background: micOn ? '#e2e8f0' : '#fee2e2' },
                    '&:disabled': { opacity: 0.5 }
                  }}
                >
                  {micOn ? <Mic sx={{ color: '#1e293b' }} /> : <MicOff sx={{ color: '#ef4444' }} />}
                </IconButton>

                <IconButton
                  onClick={toggleCam}
                  disabled={!callJoined}
                  sx={{
                    width: 48, height: 48,
                    background: camOn ? '#f1f5f9' : '#fef2f2',
                    border: camOn ? '1px solid #e2e8f0' : '1px solid #fecaca',
                    '&:hover': { background: camOn ? '#e2e8f0' : '#fee2e2' },
                    '&:disabled': { opacity: 0.5 }
                  }}
                >
                  {camOn ? <Videocam sx={{ color: '#1e293b' }} /> : <VideocamOff sx={{ color: '#ef4444' }} />}
                </IconButton>
              </Box>
            )}
          </Box>

          {/* Right Side - Question Panel */}
          <Box sx={{ width: 380, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {isActive && callJoined && !isCompleted && (
              <>
                {/* Question Timer */}
                <Paper sx={{
                  background: isTimeWarning ? 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)' : 'white',
                  borderRadius: '12px',
                  padding: '16px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                  border: isTimeWarning ? '1px solid #fecaca' : '1px solid #e2e8f0'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Timer sx={{ color: isTimeWarning ? '#ef4444' : '#8b5cf6', fontSize: 20 }} />
                      <Typography sx={{ color: isTimeWarning ? '#ef4444' : '#64748b', fontSize: '13px', fontWeight: 600 }}>
                        Time Remaining
                      </Typography>
                    </Box>
                    <Typography sx={{
                      color: isTimeWarning ? '#ef4444' : '#8b5cf6',
                      fontSize: '20px',
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      animation: isTimeWarning ? 'blink 0.5s infinite' : 'none',
                      '@keyframes blink': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.5 } }
                    }}>
                      {formatQuestionTime(questionTime)}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={questionTimeProgress}
                    sx={{
                      height: 6,
                      borderRadius: 3,
                      background: '#e2e8f0',
                      '& .MuiLinearProgress-bar': {
                        background: isTimeWarning ?
                          'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)' :
                          'linear-gradient(90deg, #8b5cf6 0%, #6d28d9 100%)',
                        borderRadius: 3
                      }
                    }}
                  />
                </Paper>

                {/* Progress */}
                <Paper sx={{
                  background: 'white',
                  borderRadius: '12px',
                  padding: '16px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
                }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography sx={{ color: '#64748b', fontSize: '13px', fontWeight: 600 }}>
                      Question {currentIndex + 1} of {questions.length}
                    </Typography>
                    <Typography sx={{ color: '#8b5cf6', fontSize: '13px', fontWeight: 600 }}>
                      {Math.round(progress)}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={progress}
                    sx={{
                      height: 6,
                      borderRadius: 3,
                      background: '#e2e8f0',
                      '& .MuiLinearProgress-bar': {
                        background: 'linear-gradient(90deg, #8b5cf6 0%, #6d28d9 100%)',
                        borderRadius: 3
                      }
                    }}
                  />
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 1.5, flexWrap: 'wrap' }}>
                    {questions.map((_, idx) => (
                      <Box
                        key={idx}
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: idx === currentIndex ? '#8b5cf6' :
                                     idx < currentIndex ? '#10b981' : '#e2e8f0',
                          transition: 'all 0.2s'
                        }}
                      />
                    ))}
                  </Box>
                </Paper>

                {/* Current Question */}
                <Card sx={{
                  background: 'white',
                  borderRadius: '16px',
                  boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
                  overflow: 'visible',
                  flex: 1
                }}>
                  <Box sx={{
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2
                  }}>
                    <Avatar sx={{
                      width: 44, height: 44,
                      background: 'white',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.2)'
                    }}>
                      <SmartToy sx={{ color: '#8b5cf6', fontSize: 24 }} />
                    </Avatar>
                    <Box>
                      <Typography sx={{ color: 'white', fontWeight: 700, fontSize: '15px' }}>
                        AI Interviewer
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                        {currentQuestion?.question_type && (
                          <Chip
                            label={currentQuestion.question_type}
                            size="small"
                            sx={{
                              background: 'rgba(255,255,255,0.2)',
                              color: 'white',
                              fontSize: '10px',
                              height: 20
                            }}
                          />
                        )}
                        {currentQuestion?.difficulty && (
                          <Chip
                            label={currentQuestion.difficulty}
                            size="small"
                            sx={{
                              background: currentQuestion.difficulty === 'advanced' ? 'rgba(239,68,68,0.3)' :
                                         currentQuestion.difficulty === 'intermediate' ? 'rgba(245,158,11,0.3)' :
                                         'rgba(16,185,129,0.3)',
                              color: 'white',
                              fontSize: '10px',
                              height: 20
                            }}
                          />
                        )}
                      </Box>
                    </Box>
                  </Box>

                  <Box sx={{ p: 2.5 }}>
                    <Typography sx={{
                      color: '#1e293b',
                      fontSize: '16px',
                      fontWeight: 500,
                      lineHeight: 1.6
                    }}>
                      {currentQuestion?.question_text || 'Loading question...'}
                    </Typography>

                    <Box sx={{
                      mt: 3,
                      p: 2,
                      background: '#f8fafc',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0'
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Mic sx={{ color: '#8b5cf6', fontSize: 18 }} />
                        <Typography sx={{ color: '#64748b', fontSize: '13px', fontWeight: 600 }}>
                          Speak Your Answer
                        </Typography>
                      </Box>
                      <Typography sx={{ color: '#94a3b8', fontSize: '12px' }}>
                        Your response is being recorded. Speak clearly and take your time.
                      </Typography>
                    </Box>
                  </Box>
                </Card>

                {/* Done Button */}
                <Button
                  variant="contained"
                  endIcon={currentIndex === questions.length - 1 ?
                    (completing ? <CircularProgress size={18} sx={{ color: 'white' }} /> : <Check />) :
                    <NavigateNext />
                  }
                  onClick={handleNextQuestion}
                  disabled={completing}
                  sx={{
                    background: currentIndex === questions.length - 1 ?
                      'linear-gradient(135deg, #10b981 0%, #059669 100%)' :
                      'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                    padding: '14px 24px',
                    borderRadius: '12px',
                    fontWeight: 600,
                    fontSize: '15px',
                    textTransform: 'none',
                    boxShadow: currentIndex === questions.length - 1 ?
                      '0 4px 14px rgba(16, 185, 129, 0.4)' :
                      '0 4px 14px rgba(139, 92, 246, 0.4)',
                    '&:hover': {
                      background: currentIndex === questions.length - 1 ?
                        'linear-gradient(135deg, #059669 0%, #047857 100%)' :
                        'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)'
                    }
                  }}
                >
                  {currentIndex === questions.length - 1 ?
                    (completing ? 'Submitting...' : 'Done - Submit Interview') :
                    'Done - Next Question'
                  }
                </Button>
              </>
            )}

            {/* Interview Info - Always visible */}
            <Paper sx={{
              background: 'white',
              borderRadius: '12px',
              padding: '16px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
            }}>
              <Typography sx={{ color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', mb: 1.5 }}>
                Interview Details
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, p: 1.5, background: '#f8fafc', borderRadius: '10px' }}>
                <Avatar sx={{ width: 40, height: 40, background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)' }}>
                  {interview?.candidate_name?.charAt(0).toUpperCase() || 'C'}
                </Avatar>
                <Box>
                  <Typography sx={{ color: '#1e293b', fontWeight: 600, fontSize: '13px' }}>
                    {interview?.candidate_name || 'Candidate'}
                  </Typography>
                  <Typography sx={{ color: '#64748b', fontSize: '11px' }}>{interview?.job_title || 'Position'}</Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ color: '#64748b', fontSize: '12px' }}>Questions</Typography>
                  <Typography sx={{ color: '#1e293b', fontSize: '12px', fontWeight: 600 }}>{questions.length}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ color: '#64748b', fontSize: '12px' }}>Mode</Typography>
                  <Chip label="AI Video" size="small" sx={{ background: '#f3e8ff', color: '#8b5cf6', fontWeight: 600, fontSize: '10px', height: 20 }} />
                </Box>
              </Box>
            </Paper>

            {/* Tips */}
            {(!isActive || !callJoined) && !isCompleted && (
              <Paper sx={{
                background: 'linear-gradient(135deg, #f3e8ff 0%, #e8d5ff 100%)',
                borderRadius: '12px',
                padding: '16px',
                border: '1px solid #d8b4fe'
              }}>
                <Typography sx={{ color: '#6d28d9', fontSize: '13px', fontWeight: 700, mb: 1.5 }}>
                  Interview Tips
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography sx={{ color: '#7c3aed', fontSize: '12px' }}>
                    • Speak clearly into your microphone
                  </Typography>
                  <Typography sx={{ color: '#7c3aed', fontSize: '12px' }}>
                    • Use specific examples from experience
                  </Typography>
                  <Typography sx={{ color: '#7c3aed', fontSize: '12px' }}>
                    • Click "Done" when finished speaking
                  </Typography>
                  <Typography sx={{ color: '#7c3aed', fontSize: '12px' }}>
                    • Timer auto-advances after 2 minutes
                  </Typography>
                </Box>
              </Paper>
            )}
          </Box>
        </Box>
      </Box>
    </Navigation>
  );
};

export default AIInterviewRoom;
