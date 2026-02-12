import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Navigation from '../layout/Sidebar';
import {
    Box,
    Typography,
    Card,
    CardContent,
    Chip,
    IconButton,
    CircularProgress,
    Button,
    Tabs,
    Tab,
    TextField,
    Dialog,
    DialogTitle,
    DialogContent,
} from '@mui/material';
import {
    Edit as EditIcon,
    ArrowBack as ArrowBackIcon,
    Lock as LockIcon,
    CheckCircle as CheckCircleIcon,
    Schedule as ScheduleIcon,
    History as HistoryIcon,
    Close as CloseIcon,
    Autorenew as AutorenewIcon,
    KeyboardArrowDown as KeyboardArrowDownIcon,
    KeyboardArrowUp as KeyboardArrowUpIcon,
} from '@mui/icons-material';
import Collapse from '@mui/material/Collapse';
import { toast } from 'react-hot-toast';
import questionGenerationService from '../../services/questionGenerationService';

interface Question {
    id: string;
    question: string;
    sample_answer: string;
    difficulty: string;
    category: string;
    skills_tested: string[];
    status?: 'pending' | 'approved';
    is_golden?: boolean;
    expert_notes?: string;
}

interface QuestionSet {
    id: string;
    job_id: number;
    application_id: number;
    job_title?: string;
    candidate_name?: string;
    candidate_email?: string;
    questions: Question[];
    status: string;
    generated_at: string;
    mode: 'preview' | 'live';
    main_topics?: string[];
    total_questions: number;
    experience?: string;
}

