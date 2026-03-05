import React from 'react';
import { Box, Typography, Avatar } from '@mui/material';
import { 
  useTracks, 
  ParticipantTile,
  TrackRefContext
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { MicOff } from '@mui/icons-material';

/**
 * Video tiles grid for displaying participants
 * Fits inside existing video container
 */
export const VideoTilesGrid: React.FC = () => {
  // Get all video tracks
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  if (tracks.length === 0) {
    return (
      <Box sx={{ 
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        color: 'rgba(255,255,255,0.7)'
      }}>
        <Box>
          <Typography sx={{ fontSize: '18px', mb: 1 }}>
            Waiting for participants to join...
          </Typography>
          <Typography sx={{ fontSize: '14px' }}>
            The meeting will start when someone joins
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      flexWrap: 'wrap',
      padding: '16px'
    }}>
      {tracks.map((track) => {
        const participantName = track.participant.name || track.participant.identity;
        const isAIAgent = participantName.toLowerCase().includes('agent') || 
                         participantName.toLowerCase().includes('ai');
        const isMuted = !track.participant.isMicrophoneEnabled;
        const isCameraOff = !track.participant.isCameraEnabled;
        
        return (
          <Box
            key={track.participant.identity}
            sx={{
              width: tracks.length === 1 
                ? 'min(800px, 90%)' 
                : tracks.length === 2 
                  ? 'calc(50% - 12px)' 
                  : 'calc(33.333% - 14px)',
              aspectRatio: '16/9',
              borderRadius: '12px',
              overflow: 'hidden',
              background: '#2d2d44',
              position: 'relative',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              transition: 'all 0.3s ease',
              minWidth: '280px',
              maxWidth: tracks.length === 1 ? '800px' : '500px'
            }}
          >
            {isCameraOff ? (
              // Show avatar when camera is off
              <Box sx={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #2d2d44 0%, #1a1a2e 100%)'
              }}>
                <Avatar sx={{
                  width: 120,
                  height: 120,
                  fontSize: '48px',
                  background: isAIAgent 
                    ? 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)'
                    : 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)',
                  fontWeight: 700
                }}>
                  {isAIAgent ? '🤖' : participantName.charAt(0).toUpperCase()}
                </Avatar>
              </Box>
            ) : (
              // Show video feed
              <TrackRefContext.Provider value={track}>
                <ParticipantTile />
              </TrackRefContext.Provider>
            )}
            
            {/* Name Label */}
            <Box sx={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(10px)',
              padding: '6px 12px',
              borderRadius: '8px',
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
                  animation: 'pulse 2s infinite',
                  '@keyframes pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.5 }
                  }
                }} />
              )}
              <Typography sx={{ 
                color: 'white', 
                fontSize: '13px',
                fontWeight: 600
              }}>
                {isAIAgent ? '🤖 AI Interviewer' : participantName}
              </Typography>
              {isMuted && (
                <MicOff sx={{ fontSize: 14, color: '#ef4444', ml: 0.5 }} />
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};
