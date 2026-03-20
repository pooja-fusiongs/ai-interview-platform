/**
 * LiveTranscriptPanel - Displays real-time transcript during video interviews.
 * Shows speaker-labeled entries with visual distinction for interim vs final results.
 */

import React, { useEffect, useRef } from 'react';
import { Box, Typography, Chip } from '@mui/material';
import { Mic } from '@mui/icons-material';
import { TranscriptEntry } from '../../hooks/useRealtimeTranscript';

interface LiveTranscriptPanelProps {
  entries: TranscriptEntry[];
  isConnected: boolean;
}

const LiveTranscriptPanel: React.FC<LiveTranscriptPanelProps> = ({
  entries,
  isConnected,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box
        sx={{
          p: '16px 20px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'white',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Mic sx={{ fontSize: 18, color: '#7c3aed' }} />
          <Typography
            sx={{ fontWeight: 700, fontSize: '15px', color: '#1e293b' }}
          >
            Live Transcript
          </Typography>
        </Box>
        <Chip
          label={isConnected ? 'LIVE' : 'CONNECTING'}
          size="small"
          sx={{
            background: isConnected ? '#dcfce7' : '#fef3c7',
            color: isConnected ? '#166534' : '#92400e',
            fontWeight: 700,
            fontSize: '11px',
            height: '24px',
            border: isConnected ? '1px solid #bbf7d0' : '1px solid #fde68a',
            '& .MuiChip-label': { px: 1 },
          }}
        />
      </Box>

      {/* Transcript Content */}
      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          background: '#f8fafc',
          '&::-webkit-scrollbar': { width: '6px' },
          '&::-webkit-scrollbar-track': { background: '#f1f5f9' },
          '&::-webkit-scrollbar-thumb': {
            background: '#cbd5e1',
            borderRadius: '3px',
            '&:hover': { background: '#94a3b8' },
          },
        }}
      >
        {entries.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Mic sx={{ fontSize: 48, color: '#cbd5e1', mb: 2 }} />
            <Typography sx={{ color: '#94a3b8', fontSize: '14px' }}>
              {isConnected
                ? 'Waiting for speech...'
                : 'Connecting to transcription service...'}
            </Typography>
            {isConnected && (
              <Typography
                sx={{ color: '#cbd5e1', fontSize: '12px', mt: 1 }}
              >
                Start speaking to see the live transcript
              </Typography>
            )}
          </Box>
        ) : (
          entries.map((entry, idx) => (
            <Box
              key={`${idx}-${entry.isFinal}`}
              sx={{
                background: entry.isFinal ? 'white' : 'transparent',
                borderRadius: '10px',
                p: entry.isFinal ? '12px 16px' : '8px 16px',
                border: entry.isFinal ? '1px solid #e2e8f0' : 'none',
                opacity: entry.isFinal ? 1 : 0.6,
                transition: 'all 0.2s',
              }}
            >
              <Typography
                component="span"
                sx={{
                  fontWeight: 700,
                  fontSize: '12px',
                  color:
                    entry.speaker === 'recruiter' ? '#020291' : '#7c3aed',
                  textTransform: 'capitalize',
                  mr: 1,
                  letterSpacing: '0.02em',
                }}
              >
                {entry.speaker}:
              </Typography>
              <Typography
                component="span"
                sx={{
                  fontSize: '14px',
                  color: entry.isFinal ? '#334155' : '#94a3b8',
                  fontStyle: entry.isFinal ? 'normal' : 'italic',
                  lineHeight: 1.6,
                }}
              >
                {entry.text}
              </Typography>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
};

export default LiveTranscriptPanel;
