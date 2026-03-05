import React from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import { 
  useTracks, 
  ParticipantTile,
  TrackRefContext,
  useLocalParticipant
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Mic, MicOff, Videocam, VideocamOff, CallEnd, ScreenShare } from '@mui/icons-material';

interface GoogleMeetStyleRoomProps {
  onEndCall: () => void;
  roomName: string;
  duration: string;
}

/**
 * Complete Google Meet-style video room
 * Full viewport, dark theme, professional layout
 */
export const GoogleMeetStyleRoom: React.FC<GoogleMeetStyleRoomProps> = ({ 
  onEndCall, 
  roomName,
  duration 
}) => {
  const { localParticipant } = useLocalParticipant();
  
  // Get all video tracks
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const [isMicOn, setIsMicOn] = React.useState(true);
  const [isCameraOn, setIsCameraOn] = React.useState(true);

  const toggleMic = async () => {
    if (localParticipant) {
      await localParticipant.setMicrophoneEnabled(!isMicOn);
      setIsMicOn(!isMicOn);
    }
  };

  const toggleCamera = async () => {
    if (localParticipant) {
      await localParticipant.setCameraEnabled(!isCameraOn);
      setIsCameraOn(!isCameraOn);
    }
  };

  const toggleScreenShare = async () => {
    if (localParticipant) {
      await localParticipant.setScreenShareEnabled(!localParticipant.isScreenShareEnabled);
    }
  };

  return (
    <Box sx={{ 
      height: '100vh',
      width: '100vw',
      display: 'flex',
      flexDirection: 'column',
      background: '#1a1a2e',
      position: 'fixed',
      top: 0,
      left: 0,
      overflow: 'hidden'
    }}>
      {/* Top Bar */}
      <Box sx={{
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        background: 'rgba(26, 26, 46, 0.95)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        zIndex: 10
      }}>
        <Typography sx={{ 
          color: 'white', 
          fontSize: '18px', 
          fontWeight: 600 
        }}>
          {roomName}
        </Typography>
        <Box sx={{
          background: 'rgba(255,255,255,0.1)',
          padding: '8px 16px',
          borderRadius: '20px',
          color: 'white',
          fontSize: '14px',
          fontFamily: 'monospace',
          fontWeight: 600
        }}>
          {duration}
        </Box>
      </Box>

      {/* Main Video Area */}
      <Box sx={{ 
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        gap: '16px',
        flexWrap: 'wrap',
        overflow: 'auto'
      }}>
        {tracks.length === 0 ? (
          <Box sx={{ 
            textAlign: 'center',
            color: 'rgba(255,255,255,0.7)'
          }}>
            <Typography sx={{ fontSize: '18px', mb: 1 }}>
              Waiting for participants to join...
            </Typography>
            <Typography sx={{ fontSize: '14px' }}>
              The meeting will start when someone joins
            </Typography>
          </Box>
        ) : (
          tracks.map((track) => {
            const participantName = track.participant.name || track.participant.identity;
            const isAIAgent = participantName.toLowerCase().includes('agent') || 
                             participantName.toLowerCase().includes('ai');
            
            return (
              <Box
                key={track.participant.identity}
                sx={{
                  width: tracks.length === 1 
                    ? 'min(1200px, 90%)' 
                    : tracks.length === 2 
                      ? 'calc(50% - 12px)' 
                      : 'calc(33.333% - 14px)',
                  aspectRatio: '16/9',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  background: '#2d2d44',
                  position: 'relative',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    transform: 'scale(1.02)',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.5)'
                  }
                }}
              >
                <TrackRefContext.Provider value={track}>
                  <ParticipantTile />
                </TrackRefContext.Provider>
                
                {/* Name Label */}
                <Box sx={{
                  position: 'absolute',
                  bottom: 12,
                  left: 12,
                  background: 'rgba(0,0,0,0.7)',
                  backdropFilter: 'blur(10px)',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1
                }}>
                  {isAIAgent && (
                    <Box sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#10b981',
                      animation: 'pulse 2s infinite'
                    }} />
                  )}
                  <Typography sx={{ 
                    color: 'white', 
                    fontSize: '13px',
                    fontWeight: 600
                  }}>
                    {isAIAgent ? '🤖 AI Interviewer' : participantName}
                  </Typography>
                </Box>
              </Box>
            );
          })
        )}
      </Box>

      {/* Bottom Control Bar */}
      <Box sx={{
        height: '100px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(26, 26, 46, 0.95)',
        borderTop: '1px solid rgba(255,255,255,0.1)'
      }}>
        <Box sx={{
          background: 'rgba(45, 45, 68, 0.95)',
          borderRadius: '50px',
          padding: '12px 24px',
          display: 'flex',
          gap: 2,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          {/* Microphone */}
          <IconButton
            onClick={toggleMic}
            sx={{
              width: 56,
              height: 56,
              background: isMicOn ? 'rgba(255,255,255,0.1)' : '#ef4444',
              color: 'white',
              '&:hover': {
                background: isMicOn ? 'rgba(255,255,255,0.2)' : '#dc2626'
              }
            }}
          >
            {isMicOn ? <Mic /> : <MicOff />}
          </IconButton>

          {/* Camera */}
          <IconButton
            onClick={toggleCamera}
            sx={{
              width: 56,
              height: 56,
              background: isCameraOn ? 'rgba(255,255,255,0.1)' : '#ef4444',
              color: 'white',
              '&:hover': {
                background: isCameraOn ? 'rgba(255,255,255,0.2)' : '#dc2626'
              }
            }}
          >
            {isCameraOn ? <Videocam /> : <VideocamOff />}
          </IconButton>

          {/* Screen Share */}
          <IconButton
            onClick={toggleScreenShare}
            sx={{
              width: 56,
              height: 56,
              background: 'rgba(255,255,255,0.1)',
              color: 'white',
              '&:hover': {
                background: 'rgba(255,255,255,0.2)'
              }
            }}
          >
            <ScreenShare />
          </IconButton>

          {/* End Call */}
          <IconButton
            onClick={onEndCall}
            sx={{
              width: 56,
              height: 56,
              background: '#ef4444',
              color: 'white',
              '&:hover': {
                background: '#dc2626'
              }
            }}
          >
            <CallEnd />
          </IconButton>
        </Box>
      </Box>

      {/* Pulse animation for AI indicator */}
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}
      </style>
    </Box>
  );
};
