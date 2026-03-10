import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Phone } from '@mui/icons-material';

interface Question {
  id: number;
  question_text: string;
  difficulty: string;
}

const VideoRoomNew: React.FC = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const [questions] = useState<Question[]>([
    { id: 1, question_text: "Tell me about yourself and your background.", difficulty: "easy" },
    { id: 2, question_text: "What are your greatest strengths and weaknesses?", difficulty: "medium" },
    { id: 3, question_text: "Describe a challenging project you worked on.", difficulty: "medium" },
    { id: 4, question_text: "How do you handle tight deadlines and pressure?", difficulty: "hard" },
    { id: 5, question_text: "Where do you see yourself in 5 years?", difficulty: "easy" },
    { id: 6, question_text: "Why do you want to work for our company?", difficulty: "medium" },
    { id: 7, question_text: "Describe a time you had a conflict with a team member.", difficulty: "hard" },
    { id: 8, question_text: "What motivates you in your work?", difficulty: "easy" },
  ]);

  useEffect(() => {
    // Initialize video call when component mounts
    if (videoContainerRef.current) {
      initializeVideo();
    }
  }, []);

  const initializeVideo = () => {
    if (!videoContainerRef.current) return;

    // Create iframe for Jitsi Meet with custom config to hide toolbar
    const roomName = `interview-room-${videoId}`;
    const iframe = document.createElement('iframe');
    // Add config to hide Jitsi's toolbar buttons
    iframe.src = `https://meet.jit.si/${roomName}#config.toolbarButtons=[]`;
    iframe.allow = 'camera; microphone; fullscreen; display-capture; autoplay';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = '0';
    
    videoContainerRef.current.innerHTML = '';
    videoContainerRef.current.appendChild(iframe);
  };

  const [interviewEnded, setInterviewEnded] = useState(false);

  const handleEndMeeting = async () => {
    if (window.confirm('Are you sure you want to end this interview?')) {
      try {
        // Call backend to mark interview as ended
        const token = localStorage.getItem('token');
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/video/interviews/${videoId}/end`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            max_participants: 2  // Indicate candidate completed interview
          })
        });

        if (response.ok) {
          // Show completion message instead of redirecting
          setInterviewEnded(true);
        } else {
          console.error('Failed to end interview');
          navigate('/video-interviews');
        }
      } catch (error) {
        console.error('Error ending interview:', error);
        navigate('/video-interviews');
      }
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', backgroundColor: '#0f172a' }}>
      {/* Interview Completed Overlay */}
      {interviewEnded && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            borderRadius: '16px',
            padding: '48px',
            maxWidth: '500px',
            textAlign: 'center',
            border: '1px solid #334155'
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              backgroundColor: 'rgba(34, 197, 94, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              border: '2px solid #22c55e'
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <h2 style={{ color: 'white', fontSize: '28px', fontWeight: 'bold', marginBottom: '16px' }}>
              Interview Completed!
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '16px', marginBottom: '32px', lineHeight: '1.6' }}>
              Thank you for completing the interview. Your responses have been recorded and will be reviewed by our team.
            </p>
            <button
              onClick={() => navigate('/video-interviews')}
              style={{
                backgroundColor: '#020291',
                color: 'white',
                padding: '12px 32px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#0101a0'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#020291'}
            >
              View My Interviews
            </button>
          </div>
        </div>
      )}
      
      {/* LEFT SIDE - Questions Panel (40% width) */}
      <div style={{ 
        width: '40%', 
        backgroundColor: '#1e293b', 
        borderRight: '1px solid #334155',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{ 
          padding: '24px', 
          borderBottom: '1px solid #334155',
          backgroundColor: '#1e293b'
        }}>
          <h1 style={{ 
            fontSize: '24px', 
            fontWeight: 'bold', 
            color: 'white', 
            marginBottom: '8px',
            margin: 0
          }}>
            Interview Questions
          </h1>
          <p style={{ 
            color: '#94a3b8', 
            fontSize: '14px',
            margin: 0
          }}>
            Review and prepare your responses
          </p>
        </div>

        {/* Scrollable Questions List */}
        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: '24px'
        }}>
          {questions.map((question, index) => (
            <div
              key={question.id}
              style={{
                backgroundColor: 'rgba(51, 65, 85, 0.5)',
                borderRadius: '12px',
                padding: '20px',
                border: '1px solid rgba(71, 85, 105, 0.5)',
                marginBottom: '16px',
                transition: 'all 0.2s'
              }}
            >
              {/* Question Number & Difficulty Badge */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                marginBottom: '12px' 
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(59, 130, 246, 0.2)',
                  color: '#60a5fa',
                  fontWeight: '600',
                  fontSize: '14px',
                  border: '1px solid rgba(59, 130, 246, 0.3)'
                }}>
                  {index + 1}
                </span>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  fontSize: '12px',
                  fontWeight: '500',
                  border: '1px solid',
                  ...(question.difficulty.toLowerCase() === 'easy' ? {
                    backgroundColor: 'rgba(34, 197, 94, 0.2)',
                    color: '#4ade80',
                    borderColor: 'rgba(34, 197, 94, 0.3)'
                  } : question.difficulty.toLowerCase() === 'medium' ? {
                    backgroundColor: 'rgba(234, 179, 8, 0.2)',
                    color: '#facc15',
                    borderColor: 'rgba(234, 179, 8, 0.3)'
                  } : {
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    color: '#f87171',
                    borderColor: 'rgba(239, 68, 68, 0.3)'
                  })
                }}>
                  {question.difficulty.toUpperCase()}
                </span>
              </div>

              {/* Question Text */}
              <p style={{ 
                color: '#e2e8f0', 
                fontSize: '16px', 
                lineHeight: '1.6',
                margin: 0
              }}>
                {question.question_text}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT SIDE - Video Panel (60% width) */}
      <div style={{ 
        width: '60%', 
        backgroundColor: '#0f172a',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Video Container */}
        <div style={{ 
          flex: 1, 
          position: 'relative',
          width: '100%',
          height: '100%'
        }}>
          <div
            ref={videoContainerRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: '#1e293b'
            }}
          />
          
          {/* Overlay for loading state */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(30, 41, 59, 0.5)',
            backdropFilter: 'blur(8px)',
            pointerEvents: 'none'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
              }}>
                <svg style={{ width: '32px', height: '32px', color: '#60a5fa' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <p style={{ color: '#94a3b8', fontSize: '14px' }}>Connecting to video call...</p>
            </div>
          </div>
        </div>

        {/* End Meeting Button - Floating Bottom Right */}
        <div style={{ 
          position: 'absolute', 
          bottom: '32px', 
          right: '32px', 
          zIndex: 10 
        }}>
          <button
            onClick={handleEndMeeting}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px 24px',
              backgroundColor: '#ef4444',
              color: 'white',
              fontWeight: '600',
              borderRadius: '9999px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 20px 25px -5px rgba(239, 68, 68, 0.5), 0 10px 10px -5px rgba(239, 68, 68, 0.4)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#dc2626';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#ef4444';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <Phone style={{ transform: 'rotate(135deg)' }} />
            <span>End Meeting</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoRoomNew;
