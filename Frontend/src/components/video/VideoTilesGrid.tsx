import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Box, Typography, IconButton, Tooltip, Menu, MenuItem, ListItemIcon, ListItemText, Switch } from '@mui/material';
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
  SmartToy,
  ScreenShare,
  StopScreenShare,
  Fullscreen,
  FullscreenExit,
  MoreVert,
  EmojiEmotions,
  PeopleAlt,
  Info,
  ContentCopy,
  BrandingWatermark,
  Close,
} from '@mui/icons-material';

interface FloatingReaction {
  id: number;
  emoji: string;
  x: number;
}

/**
 * Google Meet-style AI Interview UI
 */
export const VideoTilesGrid: React.FC<{ onEndCall?: () => void }> = ({ onEndCall }) => {
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Feature states
  const [showParticipants, setShowParticipants] = useState(false);
  const [showMeetingInfo, setShowMeetingInfo] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [moreMenuAnchor, setMoreMenuAnchor] = useState<null | HTMLElement>(null);
  const [mirrorSelfView, setMirrorSelfView] = useState(true);
  const reactionIdRef = useRef(0);

  // Self-view drag
  const [selfViewPos, setSelfViewPos] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  const agent = useMemo(() =>
    remoteParticipants.find(p =>
      p.identity.toLowerCase().includes('agent') ||
      p.name?.toLowerCase().includes('ai')
    ), [remoteParticipants]);

  const screenShareTrack = useMemo(() =>
    tracks.find(t => t.participant.isLocal && t.source === Track.Source.ScreenShare && t.publication),
    [tracks]
  );

  useEffect(() => { setIsScreenSharing(!!screenShareTrack); }, [screenShareTrack]);

  // Auto-hide controls after 4s
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleMouseMove = () => {
      setShowControls(true);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = setTimeout(() => setShowControls(false), 4000);
    };
    el.addEventListener('mousemove', handleMouseMove);
    return () => {
      el.removeEventListener('mousemove', handleMouseMove);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, []);

  // Keyboard shortcuts: Ctrl+D = mic, Ctrl+E = camera
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'd') { e.preventDefault(); toggleMic(); }
      else if (e.ctrlKey && e.key === 'e') { e.preventDefault(); toggleCamera(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  // Self-view drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const currentPos = selfViewPos || { x: rect.width - 12 - 200, y: rect.height - 96 - 140 };
    dragStartRef.current = { x: e.clientX, y: e.clientY, posX: currentPos.x, posY: currentPos.y };
    const handleMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      setSelfViewPos({
        x: Math.max(8, Math.min(rect.width - 208, dragStartRef.current.posX + (ev.clientX - dragStartRef.current.x))),
        y: Math.max(8, Math.min(rect.height - 148, dragStartRef.current.posY + (ev.clientY - dragStartRef.current.y))),
      });
    };
    const handleUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [selfViewPos]);

  const sendReaction = (emoji: string) => {
    const id = ++reactionIdRef.current;
    const x = 20 + Math.random() * 60;
    setFloatingReactions(prev => [...prev, { id, emoji, x }]);
    setShowEmojiPicker(false);
    setTimeout(() => { setFloatingReactions(prev => prev.filter(r => r.id !== id)); }, 2000);
  };

  const toggleMic = async () => {
    if (!localParticipant) return;
    try {
      const enabled = !localParticipant.isMicrophoneEnabled;
      await localParticipant.setMicrophoneEnabled(enabled);
      setIsMicOn(enabled);
    } catch (err: any) { console.error('Failed to toggle mic:', err); }
  };

  const toggleCamera = async () => {
    if (!localParticipant) return;
    try {
      const enabled = !localParticipant.isCameraEnabled;
      await localParticipant.setCameraEnabled(enabled);
      setIsCamOn(enabled);
    } catch (err: any) {
      console.error('Failed to toggle camera:', err);
      if (err.name === 'NotFoundError') setIsCamOn(false);
    }
  };

  const toggleScreenShare = async () => {
    if (!localParticipant) return;
    try {
      const enabled = !isScreenSharing;
      await localParticipant.setScreenShareEnabled(enabled);
      setIsScreenSharing(enabled);
    } catch (err: any) {
      console.error('Failed to toggle screen share:', err);
      setIsScreenSharing(false);
    }
  };

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) await containerRef.current.requestFullscreen();
      else await document.exitFullscreen();
    } catch (err) { console.error('Fullscreen error:', err); }
  }, []);

  useEffect(() => {
    const fn = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', fn);
    return () => document.removeEventListener('fullscreenchange', fn);
  }, []);

  const copyMeetingInfo = () => {
    const info = `AI Interview Room\nRoom: interview_${window.location.pathname.split('/').pop()}\nLink: ${window.location.href}`;
    navigator.clipboard.writeText(info).catch(() => {});
  };

  const localCameraTrack = tracks.find(t => t.participant.isLocal && t.source === Track.Source.Camera);
  const candidateName = localParticipant.name || localParticipant.identity || 'You';
  const candidateInitial = candidateName.charAt(0).toUpperCase();
  const agentName = 'AI Interviewer';
  const agentInitial = agentName.charAt(0).toUpperCase();
  const participantCount = 1 + remoteParticipants.length;
  const panelOpen = showParticipants || showMeetingInfo;

  const speakingRipple = agent?.isSpeaking ? {
    '@keyframes speakRipple': {
      '0%': { boxShadow: '0 0 0 0px rgba(96, 165, 250, 0.4)' },
      '50%': { boxShadow: '0 0 0 14px rgba(96, 165, 250, 0)' },
      '100%': { boxShadow: '0 0 0 0px rgba(96, 165, 250, 0)' },
    },
    animation: 'speakRipple 1.5s ease-out infinite',
  } : {};

  const ctrlBtn = (active: boolean, danger?: boolean) => ({
    width: 48, height: 48,
    bgcolor: danger ? '#ea4335' : active ? 'rgba(255,255,255,0.1)' : '#3c4043',
    color: 'white',
    transition: 'all 0.2s ease',
    '&:hover': {
      bgcolor: danger ? '#d33828' : active ? 'rgba(255,255,255,0.2)' : '#4a4d51',
      transform: 'scale(1.05)',
    },
  });

  const emojiList = ['👍', '❤️', '😂', '😮', '🎉', '👏', '🔥', '💯'];

  return (
    <Box ref={containerRef} sx={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: '#202124', overflow: 'hidden', position: 'relative', userSelect: 'none',
    }}>

      {/* Floating Emoji Reactions */}
      {floatingReactions.map(r => (
        <Box key={r.id} sx={{
          position: 'absolute', left: `${r.x}%`, bottom: 100, zIndex: 50,
          fontSize: '40px', pointerEvents: 'none',
          '@keyframes floatUp': {
            '0%': { opacity: 1, transform: 'translateY(0) scale(1)' },
            '70%': { opacity: 1, transform: 'translateY(-200px) scale(1.2)' },
            '100%': { opacity: 0, transform: 'translateY(-300px) scale(0.8)' },
          },
          animation: 'floatUp 2s ease-out forwards',
        }}>
          {r.emoji}
        </Box>
      ))}

      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ===== MAIN VIDEO AREA ===== */}
        <Box sx={{
          flex: 1, position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          m: '4px', borderRadius: '8px', overflow: 'hidden',
          background: screenShareTrack ? '#000' : agent ? '#3c3836' : '#292a2d',
          transition: 'all 0.3s ease',
        }}>
          {screenShareTrack ? (
            <>
              <VideoTrack
                trackRef={{ participant: screenShareTrack.participant, source: screenShareTrack.source, publication: screenShareTrack.publication! }}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
              <Box sx={{
                position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                background: '#202124', borderRadius: '24px', px: 2.5, py: 1,
                display: 'flex', alignItems: 'center', gap: 1.5,
                boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
                opacity: showControls ? 1 : 0, transition: 'opacity 0.3s',
              }}>
                <ScreenShare sx={{ color: '#34a853', fontSize: 20 }} />
                <Typography sx={{ color: '#e8eaed', fontSize: '14px' }}>You are presenting to everyone</Typography>
                <Typography onClick={toggleScreenShare} sx={{
                  color: '#8ab4f8', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
                  px: 1, py: 0.3, borderRadius: '4px', '&:hover': { bgcolor: 'rgba(138,180,248,0.1)' },
                }}>Stop presenting</Typography>
              </Box>
            </>
          ) : (
            <>
              {/* AI Agent avatar */}
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <Box sx={{
                  width: agent ? 100 : 80, height: agent ? 100 : 80, borderRadius: '50%',
                  background: agent ? '#e8710a' : 'rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.4s ease', ...speakingRipple,
                }}>
                  {agent ? (
                    <Typography sx={{ color: 'white', fontSize: 40, fontWeight: 400 }}>{agentInitial}</Typography>
                  ) : (
                    <SmartToy sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 40 }} />
                  )}
                </Box>
                {!agent && (
                  <Typography sx={{ color: '#9aa0a6', fontSize: '14px' }}>Waiting for AI Interviewer to join...</Typography>
                )}
              </Box>

              {/* Agent name bottom-left */}
              {agent && (
                <Box sx={{ position: 'absolute', bottom: 12, left: 14 }}>
                  <Typography sx={{ color: '#e8eaed', fontSize: '13px', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
                    {agentName}
                  </Typography>
                </Box>
              )}

              {/* Speaking equalizer bars */}
              {agent?.isSpeaking && (
                <Box sx={{ position: 'absolute', bottom: 12, right: 14, display: 'flex', gap: 0.5, alignItems: 'flex-end' }}>
                  {[0, 1, 2].map(i => (
                    <Box key={i} sx={{
                      width: 3, height: 14, borderRadius: '2px', bgcolor: '#8ab4f8',
                      '@keyframes eqBar': { '0%,100%': { transform: 'scaleY(0.3)' }, '50%': { transform: 'scaleY(1)' } },
                      animation: `eqBar 0.6s ease-in-out ${i * 0.15}s infinite`, transformOrigin: 'bottom',
                    }} />
                  ))}
                </Box>
              )}
            </>
          )}
        </Box>

        {/* ===== RIGHT PANELS ===== */}
        {showParticipants && (
          <Box sx={{
            width: 280, background: '#292a2d', borderLeft: '1px solid #3c4043',
            display: 'flex', flexDirection: 'column',
            animation: 'slideIn 0.2s ease-out',
            '@keyframes slideIn': { '0%': { opacity: 0, transform: 'translateX(20px)' }, '100%': { opacity: 1, transform: 'translateX(0)' } },
          }}>
            <Box sx={{ p: 2, borderBottom: '1px solid #3c4043', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography sx={{ color: '#e8eaed', fontSize: '16px', fontWeight: 500 }}>People ({participantCount})</Typography>
              <IconButton onClick={() => setShowParticipants(false)} sx={{ color: '#9aa0a6', width: 32, height: 32 }}>
                <Close sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>
            <Box sx={{ flex: 1, overflowY: 'auto', p: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: '8px', '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' } }}>
                <Box sx={{ width: 32, height: 32, borderRadius: '50%', background: '#673ab7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography sx={{ color: 'white', fontSize: 14 }}>{candidateInitial}</Typography>
                </Box>
                <Typography sx={{ color: '#e8eaed', fontSize: '13px', flex: 1 }}>{candidateName} (You)</Typography>
                {!isMicOn && <MicOff sx={{ color: '#ea4335', fontSize: 16 }} />}
                {!isCamOn && <VideocamOff sx={{ color: '#ea4335', fontSize: 16 }} />}
              </Box>
              {remoteParticipants.map(p => (
                <Box key={p.identity} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: '8px', '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' } }}>
                  <Box sx={{ width: 32, height: 32, borderRadius: '50%', background: '#e8710a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography sx={{ color: 'white', fontSize: 14 }}>{(p.name || p.identity || '?').charAt(0).toUpperCase()}</Typography>
                  </Box>
                  <Typography sx={{ color: '#e8eaed', fontSize: '13px', flex: 1 }}>{p.name || p.identity}</Typography>
                  {p.isSpeaking && (
                    <Box sx={{ display: 'flex', gap: 0.3, alignItems: 'flex-end' }}>
                      {[0, 1, 2].map(i => (
                        <Box key={i} sx={{
                          width: 2, height: 10, borderRadius: '1px', bgcolor: '#8ab4f8',
                          '@keyframes eqS': { '0%,100%': { transform: 'scaleY(0.3)' }, '50%': { transform: 'scaleY(1)' } },
                          animation: `eqS 0.5s ease-in-out ${i * 0.12}s infinite`, transformOrigin: 'bottom',
                        }} />
                      ))}
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {showMeetingInfo && (
          <Box sx={{
            width: 300, background: '#292a2d', borderLeft: '1px solid #3c4043',
            display: 'flex', flexDirection: 'column',
            animation: 'slideIn 0.2s ease-out',
            '@keyframes slideIn': { '0%': { opacity: 0, transform: 'translateX(20px)' }, '100%': { opacity: 1, transform: 'translateX(0)' } },
          }}>
            <Box sx={{ p: 2, borderBottom: '1px solid #3c4043', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography sx={{ color: '#e8eaed', fontSize: '16px', fontWeight: 500 }}>Meeting details</Typography>
              <IconButton onClick={() => setShowMeetingInfo(false)} sx={{ color: '#9aa0a6', width: 32, height: 32 }}>
                <Close sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>
            <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Box>
                <Typography sx={{ color: '#9aa0a6', fontSize: '12px', mb: 0.5 }}>Meeting</Typography>
                <Typography sx={{ color: '#e8eaed', fontSize: '14px', fontWeight: 500 }}>AI Interview Session</Typography>
              </Box>
              <Box>
                <Typography sx={{ color: '#9aa0a6', fontSize: '12px', mb: 0.5 }}>Room</Typography>
                <Typography sx={{ color: '#e8eaed', fontSize: '14px' }}>interview_{window.location.pathname.split('/').pop()}</Typography>
              </Box>
              <Box>
                <Typography sx={{ color: '#9aa0a6', fontSize: '12px', mb: 0.5 }}>Joining link</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ color: '#8ab4f8', fontSize: '13px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {window.location.href}
                  </Typography>
                  <Tooltip title="Copy link">
                    <IconButton onClick={copyMeetingInfo} sx={{ color: '#8ab4f8', width: 28, height: 28 }}>
                      <ContentCopy sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
              <Box>
                <Typography sx={{ color: '#9aa0a6', fontSize: '12px', mb: 0.5 }}>Participants</Typography>
                <Typography sx={{ color: '#e8eaed', fontSize: '14px' }}>{participantCount} in call</Typography>
              </Box>
              <Box>
                <Typography sx={{ color: '#9aa0a6', fontSize: '12px', mb: 0.5 }}>Your devices</Typography>
                <Typography sx={{ color: '#e8eaed', fontSize: '13px' }}>
                  Mic: {isMicOn ? 'On' : 'Off'} &nbsp;|&nbsp; Camera: {isCamOn ? 'On' : 'Off'}
                </Typography>
              </Box>
            </Box>
          </Box>
        )}
      </Box>

      {/* ===== SELF-VIEW (Draggable) ===== */}
      <Box
        onMouseDown={handleDragStart}
        sx={{
          position: 'absolute',
          ...(selfViewPos ? { left: selfViewPos.x, top: selfViewPos.y } : { bottom: 96, right: panelOpen ? 292 : 12 }),
          width: 200, height: 140, borderRadius: '8px', overflow: 'hidden',
          boxShadow: '0 1px 6px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.08)',
          zIndex: 10, cursor: 'grab', transition: selfViewPos ? 'none' : 'right 0.3s ease',
          '&:hover': { boxShadow: '0 4px 16px rgba(0,0,0,0.7)' },
          '&:active': { cursor: 'grabbing' },
        }}
      >
        {isCamOn && localCameraTrack?.publication ? (
          <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
            <VideoTrack
              trackRef={{ participant: localCameraTrack.participant, source: localCameraTrack.source, publication: localCameraTrack.publication }}
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: mirrorSelfView ? 'scaleX(-1)' : 'none' }}
            />
            <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.6))', padding: '16px 10px 6px' }}>
              <Typography sx={{ color: 'white', fontSize: '12px' }}>{candidateName}</Typography>
            </Box>
          </Box>
        ) : (
          <Box sx={{ width: '100%', height: '100%', background: '#3c4043', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Box sx={{ width: 56, height: 56, borderRadius: '50%', background: '#673ab7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography sx={{ color: 'white', fontSize: 24 }}>{candidateInitial}</Typography>
            </Box>
            <Typography sx={{ color: '#e8eaed', fontSize: '12px', mt: 0.8 }}>{candidateName}</Typography>
          </Box>
        )}
        {!isMicOn && (
          <Box sx={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: '50%', background: '#ea4335', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MicOff sx={{ color: 'white', fontSize: 14 }} />
          </Box>
        )}
      </Box>

      {/* Emoji Picker Popup */}
      {showEmojiPicker && (
        <Box sx={{
          position: 'absolute', bottom: 90, left: '50%', transform: 'translateX(-50%)',
          background: '#292a2d', borderRadius: '24px', px: 1.5, py: 1,
          display: 'flex', gap: 0.5, boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          border: '1px solid #3c4043', zIndex: 30,
          animation: 'popUp 0.15s ease-out',
          '@keyframes popUp': { '0%': { opacity: 0, transform: 'translateX(-50%) scale(0.9)' }, '100%': { opacity: 1, transform: 'translateX(-50%) scale(1)' } },
        }}>
          {emojiList.map(emoji => (
            <Box key={emoji} onClick={() => sendReaction(emoji)} sx={{
              width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '24px', cursor: 'pointer', transition: 'all 0.15s',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', transform: 'scale(1.2)' },
            }}>
              {emoji}
            </Box>
          ))}
        </Box>
      )}

      {/* ===== BOTTOM CONTROL BAR ===== */}
      <Box sx={{
        height: '72px', background: '#202124',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        px: { xs: 1, sm: 2, md: 3 },
        opacity: showControls ? 1 : 0, transition: 'opacity 0.3s ease',
        position: 'relative', zIndex: 15,
      }}>
        {/* Center: All controls in one row */}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Tooltip title={`${isMicOn ? 'Turn off' : 'Turn on'} microphone (Ctrl+D)`} arrow>
            <IconButton onClick={toggleMic} sx={ctrlBtn(isMicOn)}>
              {isMicOn ? <Mic /> : <MicOff />}
            </IconButton>
          </Tooltip>

          <Tooltip title={`${isCamOn ? 'Turn off' : 'Turn on'} camera (Ctrl+E)`} arrow>
            <IconButton onClick={toggleCamera} sx={ctrlBtn(isCamOn)}>
              {isCamOn ? <Videocam /> : <VideocamOff />}
            </IconButton>
          </Tooltip>

          <Tooltip title={isScreenSharing ? 'Stop presenting' : 'Present now'} arrow>
            <IconButton onClick={toggleScreenShare} sx={{
              ...ctrlBtn(!isScreenSharing),
              bgcolor: isScreenSharing ? '#34a853' : 'rgba(255,255,255,0.1)',
              '&:hover': { bgcolor: isScreenSharing ? '#2d9249' : 'rgba(255,255,255,0.2)', transform: 'scale(1.05)' },
            }}>
              {isScreenSharing ? <StopScreenShare /> : <ScreenShare />}
            </IconButton>
          </Tooltip>

          <Tooltip title="Send a reaction" arrow>
            <IconButton onClick={() => setShowEmojiPicker(!showEmojiPicker)} sx={{
              ...ctrlBtn(true),
              bgcolor: showEmojiPicker ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
            }}>
              <EmojiEmotions />
            </IconButton>
          </Tooltip>

          {/* Separator */}
          <Box sx={{ width: 1, height: 28, bgcolor: '#5f6368', mx: 0.5 }} />

          <Tooltip title="Leave call" arrow>
            <IconButton onClick={onEndCall} sx={{
              ...ctrlBtn(false, true),
              borderRadius: '24px', width: 56, px: 2,
            }}>
              <CallEnd />
            </IconButton>
          </Tooltip>

          {/* Separator */}
          <Box sx={{ width: 1, height: 28, bgcolor: '#5f6368', mx: 0.5 }} />

          <Tooltip title="Meeting details" arrow>
            <IconButton onClick={() => { setShowMeetingInfo(!showMeetingInfo); if (!showMeetingInfo) setShowParticipants(false); }} sx={{
              color: showMeetingInfo ? '#8ab4f8' : '#e8eaed', width: 40, height: 40,
              '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
            }}>
              <Info sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title={`People (${participantCount})`} arrow>
            <IconButton onClick={() => { setShowParticipants(!showParticipants); if (!showParticipants) setShowMeetingInfo(false); }} sx={{
              color: showParticipants ? '#8ab4f8' : '#e8eaed', width: 40, height: 40,
              '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
            }}>
              <PeopleAlt sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title={isFullscreen ? 'Exit full screen' : 'Full screen'} arrow>
            <IconButton onClick={toggleFullscreen} sx={{
              color: '#e8eaed', width: 40, height: 40,
              '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
            }}>
              {isFullscreen ? <FullscreenExit sx={{ fontSize: 20 }} /> : <Fullscreen sx={{ fontSize: 20 }} />}
            </IconButton>
          </Tooltip>

          <Tooltip title="More options" arrow>
            <IconButton onClick={(e) => setMoreMenuAnchor(e.currentTarget)} sx={{
              color: '#e8eaed', width: 40, height: 40,
              '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
            }}>
              <MoreVert sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>

          {/* More Options Menu */}
          <Menu
            anchorEl={moreMenuAnchor}
            open={Boolean(moreMenuAnchor)}
            onClose={() => setMoreMenuAnchor(null)}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            PaperProps={{
              sx: {
                bgcolor: '#292a2d', color: '#e8eaed', borderRadius: '8px',
                border: '1px solid #3c4043', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', minWidth: 240,
              },
            }}
          >
            <MenuItem onClick={() => { setMirrorSelfView(!mirrorSelfView); setMoreMenuAnchor(null); }}
              sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' }, py: 1.2 }}>
              <ListItemIcon><BrandingWatermark sx={{ color: '#e8eaed', fontSize: 20 }} /></ListItemIcon>
              <ListItemText><Typography sx={{ fontSize: '14px' }}>Mirror self-view</Typography></ListItemText>
              <Switch size="small" checked={mirrorSelfView} sx={{
                '& .MuiSwitch-switchBase.Mui-checked': { color: '#8ab4f8' },
                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#8ab4f8' },
              }} />
            </MenuItem>
            <MenuItem onClick={() => { toggleFullscreen(); setMoreMenuAnchor(null); }}
              sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' }, py: 1.2 }}>
              <ListItemIcon>{isFullscreen ? <FullscreenExit sx={{ color: '#e8eaed', fontSize: 20 }} /> : <Fullscreen sx={{ color: '#e8eaed', fontSize: 20 }} />}</ListItemIcon>
              <ListItemText><Typography sx={{ fontSize: '14px' }}>{isFullscreen ? 'Exit full screen' : 'Full screen'}</Typography></ListItemText>
            </MenuItem>
            <MenuItem onClick={() => { copyMeetingInfo(); setMoreMenuAnchor(null); }}
              sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' }, py: 1.2 }}>
              <ListItemIcon><ContentCopy sx={{ color: '#e8eaed', fontSize: 20 }} /></ListItemIcon>
              <ListItemText><Typography sx={{ fontSize: '14px' }}>Copy meeting info</Typography></ListItemText>
            </MenuItem>
          </Menu>
        </Box>
      </Box>
    </Box>
  );
};
