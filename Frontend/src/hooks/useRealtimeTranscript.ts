/**
 * useRealtimeTranscript - Silent background hook for real-time transcription.
 * Each participant sends ONLY their own local mic audio (high quality, no WebRTC loss).
 * Both recruiter and candidate should enable this — each sends their own voice.
 * All errors are caught silently — never interferes with recording or video.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';

export interface TranscriptEntry {
  speaker: string;
  text: string;
  isFinal: boolean;
  timestamp: number;
}

interface UseRealtimeTranscriptProps {
  interviewId: string | number;
  userRole: 'recruiter' | 'candidate';
  enabled: boolean;
}

export function useRealtimeTranscript({
  interviewId,
  userRole,
  enabled,
}: UseRealtimeTranscriptProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const localRecorderRef = useRef<MediaRecorder | null>(null);
  const entriesRef = useRef<TranscriptEntry[]>([]);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const allTracks = useTracks(
    [{ source: Track.Source.Microphone, withPlaceholder: false }],
    { onlySubscribed: false }
  );

  const localMicTrack = allTracks.find(
    (t) => t.participant.isLocal && t.source === Track.Source.Microphone && t.publication?.track
  );

  const localMicMediaTrack = localMicTrack?.publication?.track?.mediaStreamTrack;

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'ready') {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
      } else if (data.type === 'transcript') {
        const entry: TranscriptEntry = {
          speaker: data.speaker,
          text: data.text,
          isFinal: data.is_final,
          timestamp: data.timestamp_start || Date.now() / 1000,
        };
        if (data.is_final) {
          entriesRef.current = [
            ...entriesRef.current.filter((e) => !(e.speaker === data.speaker && !e.isFinal)),
            entry,
          ];
        } else {
          const withoutInterim = entriesRef.current.filter(
            (e) => !(e.speaker === data.speaker && !e.isFinal)
          );
          entriesRef.current = [...withoutInterim, entry];
        }
        // Sort by timestamp so both participants' chunks appear in chronological order
        entriesRef.current.sort((a, b) => a.timestamp - b.timestamp);
        setEntries([...entriesRef.current]);
      }
    } catch {}
  }, []);

  // Connect WebSocket with auto-reconnect
  const connectWs = useCallback(() => {
    if (!enabledRef.current || !interviewId) return;
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
      const wsUrl = apiBase.replace(/^http/, 'ws') + `/ws/transcription/${interviewId}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        try { ws.send(JSON.stringify({ type: 'config', role: userRole })); } catch {}
      };
      ws.onmessage = handleMessage;
      ws.onclose = () => {
        setIsConnected(false);
        // Auto-reconnect if still enabled (max 5 attempts)
        if (enabledRef.current && reconnectAttemptsRef.current < 5) {
          reconnectAttemptsRef.current += 1;
          const delay = Math.min(1000 * reconnectAttemptsRef.current, 5000);
          console.log(`[transcript] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/5)...`);
          reconnectTimerRef.current = setTimeout(connectWs, delay);
        }
      };
      ws.onerror = () => {};
    } catch {}
  }, [interviewId, userRole, handleMessage]);

  useEffect(() => {
    if (!enabled || !interviewId) return;
    connectWs();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      try {
        // Stop the recorder first so its last 500ms chunk (containing the
        // final words like "yeah thank you") gets flushed to the WebSocket
        // BEFORE we close the connection. Without this, the tail audio is
        // lost and Deepgram never emits its final transcript for it.
        const recorder = localRecorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
          recorder.stop();
          localRecorderRef.current = null;
        }
      } catch {}
      // Give the last ondataavailable callback ~300ms to forward the flushed
      // chunk over the WebSocket, then tell the backend we're done.
      setTimeout(() => {
        try {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'stop' }));
            wsRef.current.close();
          }
        } catch {}
        wsRef.current = null;
      }, 300);
      reconnectAttemptsRef.current = 0;
      setIsConnected(false);
    };
  }, [enabled, interviewId, connectWs]);

  // Helper: create audio-only MediaRecorder — silent on failure
  const createAudioRecorder = useCallback(
    (track: MediaStreamTrack): MediaRecorder | null => {
      try {
        const stream = new MediaStream([track]);
        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/webm';
          if (!MediaRecorder.isTypeSupported(mimeType)) return null;
        }

        const recorder = new MediaRecorder(stream, {
          mimeType,
          audioBitsPerSecond: 256000,
        });
        recorder.ondataavailable = async (event) => {
          try {
            if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
              const buffer = await event.data.arrayBuffer();
              wsRef.current.send(buffer);
            }
          } catch {}
        };
        recorder.onerror = () => {}; // Silent
        // 250ms chunks — faster audio delivery to backend → faster interim captions.
        // Deepgram's recommended range is 100-250ms for low-latency streaming.
        // Kept ≥250ms so we don't overwhelm the WS with too many small frames.
        recorder.start(250);
        return recorder;
      } catch {
        return null;
      }
    },
    []
  );

  // Capture local mic only (from LiveKit track — no extra getUserMedia)
  // Each participant sends their own high-quality local audio directly
  useEffect(() => {
    if (!isConnected || !localMicMediaTrack) return;
    try {
      const recorder = createAudioRecorder(localMicMediaTrack);
      localRecorderRef.current = recorder;
      return () => {
        try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch {}
        localRecorderRef.current = null;
      };
    } catch {
      return;
    }
  }, [isConnected, localMicMediaTrack, createAudioRecorder]);

  return { entries, isConnected };
}
