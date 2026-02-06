import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Button, CircularProgress, Alert,
  Avatar, Chip, IconButton, LinearProgress, TextField, Card
} from '@mui/material';
import {
  ArrowBack, AccessTime, NavigateNext, NavigateBefore,
  Check, SmartToy, Person, Send, FiberManualRecord
} from '@mui/icons-material';
import Navigation from '../layout/sidebar';
import videoInterviewService from '../../services/videoInterviewService';
import { toast } from 'react-hot-toast';

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

const AIInterviewRoom: React.FC = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const [interview, setInterview] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [scoreResult, setScoreResult] = useState<any>(null);

  // Timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isActive) {
      interval = setInterval(() => {
        setElapsed(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive]);

  // Fetch interview and questions
  useEffect(() => {
    const fetchData = async () => {
      try {
        const interviewData = await videoInterviewService.getInterview(Number(videoId));
        setInterview(interviewData);

        // Fetch questions for AI interview
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
      toast.success('AI Interview started! Answer each question carefully.');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to start interview');
    }
  };

  const handleSaveAnswer = () => {
    if (!currentAnswer.trim()) {
      toast.error('Please provide an answer before continuing');
      return;
    }

    const currentQuestion = questions[currentIndex];
    const existingIndex = answers.findIndex(a => a.question_id === currentQuestion.id);

    if (existingIndex >= 0) {
      const newAnswers = [...answers];
      newAnswers[existingIndex].answer_text = currentAnswer;
      setAnswers(newAnswers);
    } else {
      setAnswers([...answers, { question_id: currentQuestion.id, answer_text: currentAnswer }]);
    }
  };

  const handleNext = () => {
    handleSaveAnswer();
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      // Load existing answer for next question if any
      const nextQuestion = questions[currentIndex + 1];
      const existingAnswer = answers.find(a => a.question_id === nextQuestion.id);
      setCurrentAnswer(existingAnswer?.answer_text || '');
    }
  };

  const handlePrevious = () => {
    handleSaveAnswer();
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      const prevQuestion = questions[currentIndex - 1];
      const existingAnswer = answers.find(a => a.question_id === prevQuestion.id);
      setCurrentAnswer(existingAnswer?.answer_text || '');
    }
  };

  const handleSubmitAll = async () => {
    // Save current answer first
    handleSaveAnswer();

    // Make sure we have the latest answer
    const finalAnswers = [...answers];
    const currentQuestion = questions[currentIndex];
    const existingIndex = finalAnswers.findIndex(a => a.question_id === currentQuestion.id);
    if (existingIndex < 0 && currentAnswer.trim()) {
      finalAnswers.push({ question_id: currentQuestion.id, answer_text: currentAnswer });
    } else if (existingIndex >= 0) {
      finalAnswers[existingIndex].answer_text = currentAnswer;
    }

    if (finalAnswers.length < questions.length) {
      toast.error(`Please answer all questions (${finalAnswers.length}/${questions.length} answered)`);
      return;
    }

    try {
      setCompleting(true);
      const result = await videoInterviewService.submitAIInterviewAnswers(Number(videoId), finalAnswers);
      setScoreResult(result.score_result);
      setIsActive(false);
      setInterview((prev: any) => ({ ...prev, status: 'completed' }));
      toast.success('Interview completed! Your responses have been scored.');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to submit answers');
    } finally {
      setCompleting(false);
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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SmartToy sx={{ color: '#8b5cf6', fontSize: 24 }} />
                <Typography sx={{ color: '#1e293b', fontWeight: 700, fontSize: '18px' }}>
                  AI Interview - {interview?.job_title || 'Video Interview'}
                </Typography>
              </Box>
              <Typography sx={{ color: '#64748b', fontSize: '13px' }}>
                {interview?.candidate_name || 'Candidate'} • Interview #{videoId}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {isActive && (
              <Chip
                icon={<FiberManualRecord sx={{ fontSize: 12, color: '#8b5cf6 !important', animation: 'pulse 2s infinite' }} />}
                label="AI INTERVIEW"
                sx={{
                  background: '#f3e8ff',
                  color: '#8b5cf6',
                  fontWeight: 700,
                  fontSize: '12px',
                  border: '1px solid #d8b4fe',
                  '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.5 } }
                }}
              />
            )}
            <Box sx={{
              background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
              borderRadius: '10px',
              padding: '10px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)'
            }}>
              <AccessTime sx={{ color: 'white', fontSize: 20 }} />
              <Typography sx={{ color: 'white', fontFamily: 'monospace', fontWeight: 700, fontSize: '20px' }}>
                {formatTime(elapsed)}
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Main Content */}
        <Box sx={{ flex: 1, display: 'flex', padding: '20px', gap: 3 }}>
          {/* Interview Area */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {!isActive && !isCompleted ? (
              // Start Screen
              <Paper sx={{
                flex: 1,
                background: 'white',
                borderRadius: '20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
                p: 4
              }}>
                <Box sx={{
                  width: 120,
                  height: 120,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 3,
                  boxShadow: '0 10px 40px rgba(139, 92, 246, 0.3)'
                }}>
                  <SmartToy sx={{ color: 'white', fontSize: 60 }} />
                </Box>
                <Typography sx={{ color: '#1e293b', fontSize: '24px', fontWeight: 700, mb: 1 }}>
                  AI Interview Ready
                </Typography>
                <Typography sx={{ color: '#64748b', fontSize: '16px', mb: 1, textAlign: 'center', maxWidth: 500 }}>
                  You will be presented with {questions.length} questions one by one.
                  Type your answers and submit when complete.
                </Typography>
                <Typography sx={{ color: '#94a3b8', fontSize: '14px', mb: 4 }}>
                  Take your time to provide thoughtful responses.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<SmartToy />}
                  onClick={handleStart}
                  sx={{
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                    padding: '16px 48px',
                    borderRadius: '30px',
                    fontWeight: 600,
                    fontSize: '16px',
                    textTransform: 'none',
                    boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
                      boxShadow: '0 6px 20px rgba(139, 92, 246, 0.5)'
                    }
                  }}
                >
                  Start AI Interview
                </Button>
              </Paper>
            ) : isCompleted ? (
              // Score Result Screen
              <Paper sx={{
                flex: 1,
                background: 'white',
                borderRadius: '20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
                p: 4
              }}>
                {scoreResult ? (
                  <Box sx={{ textAlign: 'center', maxWidth: 500 }}>
                    <Box sx={{
                      width: 100,
                      height: 100,
                      borderRadius: '50%',
                      background: scoreResult.overall_score >= 7 ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' :
                                 scoreResult.overall_score >= 5 ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' :
                                 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 20px',
                      boxShadow: '0 10px 40px rgba(0,0,0,0.15)'
                    }}>
                      <Typography sx={{ color: 'white', fontSize: '28px', fontWeight: 700 }}>
                        {Math.round(scoreResult.overall_score * 10)}%
                      </Typography>
                    </Box>
                    <Typography sx={{ color: '#1e293b', fontSize: '24px', fontWeight: 700, mb: 2 }}>
                      Interview Completed!
                    </Typography>
                    <Chip
                      label={scoreResult.recommendation?.toUpperCase() || 'SCORED'}
                      sx={{
                        mb: 3,
                        fontWeight: 700,
                        fontSize: '14px',
                        padding: '8px 16px',
                        background: scoreResult.recommendation === 'select' ? '#10b981' :
                                   scoreResult.recommendation === 'next_round' ? '#f59e0b' : '#ef4444',
                        color: 'white'
                      }}
                    />
                    {scoreResult.strengths && (
                      <Box sx={{ textAlign: 'left', mb: 2, p: 2, background: '#f0fdf4', borderRadius: '12px' }}>
                        <Typography sx={{ color: '#10b981', fontSize: '14px', fontWeight: 600, mb: 1 }}>
                          Strengths:
                        </Typography>
                        <Typography sx={{ color: '#374151', fontSize: '14px' }}>
                          {scoreResult.strengths}
                        </Typography>
                      </Box>
                    )}
                    {scoreResult.weaknesses && (
                      <Box sx={{ textAlign: 'left', mb: 3, p: 2, background: '#fffbeb', borderRadius: '12px' }}>
                        <Typography sx={{ color: '#f59e0b', fontSize: '14px', fontWeight: 600, mb: 1 }}>
                          Areas to Improve:
                        </Typography>
                        <Typography sx={{ color: '#374151', fontSize: '14px' }}>
                          {scoreResult.weaknesses}
                        </Typography>
                      </Box>
                    )}
                    <Button
                      variant="contained"
                      onClick={() => navigate(`/video-detail/${videoId}`)}
                      sx={{
                        background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                        padding: '14px 32px',
                        borderRadius: '12px',
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
              // Question & Answer Area
              <>
                {/* Progress Bar */}
                <Box sx={{ background: 'white', borderRadius: '16px', p: 2, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography sx={{ color: '#64748b', fontSize: '14px', fontWeight: 600 }}>
                      Question {currentIndex + 1} of {questions.length}
                    </Typography>
                    <Typography sx={{ color: '#8b5cf6', fontSize: '14px', fontWeight: 600 }}>
                      {Math.round(progress)}% Complete
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={progress}
                    sx={{
                      height: 8,
                      borderRadius: 4,
                      background: '#e2e8f0',
                      '& .MuiLinearProgress-bar': {
                        background: 'linear-gradient(90deg, #8b5cf6 0%, #6d28d9 100%)',
                        borderRadius: 4
                      }
                    }}
                  />
                </Box>

                {/* Question Card */}
                <Card sx={{
                  background: 'white',
                  borderRadius: '20px',
                  boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
                  overflow: 'visible'
                }}>
                  {/* AI Avatar Header */}
                  <Box sx={{
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                    p: 3,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2
                  }}>
                    <Avatar sx={{
                      width: 56,
                      height: 56,
                      background: 'white',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.2)'
                    }}>
                      <SmartToy sx={{ color: '#8b5cf6', fontSize: 32 }} />
                    </Avatar>
                    <Box>
                      <Typography sx={{ color: 'white', fontWeight: 700, fontSize: '18px' }}>
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
                              fontSize: '11px',
                              height: 22
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
                              fontSize: '11px',
                              height: 22
                            }}
                          />
                        )}
                      </Box>
                    </Box>
                  </Box>

                  {/* Question Text */}
                  <Box sx={{ p: 3 }}>
                    <Typography sx={{
                      color: '#1e293b',
                      fontSize: '18px',
                      fontWeight: 500,
                      lineHeight: 1.6,
                      mb: 3
                    }}>
                      {currentQuestion?.question_text || 'Loading question...'}
                    </Typography>

                    {/* Answer Input */}
                    <Box sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 2
                    }}>
                      <Avatar sx={{
                        width: 44,
                        height: 44,
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                      }}>
                        <Person sx={{ fontSize: 24 }} />
                      </Avatar>
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={{ color: '#64748b', fontSize: '13px', mb: 1, fontWeight: 600 }}>
                          Your Answer:
                        </Typography>
                        <TextField
                          multiline
                          rows={6}
                          fullWidth
                          placeholder="Type your answer here... Be detailed and specific."
                          value={currentAnswer}
                          onChange={(e) => setCurrentAnswer(e.target.value)}
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              borderRadius: '12px',
                              '& fieldset': { borderColor: '#e2e8f0' },
                              '&:hover fieldset': { borderColor: '#8b5cf6' },
                              '&.Mui-focused fieldset': { borderColor: '#8b5cf6' }
                            }
                          }}
                        />
                      </Box>
                    </Box>
                  </Box>
                </Card>

                {/* Navigation Controls */}
                <Box sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'white',
                  borderRadius: '16px',
                  p: 2,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
                }}>
                  <Button
                    startIcon={<NavigateBefore />}
                    onClick={handlePrevious}
                    disabled={currentIndex === 0}
                    sx={{
                      color: '#64748b',
                      textTransform: 'none',
                      fontWeight: 600,
                      '&:disabled': { color: '#cbd5e1' }
                    }}
                  >
                    Previous
                  </Button>

                  <Box sx={{ display: 'flex', gap: 1 }}>
                    {questions.map((_, idx) => (
                      <Box
                        key={idx}
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: idx === currentIndex ? '#8b5cf6' :
                                     answers.find(a => a.question_id === questions[idx]?.id) ? '#10b981' :
                                     '#e2e8f0',
                          transition: 'all 0.2s'
                        }}
                      />
                    ))}
                  </Box>

                  {currentIndex === questions.length - 1 ? (
                    <Button
                      variant="contained"
                      endIcon={completing ? <CircularProgress size={20} sx={{ color: 'white' }} /> : <Check />}
                      onClick={handleSubmitAll}
                      disabled={completing}
                      sx={{
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        textTransform: 'none',
                        fontWeight: 600,
                        borderRadius: '10px',
                        padding: '10px 24px',
                        '&:hover': {
                          background: 'linear-gradient(135deg, #059669 0%, #047857 100%)'
                        }
                      }}
                    >
                      {completing ? 'Submitting...' : 'Submit All Answers'}
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      endIcon={<NavigateNext />}
                      onClick={handleNext}
                      sx={{
                        background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                        textTransform: 'none',
                        fontWeight: 600,
                        borderRadius: '10px',
                        padding: '10px 24px',
                        '&:hover': {
                          background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)'
                        }
                      }}
                    >
                      Next Question
                    </Button>
                  )}
                </Box>
              </>
            )}
          </Box>

          {/* Sidebar */}
          <Box sx={{ width: 320, display: 'flex', flexDirection: 'column', gap: 3 }}>
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

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, p: 2, background: '#f8fafc', borderRadius: '12px' }}>
                <Avatar sx={{ width: 44, height: 44, background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)' }}>
                  {interview?.candidate_name?.charAt(0).toUpperCase() || 'C'}
                </Avatar>
                <Box>
                  <Typography sx={{ color: '#1e293b', fontWeight: 600, fontSize: '14px' }}>
                    {interview?.candidate_name || 'Candidate'}
                  </Typography>
                  <Typography sx={{ color: '#64748b', fontSize: '12px' }}>Candidate</Typography>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ color: '#64748b', fontSize: '13px' }}>Position</Typography>
                  <Typography sx={{ color: '#1e293b', fontSize: '13px', fontWeight: 600 }}>{interview?.job_title || 'N/A'}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ color: '#64748b', fontSize: '13px' }}>Questions</Typography>
                  <Typography sx={{ color: '#1e293b', fontSize: '13px', fontWeight: 600 }}>{questions.length}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ color: '#64748b', fontSize: '13px' }}>Answered</Typography>
                  <Typography sx={{ color: '#10b981', fontSize: '13px', fontWeight: 600 }}>{answers.length}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ color: '#64748b', fontSize: '13px' }}>Mode</Typography>
                  <Chip label="AI Interview" size="small" sx={{ background: '#f3e8ff', color: '#8b5cf6', fontWeight: 600, fontSize: '11px' }} />
                </Box>
              </Box>
            </Paper>

            {/* Tips */}
            <Paper sx={{
              background: 'linear-gradient(135deg, #f3e8ff 0%, #e8d5ff 100%)',
              borderRadius: '16px',
              padding: '20px',
              border: '1px solid #d8b4fe'
            }}>
              <Typography sx={{ color: '#6d28d9', fontSize: '14px', fontWeight: 700, mb: 2 }}>
                Interview Tips
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Typography sx={{ color: '#7c3aed', fontSize: '13px' }}>
                  • Be specific with examples from your experience
                </Typography>
                <Typography sx={{ color: '#7c3aed', fontSize: '13px' }}>
                  • Structure your answers clearly
                </Typography>
                <Typography sx={{ color: '#7c3aed', fontSize: '13px' }}>
                  • Take your time to think before answering
                </Typography>
                <Typography sx={{ color: '#7c3aed', fontSize: '13px' }}>
                  • You can go back to previous questions
                </Typography>
              </Box>
            </Paper>
          </Box>
        </Box>
      </Box>
    </Navigation>
  );
};

export default AIInterviewRoom;
