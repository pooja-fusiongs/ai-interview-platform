/**
 * TranscriptionCapture - Captures audio from LiveKit tracks and streams
 * to backend for real-time transcription. Renders nothing (headless component).
 * Must be placed inside <LiveKitRoom>.
 */

import React, { useEffect } from 'react';
import {
  useRealtimeTranscript,
  TranscriptEntry,
} from '../../hooks/useRealtimeTranscript';

interface TranscriptionCaptureProps {
  interviewId: string | number;
  userRole: 'recruiter' | 'candidate';
  enabled: boolean;
  onTranscriptUpdate: (entries: TranscriptEntry[]) => void;
  onConnectionChange: (connected: boolean) => void;
}

const TranscriptionCapture: React.FC<TranscriptionCaptureProps> = ({
  interviewId,
  userRole,
  enabled,
  onTranscriptUpdate,
  onConnectionChange,
}) => {
  const { entries, isConnected } = useRealtimeTranscript({
    interviewId,
    userRole,
    enabled,
  });

  useEffect(() => {
    onTranscriptUpdate(entries);
  }, [entries]);

  useEffect(() => {
    onConnectionChange(isConnected);
  }, [isConnected]);

  return null; // Headless — only captures audio
};

export default TranscriptionCapture;
