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
  ExitToApp,
  Person,
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

// Generate a consistent avatar color from a name/identity string
// Same name always produces the same color, regardless of local/remote
const AVATAR_COLORS = [
  '#673ab7', // purple
  '#e8710a', // orange
  '#0097a7', // teal
  '#d32f2f', // red
  '#1976d2', // blue
  '#388e3c', // green
  '#7b1fa2', // deep purple
  '#f57c00', // deep orange
  '#00796b', // dark teal
  '#c2185b', // pink
];

const getAvatarColor = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

/**
 * Google Meet-style AI Interview UI
 */
interface CaptionEntry {
  speaker: string;
  text: string;
  is_final?: boolean;
}

export const VideoTilesGrid: React.FC<{
  onEndCall?: () => void;
  onExitCall?: () => void;
  captionEntries?: CaptionEntry[];
}> = ({ onEndCall, onExitCall, captionEntries = [] }) => {
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

  // Sync isCamOn/isMicOn with actual LiveKit participant state
  useEffect(() => {
    if (localParticipant) {
      setIsCamOn(localParticipant.isCameraEnabled);
      setIsMicOn(localParticipant.isMicrophoneEnabled);
    }
  }, [localParticipant, localParticipant?.isCameraEnabled, localParticipant?.isMicrophoneEnabled]);
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

  // Find the remote participant (recruiter or candidate depending on who's viewing)
  const remoteParticipant = remoteParticipants[0] || null;

  // Find remote participant's camera track
  // Primary: from useTracks; Fallback: from participant's track publications directly
  const lastLogRef = useRef(0);
  const remoteCameraTrack = useMemo(() => {
    // Primary: find from useTracks results — require publication.track to exist AND not muted
    // When camera is turned off, track still exists but is muted → show avatar, not black frame
    const found = tracks.find(t =>
      !t.participant.isLocal &&
      t.source === Track.Source.Camera &&
      t.publication?.track &&
      !t.publication.isMuted
    );
    if (found) {
      console.log('[VideoTilesGrid] Remote camera track found:', {
        participant: found.participant.identity,
        hasTrack: !!found.publication?.track,
        isSubscribed: found.publication?.isSubscribed,
        isMuted: found.publication?.isMuted,
      });
      return found;
    }

    // Fallback: check remote participant's track publications directly
    // This handles cases where useTracks returns only placeholders
    if (remoteParticipant) {
      const cameraPub = remoteParticipant.getTrackPublication(Track.Source.Camera);
      if (cameraPub && cameraPub.track && !cameraPub.isMuted) {
        console.log('[VideoTilesGrid] Remote camera found via participant fallback:', {
          identity: remoteParticipant.identity,
          isSubscribed: cameraPub.isSubscribed,
        });
        return {
          participant: remoteParticipant,
          source: Track.Source.Camera,
          publication: cameraPub,
        };
      }
    }

    // Throttled logging to avoid console spam (log at most once per 5 seconds)
    const now = Date.now();
    if (now - lastLogRef.current > 5000) {
      lastLogRef.current = now;
      console.log('[VideoTilesGrid] No remote camera track. All tracks:', tracks.map(t => ({
        identity: t.participant.identity,
        isLocal: t.participant.isLocal,
        source: t.source,
        hasPub: !!t.publication,
        hasTrack: !!t.publication?.track,
        isMuted: t.publication?.isMuted,
      })));
    }
    return undefined;
  }, [tracks, remoteParticipant]);

  // Auto-subscribe to remote camera track if unsubscribed
  // Also re-subscribe if subscribed but track not yet attached (e.g. OBS virtual camera, slow networks)
  useEffect(() => {
    if (!remoteParticipant) return;
    const cameraPub = remoteParticipant.getTrackPublication(Track.Source.Camera);
    if (!cameraPub) return;

    if (!cameraPub.isSubscribed) {
      console.log('[VideoTilesGrid] Auto-subscribing to remote camera track');
      cameraPub.setSubscribed(true);
    } else if (!cameraPub.track) {
      // Track is subscribed but media hasn't arrived — toggle subscription to retry
      console.log('[VideoTilesGrid] Track subscribed but no media — re-subscribing');
      cameraPub.setSubscribed(false);
      setTimeout(() => cameraPub.setSubscribed(true), 500);
    }
  }, [remoteParticipant, tracks]);

  // Detect ANY active screen share (local or remote)
  const screenShareTrackRaw = useMemo(() =>
    tracks.find(t =>
      t.source === Track.Source.ScreenShare &&
      t.publication &&
      t.publication.track
    ),
    [tracks]
  );

  // Track screen share ended state (track might exist but be ended)
  const [screenShareEnded, setScreenShareEnded] = useState(false);
  useEffect(() => {
    if (!screenShareTrackRaw?.publication?.track) {
      setScreenShareEnded(false);
      return;
    }
    const mediaTrack = screenShareTrackRaw.publication.track.mediaStreamTrack;
    if (!mediaTrack || mediaTrack.readyState === 'ended') {
      setScreenShareEnded(true);
      return;
    }
    setScreenShareEnded(false);
    const handleEnded = () => setScreenShareEnded(true);
    mediaTrack.addEventListener('ended', handleEnded);
    return () => mediaTrack.removeEventListener('ended', handleEnded);
  }, [screenShareTrackRaw]);

  const screenShareTrack = screenShareEnded ? undefined : screenShareTrackRaw;
  const isLocalScreenShare = screenShareTrack?.participant.isLocal ?? false;

  useEffect(() => { setIsScreenSharing(isLocalScreenShare); }, [isLocalScreenShare]);

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
    const info = `Interview Room\nRoom: interview_${window.location.pathname.split('/').pop()}\nLink: ${window.location.href}`;
    navigator.clipboard.writeText(info).catch(() => {});
  };

  const localCameraTrack = tracks.find(t => t.participant.isLocal && t.source === Track.Source.Camera);
  const localName = localParticipant.name || localParticipant.identity || 'You';
  const localInitial = localName.charAt(0).toUpperCase();
  const localAvatarColor = getAvatarColor(localName);
  const remoteName = remoteParticipant?.name || remoteParticipant?.identity || 'Participant';
  const remoteInitial = remoteName.charAt(0).toUpperCase();
  // Ensure remote gets a different color than local (collision resolution for similar names)
  const rawRemoteColor = getAvatarColor(remoteName);
  const remoteAvatarColor = rawRemoteColor === localAvatarColor
    ? AVATAR_COLORS[(AVATAR_COLORS.indexOf(rawRemoteColor) + 1) % AVATAR_COLORS.length]
    : rawRemoteColor;
  const participantCount = 1 + remoteParticipants.length;
  const panelOpen = showParticipants || showMeetingInfo;

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
          background: screenShareTrack ? '#000' : '#292a2d',
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
                <Typography sx={{ color: '#e8eaed', fontSize: '14px' }}>
                  {isLocalScreenShare ? 'You are presenting to everyone' : `${screenShareTrack?.participant.name || 'Participant'} is presenting`}
                </Typography>
                {isLocalScreenShare && (
                  <Typography onClick={toggleScreenShare} sx={{
                    color: '#8ab4f8', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
                    px: 1, py: 0.3, borderRadius: '4px', '&:hover': { bgcolor: 'rgba(138,180,248,0.1)' },
                  }}>Stop presenting</Typography>
                )}
              </Box>
            </>
          ) : remoteCameraTrack ? (
            <>
              {/* Remote participant's video (main view) */}
              <VideoTrack
                trackRef={{ participant: remoteCameraTrack.participant, source: remoteCameraTrack.source, publication: remoteCameraTrack.publication! }}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              {/* Remote name bottom-left */}
              <Box sx={{ position: 'absolute', bottom: 12, left: 14 }}>
                <Typography sx={{ color: '#e8eaed', fontSize: '13px', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
                  {remoteName}
                </Typography>
              </Box>
              {/* Speaking indicator */}
              {remoteParticipant?.isSpeaking && (
                <Box sx={{
                  position: 'absolute', bottom: 12, right: 14, display: 'flex', gap: 0.5, alignItems: 'flex-end'
                }}>
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
          ) : !remoteParticipant && localParticipant?.isCameraEnabled && localCameraTrack?.publication ? (
            <>
              {/* Alone in room with camera on — show own video in main area */}
              <VideoTrack
                trackRef={{ participant: localCameraTrack.participant, source: localCameraTrack.source, publication: localCameraTrack.publication }}
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: mirrorSelfView ? 'scaleX(-1)' : 'none' }}
              />
              <Box sx={{ position: 'absolute', bottom: 12, left: 14 }}>
                <Typography sx={{ color: '#e8eaed', fontSize: '13px', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
                  {localName} (You)
                </Typography>
              </Box>
            </>
          ) : (
            <>
              {/* Camera off or waiting — show avatar */}
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                {remoteParticipant ? (
                  /* Remote participant joined but camera off — show avatar */
                  <Box sx={{
                    width: 100, height: 100, borderRadius: '50%',
                    background: remoteAvatarColor,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Typography sx={{ color: 'white', fontSize: 40, fontWeight: 400 }}>{remoteInitial}</Typography>
                  </Box>
                ) : (
                  /* No remote participant, camera off — show local avatar */
                  <Box sx={{
                    width: 120, height: 120, borderRadius: '50%',
                    background: localAvatarColor,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Typography sx={{ color: 'white', fontSize: 52, fontWeight: 400 }}>{localInitial}</Typography>
                  </Box>
                )}
              </Box>
              {/* Name bottom-left */}
              <Box sx={{ position: 'absolute', bottom: 12, left: 14 }}>
                <Typography sx={{ color: '#e8eaed', fontSize: '13px', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
                  {remoteParticipant ? remoteName : localName}
                </Typography>
              </Box>
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
                <Box sx={{ width: 32, height: 32, borderRadius: '50%', background: localAvatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography sx={{ color: 'white', fontSize: 14 }}>{localInitial}</Typography>
                </Box>
                <Typography sx={{ color: '#e8eaed', fontSize: '13px', flex: 1 }}>{localName} (You)</Typography>
                {!isMicOn && <MicOff sx={{ color: '#ea4335', fontSize: 16 }} />}
                {!isCamOn && <VideocamOff sx={{ color: '#ea4335', fontSize: 16 }} />}
              </Box>
              {remoteParticipants.map(p => (
                <Box key={p.identity} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: '8px', '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' } }}>
                  <Box sx={{ width: 32, height: 32, borderRadius: '50%', background: (() => { const c = getAvatarColor(p.name || p.identity || '?'); return c === localAvatarColor ? AVATAR_COLORS[(AVATAR_COLORS.indexOf(c) + 1) % AVATAR_COLORS.length] : c; })(), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                <Typography sx={{ color: '#e8eaed', fontSize: '14px', fontWeight: 500 }}>Interview Session</Typography>
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

      {/* ===== SELF-VIEW (Draggable) — only show when remote participant exists ===== */}
      {remoteParticipant && <Box
        onMouseDown={handleDragStart}
        sx={{
          position: 'absolute',
          ...(selfViewPos ? { left: selfViewPos.x, top: selfViewPos.y } : { bottom: { xs: 68, md: 96 }, right: panelOpen ? 292 : 12 }),
          width: { xs: 120, md: 200 }, height: { xs: 90, md: 140 }, borderRadius: '8px', overflow: 'hidden',
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
              <Typography sx={{ color: 'white', fontSize: '12px' }}>{localName}</Typography>
            </Box>
          </Box>
        ) : (
          <Box sx={{ width: '100%', height: '100%', background: '#3c4043', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Box sx={{ width: 56, height: 56, borderRadius: '50%', background: localAvatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography sx={{ color: 'white', fontSize: 24 }}>{localInitial}</Typography>
            </Box>
            <Typography sx={{ color: '#e8eaed', fontSize: '12px', mt: 0.8 }}>{localName}</Typography>
          </Box>
        )}
        {!isMicOn && (
          <Box sx={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: '50%', background: '#ea4335', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MicOff sx={{ color: 'white', fontSize: 14 }} />
          </Box>
        )}
      </Box>}

      {/* Emoji Picker Popup */}
      {showEmojiPicker && (
        <Box sx={{
          position: 'absolute', bottom: { xs: 68, md: 90 }, left: '50%', transform: 'translateX(-50%)',
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

      {/* ===== LIVE CAPTIONS OVERLAY ===== */}
      {captionEntries.length > 0 && (
        <Box sx={{
          position: 'absolute',
          bottom: { xs: '68px', md: '80px' },
          left: 0,
          right: 0,
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pointerEvents: 'none',
          px: 2,
        }}>
          {captionEntries.slice(-3).map((entry, i) => (
            <Box key={`${entry.speaker}-${i}`} sx={{
              background: 'rgba(0,0,0,0.8)',
              borderRadius: '6px',
              px: 1.5, py: 0.6,
              mb: 0.4,
              maxWidth: '85%',
              textAlign: 'center',
            }}>
              <Typography component="span" sx={{
                fontSize: '11px',
                fontWeight: 700,
                color: entry.speaker === 'recruiter' ? '#60a5fa' : '#c084fc',
                textTransform: 'capitalize',
                mr: 0.8,
              }}>
                {entry.speaker}:
              </Typography>
              <Typography component="span" sx={{
                fontSize: '13px',
                color: '#fff',
                fontWeight: (entry as any).isFinal !== false ? 400 : 300,
                opacity: (entry as any).isFinal !== false ? 1 : 0.7,
                fontStyle: (entry as any).isFinal !== false ? 'normal' : 'italic',
              }}>
                {entry.text}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* ===== BOTTOM CONTROL BAR ===== */}
      <Box sx={{
        height: { xs: '60px', md: '72px' }, background: '#202124',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        px: { xs: 0.5, sm: 2, md: 3 },
        opacity: showControls ? 1 : 0, transition: 'opacity 0.3s ease',
        position: 'relative', zIndex: 15, flexShrink: 0,
      }}>
        {/* Center: All controls in one row */}
        <Box sx={{ display: 'flex', gap: { xs: 0.5, md: 1 }, alignItems: 'center' }}>
          <Tooltip title={`${isMicOn ? 'Turn off' : 'Turn on'} microphone (Ctrl+D)`} arrow>
            <IconButton onClick={toggleMic} sx={{ ...ctrlBtn(isMicOn), width: { xs: 40, md: 48 }, height: { xs: 40, md: 48 } }}>
              {isMicOn ? <Mic sx={{ fontSize: { xs: 20, md: 24 } }} /> : <MicOff sx={{ fontSize: { xs: 20, md: 24 } }} />}
            </IconButton>
          </Tooltip>

          <Tooltip title={`${isCamOn ? 'Turn off' : 'Turn on'} camera (Ctrl+E)`} arrow>
            <IconButton onClick={toggleCamera} sx={{ ...ctrlBtn(isCamOn), width: { xs: 40, md: 48 }, height: { xs: 40, md: 48 } }}>
              {isCamOn ? <Videocam sx={{ fontSize: { xs: 20, md: 24 } }} /> : <VideocamOff sx={{ fontSize: { xs: 20, md: 24 } }} />}
            </IconButton>
          </Tooltip>

          <Tooltip title={isScreenSharing ? 'Stop presenting' : 'Present now'} arrow>
            <IconButton onClick={toggleScreenShare} sx={{
              ...ctrlBtn(!isScreenSharing),
              width: { xs: 40, md: 48 }, height: { xs: 40, md: 48 },
              bgcolor: isScreenSharing ? '#34a853' : 'rgba(255,255,255,0.1)',
              '&:hover': { bgcolor: isScreenSharing ? '#2d9249' : 'rgba(255,255,255,0.2)', transform: 'scale(1.05)' },
            }}>
              {isScreenSharing ? <StopScreenShare sx={{ fontSize: { xs: 20, md: 24 } }} /> : <ScreenShare sx={{ fontSize: { xs: 20, md: 24 } }} />}
            </IconButton>
          </Tooltip>

          {/* Emoji - hidden on mobile to save space */}
          <Tooltip title="Send a reaction" arrow>
            <IconButton onClick={() => setShowEmojiPicker(!showEmojiPicker)} sx={{
              ...ctrlBtn(true),
              display: { xs: 'none', sm: 'inline-flex' },
              bgcolor: showEmojiPicker ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
            }}>
              <EmojiEmotions />
            </IconButton>
          </Tooltip>

          {/* Separator */}
          <Box sx={{ width: 1, height: 28, bgcolor: '#5f6368', mx: { xs: 0, md: 0.5 } }} />

          <Tooltip title="Exit — Leave call temporarily (can rejoin)" arrow>
            <IconButton onClick={onExitCall} sx={{
              ...ctrlBtn(false, false),
              borderRadius: '24px', width: { xs: 48, md: 56 }, height: { xs: 40, md: 48 }, px: { xs: 1.5, md: 2 },
              bgcolor: '#f59e0b', '&:hover': { bgcolor: '#d97706', transform: 'scale(1.05)' },
            }}>
              <ExitToApp sx={{ fontSize: { xs: 20, md: 24 } }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="End Interview — Permanently end and generate report" arrow>
            <IconButton onClick={onEndCall} sx={{
              ...ctrlBtn(false, true),
              borderRadius: '24px', width: { xs: 48, md: 56 }, height: { xs: 40, md: 48 }, px: { xs: 1.5, md: 2 },
            }}>
              <CallEnd sx={{ fontSize: { xs: 20, md: 24 } }} />
            </IconButton>
          </Tooltip>

          {/* Separator - hidden on mobile */}
          <Box sx={{ width: 1, height: 28, bgcolor: '#5f6368', mx: { xs: 0, md: 0.5 }, display: { xs: 'none', sm: 'block' } }} />

          {/* Info, People, Fullscreen - hidden on mobile, accessible via More menu */}
          <Tooltip title="Meeting details" arrow>
            <IconButton onClick={() => { setShowMeetingInfo(!showMeetingInfo); if (!showMeetingInfo) setShowParticipants(false); }} sx={{
              color: showMeetingInfo ? '#8ab4f8' : '#e8eaed', width: 40, height: 40,
              display: { xs: 'none', sm: 'inline-flex' },
              '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
            }}>
              <Info sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title={`People (${participantCount})`} arrow>
            <IconButton onClick={() => { setShowParticipants(!showParticipants); if (!showParticipants) setShowMeetingInfo(false); }} sx={{
              color: showParticipants ? '#8ab4f8' : '#e8eaed', width: 40, height: 40,
              display: { xs: 'none', sm: 'inline-flex' },
              '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
            }}>
              <PeopleAlt sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title={isFullscreen ? 'Exit full screen' : 'Full screen'} arrow>
            <IconButton onClick={toggleFullscreen} sx={{
              color: '#e8eaed', width: 40, height: 40,
              display: { xs: 'none', sm: 'inline-flex' },
              '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
            }}>
              {isFullscreen ? <FullscreenExit sx={{ fontSize: 20 }} /> : <Fullscreen sx={{ fontSize: 20 }} />}
            </IconButton>
          </Tooltip>

          <Tooltip title="More options" arrow>
            <IconButton onClick={(e) => setMoreMenuAnchor(e.currentTarget)} sx={{
              color: '#e8eaed', width: { xs: 36, md: 40 }, height: { xs: 36, md: 40 },
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