const InterviewOutline: React.FC = () => {
    const { setId } = useParams<{ setId: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [questionSet, setQuestionSet] = useState<QuestionSet | null>(null);
    const [loading, setLoading] = useState(true);
    const [approvingAll, setApprovingAll] = useState(false);
    const [regenerating, setRegenerating] = useState(false);
    const [activeTab, setActiveTab] = useState(0); // 0: All, 1: Pending, 2: Approved
  const [showAllTopics, setShowAllTopics] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editedAnswer, setEditedAnswer] = useState<string>('');
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyQuestionLabel, setHistoryQuestionLabel] = useState('');

    // Get navigation context from URL parameters
    const fromPage = searchParams.get('from');
    const jobId = searchParams.get('jobId');
    const jobTitle = searchParams.get('jobTitle');
    const interviewId = searchParams.get('interviewId');

    useEffect(() => {
        if (setId) {
            fetchQuestionSet();
        }
    }, [setId]);

    const fetchQuestionSet = async () => {
        try {
            setLoading(true);
            const response = await questionGenerationService.getQuestionSets();
            const sets = response.data;
            const currentSet = sets.find((set: QuestionSet) => set.id === setId);

            if (currentSet) {
                // Fetch detailed questions for this candidate
                try {
                    const questions = await questionGenerationService.getCandidateQuestions(
                        currentSet.job_id,
                        currentSet.application_id
                    );

                    // Transform questions to match our interface
                    const transformedQuestions = questions.map(q => ({
                        id: q.id.toString(),
                        question: q.question_text,
                        sample_answer: q.sample_answer,
                        difficulty: q.difficulty,
                        category: q.question_type,
                        skills_tested: q.skill_focus ? [q.skill_focus] : [],
                        status: q.is_approved ? 'approved' : 'pending',
                        is_golden: q.is_approved,
                        expert_notes: q.expert_notes || ''
                    }));

                    console.log('Transformed questions:', transformedQuestions);
                    console.log('Approved count:', transformedQuestions.filter(q => q.status === 'approved').length);
                    console.log('Pending count:', transformedQuestions.filter(q => q.status === 'pending').length);

                    setQuestionSet({
                        ...currentSet,
                        questions: transformedQuestions
                    });
                    if (transformedQuestions.length > 0) {
                        setExpandedQuestionId(transformedQuestions[0].id);
                    }
                } catch (error) {
                    // If detailed fetch fails, use the basic data
                    console.log('Detailed fetch failed, using basic data:', error);
                    console.log('Current set questions:', currentSet.questions);
                    
                    // Transform basic questions to ensure proper status
                    const basicQuestions = currentSet.questions.map((q: any) => ({
                        ...q,
                        status: q.status || 'pending', // Ensure status is set
                        is_golden: q.is_golden || false
                    }));
                    
                    setQuestionSet({
                        ...currentSet,
                        questions: basicQuestions
                    });
                    if (basicQuestions.length > 0) {
                        setExpandedQuestionId(basicQuestions[0].id);
                    }
                }

            } else {
                toast.error('Question set not found');
                navigate('/ai-questions');
            }
        } catch (error) {
            console.error('Error fetching question set:', error);
            toast.error('Failed to load question set');
            navigate('/ai-questions');
        } finally {
            setLoading(false);
        }
    };

    const handleGoBack = () => {
        // Check if we came from manage-candidates page
        if (fromPage === 'manage-candidates' && jobId && jobTitle) {
            navigate(`/recruiter-candidates?jobId=${jobId}&jobTitle=${encodeURIComponent(jobTitle)}`);
        } else if (window.history.length > 1) {
            // Go back to previous page in history
            navigate(-1);
        } else {
            // Fallback to AI Questions page if no history
            navigate('/ai-questions');
        }
    };

    const handleApproveQuestion = async (questionId: string) => {
        if (!questionSet) return;

        try {
            await questionGenerationService.expertReviewQuestion({
                question_id: parseInt(questionId),
                is_approved: true,
                expert_notes: 'Approved as golden standard'
            });

            // Update local state
            setQuestionSet(prev => prev ? {
                ...prev,
                questions: prev.questions.map(q =>
                    q.id === questionId
                        ? { ...q, status: 'approved', is_golden: true, expert_notes: 'Approved as golden standard' }
                        : q
                )
            } : null);

            toast.success('Question approved as golden standard!');
        } catch (error) {
            console.error('Error approving question:', error);
            toast.error('Failed to approve question');
        }
    };

    const handleApproveAll = async () => {
        if (!questionSet) return;

        const pendingQuestions = questionSet.questions.filter(q => q.status === 'pending');

        if (pendingQuestions.length === 0) {
            toast('All questions are already approved!', { icon: 'ℹ️' });
            return;
        }

        setApprovingAll(true);
        let successCount = 0;
        let failCount = 0;

        try {
            for (const question of pendingQuestions) {
                try {
                    await questionGenerationService.expertReviewQuestion({
                        question_id: parseInt(question.id),
                        is_approved: true,
                        expert_notes: 'Approved as golden standard'
                    });
                    successCount++;
                } catch (error) {
                    console.error(`Error approving question ${question.id}:`, error);
                    failCount++;
                }
            }

            // Update local state for all approved questions
            setQuestionSet(prev => prev ? {
                ...prev,
                questions: prev.questions.map(q =>
                    q.status === 'pending'
                        ? { ...q, status: 'approved', is_golden: true, expert_notes: 'Approved as golden standard' }
                        : q
                )
            } : null);

            if (failCount === 0) {
                toast.success(`All ${successCount} questions approved successfully!`);
                // Redirect after approval
                setTimeout(() => {
                    if (interviewId) {
                        navigate(`/video-detail/${interviewId}`);
                    } else {
                        navigate('/video-interviews');
                    }
                }, 1500);
            } else {
                toast.success(`${successCount} questions approved, ${failCount} failed.`);
            }
        } catch (error) {
            console.error('Error in bulk approval:', error);
            toast.error('Failed to approve all questions');
        } finally {
            setApprovingAll(false);
        }
    };


    const handleRegenerate = async () => {
        if (!questionSet) return;

        const confirmed = window.confirm(
            'Are you sure you want to regenerate all questions? This will delete the current questions and generate new ones.'
        );
        if (!confirmed) return;

        setRegenerating(true);
        try {
            const result = await questionGenerationService.regenerateQuestions({
                job_id: questionSet.job_id,
                candidate_id: questionSet.application_id,
                total_questions: questionSet.total_questions || 10
            });
            toast.success('Questions regenerated successfully!');
            // Navigate to the new session ID since the old one was deleted
            const newSessionId = result.session_id;
            if (newSessionId && String(newSessionId) !== setId) {
                navigate(`/interview-outline/${newSessionId}`, { replace: true });
            } else {
                await fetchQuestionSet();
            }
        } catch (error) {
            console.error('Error regenerating questions:', error);
            toast.error('Failed to regenerate questions');
        } finally {
            setRegenerating(false);
        }
    };

    const getApprovedCount = () => {
        if (!questionSet) return 0;
        return questionSet.questions.filter(q => q.status === 'approved').length;
    };

    const getPendingCount = () => {
        if (!questionSet) return 0;
        return questionSet.questions.filter(q => q.status === 'pending').length;
    };

    const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
        setActiveTab(newValue);
    };

    const getFilteredQuestions = () => {
        if (!questionSet) return [];

        switch (activeTab) {
            case 1: // Pending
                return questionSet.questions.filter(q => q.status === 'pending');
            case 2: // Approved
                return questionSet.questions.filter(q => q.status === 'approved');
            default: // All
                return questionSet.questions;
        }
    };

    const handleEditAnswer = (questionId: string, currentAnswer: string) => {
        setEditingQuestionId(questionId);
        setEditedAnswer(currentAnswer);
    };

    const handleSaveAnswer = async (questionId: string) => {
        if (!questionSet || !editedAnswer.trim()) return;

        try {
            // Update the answer and approve it as golden standard
            await questionGenerationService.updateQuestion(parseInt(questionId), {
                sample_answer: editedAnswer,
                is_approved: true // Automatically approve when edited
            });

            // Also call expert review to mark as approved
            await questionGenerationService.expertReviewQuestion({
                question_id: parseInt(questionId),
                is_approved: true,
                expert_notes: 'Approved as golden standard'
            });

            // Update local state
            setQuestionSet(prev => prev ? {
                ...prev,
                questions: prev.questions.map(q =>
                    q.id === questionId
                        ? { 
                            ...q, 
                            sample_answer: editedAnswer, 
                            status: 'approved', 
                            is_golden: true,
                            expert_notes: 'Approved as golden standard'
                        }
                        : q
                )
            } : null);

            setEditingQuestionId(null);
            setEditedAnswer('');
            toast.success('Answer updated and approved as golden standard!');
        } catch (error) {
            console.error('Error updating answer:', error);
            toast.error('Failed to update answer');
        }
    };

    const handleCancelEdit = () => {
        setEditingQuestionId(null);
        setEditedAnswer('');
    };

    const handleOpenHistory = async (questionId: string, questionIndex: number) => {
        setHistoryQuestionLabel(`Question ${questionIndex + 1}`);
        setHistoryDialogOpen(true);
        setHistoryLoading(true);
        try {
            const data = await questionGenerationService.getQuestionHistory(parseInt(questionId));
            setHistoryData(data);
        } catch {
            toast.error('Failed to load history');
            setHistoryData([]);
        } finally {
            setHistoryLoading(false);
        }
    };

    if (loading) {
        return (
            <Navigation>
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                    <CircularProgress size={40} />
                </Box>
            </Navigation>
        );
    }

    if (!questionSet) {
        return (
            <Navigation>
                <Box sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="h6" color="textSecondary">
                        Question set not found
                    </Typography>
                    <Button onClick={handleGoBack} sx={{ mt: 2 }}>
                        {fromPage === 'manage-candidates' ? 'Back to Candidates' : 'Go Back'}
                    </Button>
                </Box>
            </Navigation>
        );
    }

    return (
        <Navigation>
            <Box sx={{
                display: 'flex', backgroundColor: 'white', minHeight: '100vh', m: { xs: '8px', sm: '20px' }, borderRadius: "10px", boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            }}>
                {/* Main Content */}
                <Box sx={{ flex: 1, p: { xs: 2, sm: 3 }, pr: { xs: 2, lg: 1 } }}>
                    {/* Clean Header */}
                    <Box sx={{ mb: 3 }}>

                        <Box sx={{ display: "flex", flexDirection: { xs: 'column', sm: 'row' }, justifyContent: "space-between", gap: { xs: 1.5, sm: 0 } }}>
                            <Box sx={{ minWidth: 0 }}>
                                <Typography variant="h1" sx={{ color: 'black', fontSize: { xs: '0.95rem', sm: '1.1rem' }, wordBreak: 'break-word' }}>
                                    {questionSet?.job_title} • {questionSet?.candidate_name}
                                </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', gap: { xs: 1, sm: 2 }, flexShrink: 0, flexWrap: 'wrap' }}>
                                {/* Approve All Button */}
                                {getPendingCount() > 0 && (
                                    <Button
                                        onClick={handleApproveAll}
                                        disabled={approvingAll}
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 0.5,
                                            p: { xs: '2px 10px', sm: '2px 16px' },
                                            fontSize: { xs: '13px', sm: '14px' },
                                            backgroundColor: '#10b981',
                                            color: 'white',
                                            border: '1px solid #10b981',
                                            borderRadius: 1,
                                            textTransform: 'none',
                                            fontWeight: 600,
                                            '&:hover': {
                                                backgroundColor: '#059669',
                                                border: '1px solid #059669',
                                            },
                                            '&:disabled': {
                                                backgroundColor: '#9ca3af',
                                                border: '1px solid #9ca3af',
                                                color: 'white',
                                            },
                                        }}
                                    >
                                        {approvingAll ? (
                                            <>
                                                <CircularProgress size={16} sx={{ color: 'white' }} />
                                                <Typography>Approving...</Typography>
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircleIcon fontSize="small" />
                                                <Typography>Approve All ({getPendingCount()})</Typography>
                                            </>
                                        )}
                                    </Button>
                                )}
                                {/* Regenerate Button */}
                                <Button
                                    onClick={handleRegenerate}
                                    disabled={regenerating}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 0.5,
                                        p: { xs: '2px 10px', sm: '2px 16px' },
                                        fontSize: { xs: '13px', sm: '14px' },
                                        backgroundColor: 'white',
                                        color: '#374151',
                                        border: '1px solid #d1d5db',
                                        borderRadius: 1,
                                        textTransform: 'none',
                                        fontWeight: 600,
                                        '&:hover': {
                                            backgroundColor: '#f9fafb',
                                            border: '1px solid #9ca3af',
                                        },
                                        '&:disabled': {
                                            backgroundColor: '#f3f4f6',
                                            border: '1px solid #e5e7eb',
                                            color: '#9ca3af',
                                        },
                                    }}
                                >
                                    {regenerating ? (
                                        <>
                                            <CircularProgress size={16} sx={{ color: '#374151' }} />
                                            <Typography>Regenerating...</Typography>
                                        </>
                                    ) : (
                                        <>
                                            <AutorenewIcon fontSize="small" />
                                            <Typography>Regenerate</Typography>
                                        </>
                                    )}
                                </Button>
                                {/* Back Button */}
                                <Box
                                    onClick={handleGoBack}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1,
                                        width: 'fit-content',
                                        p: "2px 10px",
                                        border: '1px solid #020291',
                                        color: '#020291',
                                        cursor: 'pointer',
                                        borderRadius: 1,
                                        '&:hover': {
                                            backgroundColor: '#0202911A',
                                        },
                                    }}
                                >
                                    <ArrowBackIcon fontSize="small" />
                                    <Typography>
                                        {fromPage === 'manage-candidates' ? 'Back to Candidates' : 'Back'}
                                    </Typography>
                                </Box>
                            </Box>
                        </Box>
                        <Box sx={{ mb: 2 }}>


                            <Typography variant="body2" sx={{ color: '#9ca3af', mt: 0.5 }}>
                                {questionSet?.candidate_email}
                            </Typography>

                        </Box>

                        {/* Skills/Topics Tags */}
                        {questionSet?.main_topics && questionSet.main_topics.length > 0 && (
                            <Box sx={{ mb:"10px" }}>
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                                    {(showAllTopics ? questionSet.main_topics : questionSet.main_topics.slice(0, 3)).map((topic, index) => (
                                        <Chip
                                            key={index}
                                            label={topic}
                                            sx={{
                                                backgroundColor: '#f3f4f6',
                                                color: '#374151',
                                                fontWeight: 500,
                                                border: '1px solid #e5e7eb',
                                                '&:hover': {
                                                    backgroundColor: '#e5e7eb'
                                                }
                                            }}
                                        />
                                    ))}
                                    {questionSet.main_topics.length > 3 && (
                                        <Button
                                            variant="text"
                                            size="small"
                                            onClick={() => setShowAllTopics(!showAllTopics)}
                                            sx={{
                                                color: '#6b7280',
                                                textTransform: 'none',
                                                fontSize: '0.875rem',
                                                minWidth: 'auto',
                                                p: 0.5
                                            }}
                                        >
                                            {showAllTopics ? 'See less' : `See more (${questionSet.main_topics.length - 3})`}
                                        </Button>
                                    )}
                                </Box>
                            </Box>
                        )}

                        {/* Skills Analytics - New Addition */}
                        {questionSet?.main_topics && questionSet.main_topics.length > 0 && (
                            <Box sx={{ mb: 3 }}>
                                <Typography variant="body2" sx={{ color: '#374151', fontWeight: 600,mb:"10px" }}>
                                               Created:- {questionSet?.generated_at ? (() => {
                                                    const now = new Date();
                                                    const generatedDate = new Date(questionSet.generated_at);
                                                    const diffInMs = now.getTime() - generatedDate.getTime();
                                                    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
                                                    const diffInDays = Math.floor(diffInHours / 24);
                                                    
                                                    if (diffInDays > 0) {
                                                        return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
                                                    } else if (diffInHours > 0) {
                                                        return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
                                                    } else {
                                                        return 'Just now';
                                                    }
                                                })() : 'N/A'}
                                            </Typography>
                                <Box sx={{ display: 'flex',  flexWrap: 'wrap' }}>
                                    {/* Skill Match Accuracy with Circular Progress */}
                                    <Box sx={{ 
                                        display: 'flex', 
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: 1,
                                        minWidth: 120,
                                        pr:"20px"
                                    }}>
                                        <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.75rem', textAlign: 'center' }}>
                                            Skill Match Accuracy
                                        </Typography>
                                        <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {/* Background Circle */}
                                            <Box sx={{
                                                width: 60,
                                                height: 60,
                                                borderRadius: '50%',
                                                background: `conic-gradient(#f97316 0deg ${(getApprovedCount() / (questionSet?.questions.length || 1)) * 360}deg, #f3f4f6 ${(getApprovedCount() / (questionSet?.questions.length || 1)) * 360}deg 360deg)`,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                <Box sx={{
                                                    width: 44,
                                                    height: 44,
                                                    borderRadius: '50%',
                                                    backgroundColor: '#fff',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    <Typography variant="h6" sx={{ color: '#374151', fontWeight: 700, fontSize: '1rem' }}>
                                                        {Math.round((getApprovedCount() / (questionSet?.questions.length || 1)) * 100)}%
                                                    </Typography>
                                                </Box>
                                            </Box>
                                        </Box>
                                    </Box>

                                    {/* Completed Questions with Circular Progress */}
                                    <Box sx={{ 
                                        display: 'flex', 
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: 1,
                                        borderLeft:"1px solid #80808038",
                                        pl:"20px",
                                        minWidth: 120
                                    }}>
                                        <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.75rem', textAlign: 'center' }}>
                                            Completed Questions
                                        </Typography>
                                        <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {/* Background Circle */}
                                            <Box sx={{
                                                width: 60,
                                                height: 60,
                                                borderRadius: '50%',
                                                background: `conic-gradient(#10b981 0deg ${(getApprovedCount() / (questionSet?.questions.length || 1)) * 360}deg, #f3f4f6 ${(getApprovedCount() / (questionSet?.questions.length || 1)) * 360}deg 360deg)`,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                <Box sx={{
                                                    width: 44,
                                                    height: 44,
                                                    borderRadius: '50%',
                                                    backgroundColor: '#fff',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    <Typography variant="h6" sx={{ color: '#374151', fontWeight: 700, fontSize: '1rem' }}>
                                                        {getApprovedCount()}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                        </Box>
                                    </Box>
                                    
                                </Box>
                            </Box>
                        )}
                    </Box>

                    {/* Tabs for Filtering */}
                    <Box sx={{ borderBottom: 1, borderColor: '#e5e7eb', mb: { xs: 2, sm: 4 } }}>
                        <Tabs
                            value={activeTab}
                            onChange={handleTabChange}
                            variant="fullWidth"
                            sx={{
                                '& .MuiTab-root': {
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    color: '#6b7280',
                                    fontSize: { xs: '13px', sm: '14px' },
                                    minHeight: { xs: '40px', sm: '48px' },
                                    px: { xs: 1, sm: 3 },
                                    '&.Mui-selected': {
                                        color: '#374151'
                                    }
                                },
                                '& .MuiTabs-indicator': {
                                    backgroundColor: '#374151'
                                }
                            }}
                        >
                            <Tab
                                label={`All (${questionSet?.questions.length || 0})`}
                                sx={{ minWidth: 'auto' }}
                            />
                            <Tab
                                label={`Pending (${getPendingCount()})`}
                                sx={{ minWidth: 'auto' }}
                            />
                            <Tab
                                label={`Approved (${getApprovedCount()})`}
                                sx={{ minWidth: 'auto' }}
                            />
                        </Tabs>
                    </Box>

                    {/* Questions - Accordion Style */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {getFilteredQuestions().map((question) => {
                            const qIndex = (questionSet?.questions.findIndex(q => q.id === question.id) ?? 0) + 1;
                            const isExpanded = expandedQuestionId === question.id;
                            return (
                                <Box key={question.id}>
                                    {/* Compact Row */}
                                    <Box
                                        onClick={() => setExpandedQuestionId(isExpanded ? null : question.id)}
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: { xs: 1, sm: 2 },
                                            px: { xs: 1.5, sm: 2.5 },
                                            py: 1.5,
                                            cursor: 'pointer',
                                            borderBottom: '1px solid #f3f4f6',
                                            backgroundColor: isExpanded ? '#f9fafb' : 'white',
                                            '&:hover': { backgroundColor: '#f9fafb' },
                                            transition: 'background-color 0.15s',
                                        }}
                                    >
                                        {/* Q Number Badge */}
                                        <Typography sx={{
                                            fontWeight: 700,
                                            fontSize: '0.85rem',
                                            color: question.status === 'approved' ? '#059669' : '#d97706',
                                            minWidth: 28,
                                            flexShrink: 0,
                                        }}>
                                            Q{qIndex}
                                        </Typography>

                                        {/* Question Text (truncated) */}
                                        <Typography sx={{
                                            flex: 1,
                                            fontSize: { xs: '0.85rem', sm: '0.9rem' },
                                            color: '#374151',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {question.question}
                                        </Typography>

                                        {/* Edit icon */}
                                        <IconButton
                                            size="small"
                                            onClick={(e) => { e.stopPropagation(); handleEditAnswer(question.id, question.sample_answer); }}
                                            sx={{ color: '#6b7280', p: 0.5 }}
                                            title="Edit answer"
                                        >
                                            <EditIcon sx={{ fontSize: '1rem' }} />
                                        </IconButton>

                                        {/* History icon */}
                                        <IconButton
                                            size="small"
                                            onClick={(e) => { e.stopPropagation(); handleOpenHistory(question.id, qIndex - 1); }}
                                            sx={{ color: '#6b7280', p: 0.5 }}
                                            title="View history"
                                        >
                                            <HistoryIcon sx={{ fontSize: '1rem' }} />
                                        </IconButton>

                                        {/* Status chip */}
                                        <Chip
                                            label={question.status === 'approved' ? 'Approved' : 'Pending'}
                                            size="small"
                                            icon={question.status === 'approved' ? <CheckCircleIcon /> : <ScheduleIcon />}
                                            sx={{
                                                backgroundColor: question.status === 'approved' ? '#f0fdf4' : '#fffbeb',
                                                color: question.status === 'approved' ? '#166534' : '#92400e',
                                                fontWeight: 500,
                                                fontSize: '0.75rem',
                                                height: 26,
                                                border: question.status === 'approved' ? '1px solid #bbf7d0' : '1px solid #fde68a',
                                                display: { xs: 'none', sm: 'flex' },
                                                '& .MuiChip-icon': {
                                                    color: question.status === 'approved' ? '#166534' : '#92400e',
                                                    fontSize: '0.9rem',
                                                }
                                            }}
                                        />

                                        {/* Chevron */}
                                        {isExpanded
                                            ? <KeyboardArrowUpIcon sx={{ color: '#9ca3af', flexShrink: 0 }} />
                                            : <KeyboardArrowDownIcon sx={{ color: '#9ca3af', flexShrink: 0 }} />
                                        }
                                    </Box>

                                    {/* Expanded Content */}
                                    <Collapse in={isExpanded}>
                                        <Box sx={{
                                            px: { xs: 2, sm: 3 },
                                            py: 2.5,
                                            backgroundColor: '#fafbfc',
                                            borderBottom: '1px solid #e5e7eb',
                                        }}>
                                            {/* Approve button (only for pending) */}
                                            {question.status === 'pending' && (
                                                <Box sx={{ mb: 2 }}>
                                                    <Button
                                                        variant="contained"
                                                        size="small"
                                                        onClick={(e) => { e.stopPropagation(); handleApproveQuestion(question.id); }}
                                                        sx={{
                                                            backgroundColor: '#020291',
                                                            color: '#fff',
                                                            fontWeight: 600,
                                                            textTransform: 'none',
                                                            px: 2,
                                                            py: 0.5,
                                                            fontSize: '0.8rem',
                                                            boxShadow: 'none',
                                                            '&:hover': { backgroundColor: '#01016d', boxShadow: 'none' }
                                                        }}
                                                    >
                                                        Approve
                                                    </Button>
                                                </Box>
                                            )}

                                            {/* Full Question Text */}
                                            <Typography sx={{ color: '#1f2937', lineHeight: 1.7, mb: 2, fontSize: { xs: '0.9rem', sm: '1rem' } }}>
                                                {question.question}
                                            </Typography>

                                            {/* Tags */}
                                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
                                                {question.skills_tested.length > 0 && (
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                        <Typography variant="caption" sx={{ color: '#666', fontWeight: 600 }}>Skills:</Typography>
                                                        {question.skills_tested.map((skill, i) => (
                                                            <Chip key={i} label={skill} size="small" sx={{ backgroundColor: '#f9fafb', color: '#374151', fontSize: '0.75rem', height: 24, border: '1px solid #e5e7eb' }} />
                                                        ))}
                                                    </Box>
                                                )}
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <Typography variant="caption" sx={{ color: '#666', fontWeight: 600 }}>Type:</Typography>
                                                    <Chip label={question.category} size="small" sx={{ backgroundColor: '#f9fafb', color: '#374151', fontSize: '0.75rem', height: 24, border: '1px solid #e5e7eb' }} />
                                                </Box>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <Typography variant="caption" sx={{ color: '#666', fontWeight: 600 }}>Difficulty:</Typography>
                                                    <Chip label={question.difficulty} size="small" sx={{ backgroundColor: '#f9fafb', color: '#374151', fontSize: '0.75rem', height: 24, border: '1px solid #e5e7eb' }} />
                                                </Box>
                                            </Box>

                                            {/* AI Answer */}
                                            <Box sx={{
                                                backgroundColor: question.is_golden ? '#f8fffe' : '#fff',
                                                border: question.is_golden ? '1px solid #d1fae5' : '1px solid #e5e7eb',
                                                borderLeft: question.is_golden ? '3px solid #10b981' : '3px solid #6b7280',
                                                borderRadius: 2,
                                                p: 2,
                                            }}>
                                                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151', mb: 1 }}>
                                                    AI Answer
                                                </Typography>

                                                {editingQuestionId === question.id ? (
                                                    <Box>
                                                        <TextField
                                                            fullWidth
                                                            multiline
                                                            rows={4}
                                                            value={editedAnswer}
                                                            onChange={(e) => setEditedAnswer(e.target.value)}
                                                            sx={{ mb: 2 }}
                                                        />
                                                        <Box sx={{ display: 'flex', gap: 1 }}>
                                                            <Button variant="contained" size="small" onClick={() => handleSaveAnswer(question.id)}
                                                                sx={{ backgroundColor: '#10b981', color: 'white', '&:hover': { backgroundColor: '#059669' } }}>
                                                                Save
                                                            </Button>
                                                            <Button variant="outlined" size="small" onClick={handleCancelEdit}
                                                                sx={{ borderColor: '#6b7280', color: '#6b7280' }}>
                                                                Cancel
                                                            </Button>
                                                        </Box>
                                                    </Box>
                                                ) : (
                                                    <Typography variant="body2" sx={{ color: question.is_golden ? '#065f46' : '#4b5563', lineHeight: 1.6 }}>
                                                        {question.sample_answer}
                                                    </Typography>
                                                )}
                                            </Box>
                                        </Box>
                                    </Collapse>
                                </Box>
                            );
                        })}
                    </Box>

                    {/* Empty State */}
                    {getFilteredQuestions().length === 0 && questionSet?.questions.length > 0 && (
                        <Box sx={{ textAlign: 'center', py: 8 }}>
                            <Typography variant="h6" color="textSecondary" sx={{ mb: 2 }}>
                                No {activeTab === 1 ? 'pending' : activeTab === 2 ? 'approved' : ''} questions
                            </Typography>
                            <Typography variant="body2" color="textSecondary">
                                {activeTab === 1
                                    ? 'All questions have been approved.'
                                    : activeTab === 2
                                        ? 'No questions have been approved yet.'
                                        : 'No questions available.'
                                }
                            </Typography>
                        </Box>
                    )}

                    {questionSet?.questions.length === 0 && (
                        <Box sx={{ textAlign: 'center', py: 8 }}>
                            <Typography variant="h6" color="textSecondary" sx={{ mb: 2 }}>
                                No questions available
                            </Typography>
                            <Typography variant="body2" color="textSecondary">
                                Questions for this candidate haven't been generated yet.
                            </Typography>
                        </Box>
                    )}
                </Box>


            </Box>

            {/* Version History Dialog */}
            <Dialog
                open={historyDialogOpen}
                onClose={() => setHistoryDialogOpen(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{ sx: { borderRadius: 3 } }}
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.1rem' }}>
                        {historyQuestionLabel} — Edit History
                    </Typography>
                    <IconButton size="small" onClick={() => setHistoryDialogOpen(false)}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    {historyLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                            <CircularProgress size={32} />
                        </Box>
                    ) : historyData.length === 0 ? (
                        <Typography variant="body2" sx={{ color: '#6b7280', textAlign: 'center', py: 4 }}>
                            No edit history available for this question.
                        </Typography>
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {historyData.map((version: any, idx: number) => (
                                <Box
                                    key={version.id || idx}
                                    sx={{
                                        borderLeft: '3px solid',
                                        borderColor:
                                            version.change_type === 'approve' ? '#10b981'
                                                : version.change_type === 'reject' ? '#ef4444'
                                                    : version.change_type === 'created' ? '#3b82f6'
                                                        : '#020291',
                                        pl: 2,
                                        py: 1.5,
                                        backgroundColor: '#f9fafb',
                                        borderRadius: '0 8px 8px 0',
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                                        <Chip
                                            label={`v${version.version_number}`}
                                            size="small"
                                            sx={{ fontWeight: 700, fontSize: '0.7rem', height: 22, backgroundColor: '#e5e7eb' }}
                                        />
                                        <Chip
                                            label={version.change_type}
                                            size="small"
                                            sx={{
                                                fontWeight: 600,
                                                fontSize: '0.7rem',
                                                height: 22,
                                                backgroundColor:
                                                    version.change_type === 'approve' ? '#d1fae5'
                                                        : version.change_type === 'reject' ? '#fee2e2'
                                                            : version.change_type === 'created' ? '#dbeafe'
                                                                : '#fef3c7',
                                                color:
                                                    version.change_type === 'approve' ? '#065f46'
                                                        : version.change_type === 'reject' ? '#991b1b'
                                                            : version.change_type === 'created' ? '#1e40af'
                                                                : '#92400e',
                                            }}
                                        />
                                        {version.changer_name && (
                                            <Typography variant="caption" sx={{ color: '#6b7280' }}>
                                                by {version.changer_name}
                                            </Typography>
                                        )}
                                        {version.changed_at && (
                                            <Typography variant="caption" sx={{ color: '#9ca3af', ml: 'auto' }}>
                                                {new Date(version.changed_at).toLocaleString()}
                                            </Typography>
                                        )}
                                    </Box>
                                    {version.change_summary && (
                                        <Typography variant="body2" sx={{ color: '#374151', fontSize: '0.85rem' }}>
                                            {version.change_summary}
                                        </Typography>
                                    )}
                                </Box>
                            ))}
                        </Box>
                    )}
                </DialogContent>
            </Dialog>
        </Navigation>
    );
};

export default InterviewOutline;