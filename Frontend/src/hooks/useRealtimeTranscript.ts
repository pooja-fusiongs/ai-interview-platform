/**
 * useRealtimeTranscript - Silent background hook for real-time transcription.
 * Uses LiveKit tracks only (no extra getUserMedia calls).
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
  const remoteRecorderRef = useRef<MediaRecorder | null>(null);
  const entriesRef = useRef<TranscriptEntry[]>([]);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const allTracks = useTracks(
    [{ source: Track.Source.Microphone, withPlaceholder: false }],
    { onlySubscribed: false }
  );

  const localMicTrack = allTracks.find(
    (t) => t.participant.isLocal && t.source === Track.Source.Microphone && t.publication?.track
  );
  const remoteMicTrack = allTracks.find(
    (t) => !t.participant.isLocal && t.source === Track.Source.Microphone && t.publication?.track
  );

  const localMicMediaTrack = localMicTrack?.publication?.track?.mediaStreamTrack;
  const remoteMicMediaTrack = remoteMicTrack?.publication?.track?.mediaStreamTrack;

  // Connect WebSocket — all errors silent
  useEffect(() => {
    if (!enabled || !interviewId) return;

    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
      const wsUrl = apiBase.replace(/^http/, 'ws') + `/ws/transcription/${interviewId}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        try { ws.send(JSON.stringify({ type: 'config', role: userRole })); } catch {}
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'ready') {
            setIsConnected(true);
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
            setEntries([...entriesRef.current]);
          }
        } catch {}
      };

      ws.onclose = () => setIsConnected(false);
      ws.onerror = () => {}; // Silent

      return () => {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'stop' }));
            ws.close();
          }
        } catch {}
        wsRef.current = null;
        setIsConnected(false);
      };
    } catch {
      return;
    }
  }, [enabled, interviewId, userRole]);

  // Helper: create audio-only MediaRecorder — silent on failure
  const createAudioRecorder = useCallback(
    (track: MediaStreamTrack, speakerId: number): MediaRecorder | null => {
      try {
        const stream = new MediaStream([track]);
        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/webm';
          if (!MediaRecorder.isTypeSupported(mimeType)) return null;
        }

        const recorder = new MediaRecorder(stream, { mimeType });
        recorder.ondataavailable = async (event) => {
          try {
            if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
              const buffer = await event.data.arrayBuffer();
              const prefixed = new Uint8Array(1 + buffer.byteLength);
              prefixed[0] = speakerId;
              prefixed.set(new Uint8Array(buffer), 1);
              wsRef.current.send(prefixed.buffer);
            }
          } catch {}
        };
        recorder.onerror = () => {}; // Silent
        recorder.start(250);
        return recorder;
      } catch {
        return null;
      }
    },
    []
  );

  // Capture local mic (from LiveKit track only — no extra getUserMedia)
  useEffect(() => {
    if (!isConnected || !localMicMediaTrack) return;
    try {
      const recorder = createAudioRecorder(localMicMediaTrack, 1);
      localRecorderRef.current = recorder;
      return () => {
        try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch {}
        localRecorderRef.current = null;
      };
    } catch {
      return;
    }
  }, [isConnected, localMicMediaTrack, createAudioRecorder]);

  // Capture remote mic (from LiveKit track)
  useEffect(() => {
    if (!isConnected || !remoteMicMediaTrack) return;
    try {
      const recorder = createAudioRecorder(remoteMicMediaTrack, 2);
      remoteRecorderRef.current = recorder;
      return () => {
        try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch {}
        remoteRecorderRef.current = null;
      };
    } catch {
      return;
    }
  }, [isConnected, remoteMicMediaTrack, createAudioRecorder]);

  return { entries, isConnected };
}
