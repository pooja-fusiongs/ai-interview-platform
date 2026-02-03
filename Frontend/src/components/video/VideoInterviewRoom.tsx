import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, Paper, Button, Divider } from '@mui/material';
import { Videocam, Stop } from '@mui/icons-material';
import Naivgation from '../layout/sidebar';
import videoInterviewService from '../../services/videoInterviewService';

const VideoInterviewRoom: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [meetingInfo, setMeetingInfo] = useState<any>(null);
  const intervalRef = useRef<NodeJS.Timer | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const handleStart = async () => {
    setIsActive(true);
    setElapsed(0);
    intervalRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    try {
      const info = await videoInterviewService.getRoomInfo();
      setMeetingInfo(info);
    } catch {
      setMeetingInfo({ meeting_id: 'demo-meeting-001', topic: 'Video Interview Session' });
    }
  };

  const handleEnd = () => {
    setIsActive(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  return (
    <Naivgation>
      <Box component="main" sx={{ flexGrow: 1, p: 3, overflow: 'auto', bgcolor: '#f5f5f5' }}>
        <Typography variant="h4" gutterBottom>Video Interview Room</Typography>
        {/* Placeholder for Zoom Web SDK integration.
            In production, initialize ZoomMtg.init() and ZoomMtg.join() here
            to embed the Zoom meeting client into the Paper container below. */}
        <Paper sx={{
          height: 480, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', bgcolor: '#1a1a2e', color: '#fff', mb: 3,
        }}>
          <Videocam sx={{ fontSize: 80, mb: 2, opacity: 0.6 }} />
          <Typography variant="h5">Video Interview Room</Typography>
          {meetingInfo && (
            <Typography variant="body2" sx={{ mt: 1, opacity: 0.7 }}>
              Meeting: {meetingInfo.meeting_id} — {meetingInfo.topic}
            </Typography>
          )}
          <Typography variant="h3" sx={{ mt: 3, fontFamily: 'monospace' }}>
            {formatTime(elapsed)}
          </Typography>
        </Paper>
        <Divider sx={{ mb: 2 }} />
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
          <Button variant="contained" color="success" size="large" startIcon={<Videocam />}
            onClick={handleStart} disabled={isActive}>
            Start Interview
          </Button>
          <Button variant="contained" color="error" size="large" startIcon={<Stop />}
            onClick={handleEnd} disabled={!isActive}>
            End Interview
          </Button>
        </Box>
      </Box>
    </Naivgation>
  );
};

export default VideoInterviewRoom;
