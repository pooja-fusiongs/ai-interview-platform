import React, { useState, useEffect, useMemo } from 'react';
import { Box, Typography, IconButton, Button, Tooltip } from '@mui/material';
import {
  useTracks,
  VideoTrack,
  useLocalParticipant,
  useRemoteParticipants,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import {
  Videocam,
  VideocamOff,
  Mic,
  MicOff,
  CallEnd,
} from '@mui/icons-material';

/**
 * LiveKit-style AI Interview UI
 * - Center: Animated dots visualizer for the AI Agent
 * - Bottom: Control bar with Mic/Camera/End Call
 * - Status: "Agent is listening..." etc.
 */
export const VideoTilesGrid: React.FC<{ onEndCall?: () => void }> = ({ onEndCall }) => {
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
    ],
    { onlySubscribed: false }
  );

  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [agentStatus, setAgentStatus] = useState('Connecting to interview...');

  const agent = useMemo(() =>
    remoteParticipants.find(p =>
      p.identity.toLowerCase().includes('agent') ||
      p.name?.toLowerCase().includes('ai')
    ), [remoteParticipants]);

  useEffect(() => {
    if (agent) {
      if (agent.isSpeaking) {
        setAgentStatus('AI Interviewer is speaking...');
      } else {
        setAgentStatus('Interview in progress');
      }
    } else if (remoteParticipants.length > 0) {
      setAgentStatus('Waiting for AI Interviewer...');
    }
  }, [agent, agent?.isSpeaking, remoteParticipants]);

  const toggleMic = async () => {
    if (localParticipant) {
      try {
        const enabled = !localParticipant.isMicrophoneEnabled;
        await localParticipant.setMicrophoneEnabled(enabled);
        setIsMicOn(enabled);
      } catch (err: any) {
        console.error('❌ Failed to toggle microphone:', err);
        // Don't show toast for every toggle error as it can be spammy
      }
    }
  };

  const toggleCamera = async () => {
    if (localParticipant) {
      try {
        const enabled = !localParticipant.isCameraEnabled;
        await localParticipant.setCameraEnabled(enabled);
        setIsCamOn(enabled);
      } catch (err: any) {
        console.error('❌ Failed to toggle camera:', err);
        if (err.name === 'NotFoundError') {
          // Camera not found, keep it disabled
          setIsCamOn(false);
        }
      }
    }
  };

  const localCameraTrack = tracks.find(t => t.participant.isLocal && t.source === Track.Source.Camera);

  return (
    <Box sx={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: '#0a0a0b', borderRadius: '16px', overflow: 'hidden',
      position: 'relative', border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      {/* Central Visualizer Section */}
      <Box sx={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 4,
      }}>
        {/* Animated Dots Visualizer */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'baseline', height: '60px' }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Box
              key={i}
              sx={{
                width: '14px', height: '14px', borderRadius: '50%',
                background: agent?.isSpeaking ? '#8b5cf6' : 'white',
                opacity: 0.8,
                transition: 'all 0.2s ease-out',
                animation: agent?.isSpeaking
                  ? `pulse-speaking 0.6s infinite ease-in-out`
                  : `pulse-idle 2s infinite ease-in-out`,
                animationDelay: `${i * 0.15}s`,
                '@keyframes pulse-idle': {
                  '0%, 100%': { transform: 'scale(1)', opacity: 0.3 },
                  '50%': { transform: 'scale(1.1)', opacity: 0.5 },
                },
                '@keyframes pulse-speaking': {
                  '0%, 100%': { height: '14px', opacity: 0.8 },
                  '50%': { height: '40px', opacity: 1 },
                }
              }}
            />
          ))}
        </Box>

        <Typography sx={{
          color: 'rgba(255,255,255,0.7)', fontSize: '14px',
          fontWeight: 500, letterSpacing: '0.5px',
          transition: 'all 0.3s ease',
        }}>
          {agentStatus}
        </Typography>
      </Box>

      {/* Local Video Preview */}
      {isCamOn && localCameraTrack?.publication && (
        <Box sx={{
          position: 'absolute', top: 20, right: 20, width: '180px', height: '110px',
          borderRadius: '12px', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.2)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)', zIndex: 5
        }}>
          <VideoTrack
            trackRef={{
              participant: localCameraTrack.participant,
              source: localCameraTrack.source,
              publication: localCameraTrack.publication
            }}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </Box>
      )}

      {/* Bottom Control Bar */}
      <Box sx={{
        height: '80px', background: 'rgba(20, 20, 22, 0.95)', backdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', px: 3, position: 'relative'
      }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Tooltip title={isMicOn ? "Mute Mic" : "Unmute Mic"}>
            <IconButton onClick={toggleMic} sx={{
              bgcolor: isMicOn ? 'rgba(255,255,255,0.05)' : '#ef4444', color: 'white',
              transition: 'all 0.2s',
              '&:hover': { bgcolor: isMicOn ? 'rgba(255,255,255,0.1)' : '#dc2626' }
            }}>
              {isMicOn ? <Mic /> : <MicOff />}
            </IconButton>
          </Tooltip>

          <Tooltip title={isCamOn ? "Turn off Camera" : "Turn on Camera"}>
            <IconButton onClick={toggleCamera} sx={{
              bgcolor: isCamOn ? 'rgba(255,255,255,0.05)' : '#ef4444', color: 'white',
              transition: 'all 0.2s',
              '&:hover': { bgcolor: isCamOn ? 'rgba(255,255,255,0.1)' : '#dc2626' }
            }}>
              {isCamOn ? <Videocam /> : <VideocamOff />}
            </IconButton>
          </Tooltip>
        </Box>

        <Button
          variant="contained" color="error" startIcon={<CallEnd />} onClick={onEndCall}
          sx={{
            position: 'absolute', right: 24, borderRadius: '10px', textTransform: 'none',
            fontWeight: 600, px: 3, bgcolor: '#ef4444', transition: 'all 0.2s',
            '&:hover': { bgcolor: '#dc2626' }
          }}
        >
          End Call
        </Button>
      </Box>
    </Box>
  );
};
