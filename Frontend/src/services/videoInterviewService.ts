import apiClient from './api';
import axios from 'axios';

// Guest axios instance — no auth token needed
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://ai-interview-platform-2bov.onrender.com';
const guestClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

export const videoInterviewService = {
  scheduleInterview: async (data: any) => {
    try {
      const response = await apiClient.post('/api/video/interviews', data);
      return response.data;
    } catch (error: any) {
      // Extract the actual error message from API response
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to schedule interview';
      throw new Error(errorMessage);
    }
  },
  getInterviews: async () => {
    const response = await apiClient.get('/api/video/interviews');
    return response.data;
  },
  getInterview: async (id: number) => {
    const response = await apiClient.get(`/api/video/interviews/${id}`);
    return response.data;
  },
  updateInterview: async (id: number, data: any) => {
    const response = await apiClient.put(`/api/video/interviews/${id}`, data);
    return response.data;
  },
  cancelInterview: async (id: number) => {
    const response = await apiClient.delete(`/api/video/interviews/${id}`);
    return response.data;
  },
  startInterview: async (id: number) => {
    const response = await apiClient.post(`/api/video/interviews/${id}/start`);
    return response.data;
  },
  endInterview: async (id: number, data?: { max_participants?: number }) => {
    const response = await apiClient.post(`/api/video/interviews/${id}/end`, data || {});
    return response.data;
  },
  getMyInterviews: async () => {
    const response = await apiClient.get('/api/video/interviews/candidate/me');
    return response.data;
  },
  getZoomSignature: async (meetingNumber: string, role: number = 0) => {
    const response = await apiClient.get('/api/video/zoom/signature', { params: { meeting_number: meetingNumber, role } });
    return response.data;
  },
  getTranscript: async (id: number) => {
    const response = await apiClient.get(`/api/video/interviews/${id}/transcript`);
    return response.data;
  },
  getTranscriptChunks: async (id: number) => {
    const response = await apiClient.get(`/api/video/interviews/${id}/transcript-chunks`);
    return response.data;
  },
  createDemoInterview: async () => {
    const response = await apiClient.post('/api/video/interviews/demo');
    return response.data;
  },
  generateTranscriptFromRecording: async (id: number) => {
    const response = await apiClient.post(`/api/video/interviews/${id}/generate-transcript`);
    return response.data;
  },
  uploadTranscriptAndScore: async (id: number, transcriptText: string) => {
    const response = await apiClient.post(`/api/video/interviews/${id}/upload-transcript`, {
      transcript_text: transcriptText
    });
    return response.data;
  },
  updateNotes: async (id: number, notes: string) => {
    const response = await apiClient.patch(`/api/video/interviews/${id}/notes`, { notes });
    return response.data;
  },
  // AI Interview Methods
  getAIInterviewQuestions: async (id: number) => {
    const response = await apiClient.get(`/api/video/interviews/${id}/ai-questions`);
    return response.data;
  },
  submitAIInterviewAnswers: async (id: number, answers: Array<{ question_id: number; answer_text: string }>) => {
    const response = await apiClient.post(`/api/video/interviews/${id}/ai-submit`, {
      answers: answers
    });
    return response.data;
  },
  // Recording Methods
  updateRecordingConsent: async (id: number, consent: boolean) => {
    const response = await apiClient.patch(`/api/video/interviews/${id}/recording-consent`, { consent });
    return response.data;
  },
  uploadRecording: async (id: number, blob: Blob) => {
    const formData = new FormData();
    formData.append('file', blob, `interview_${id}.webm`);
    const response = await apiClient.post(`/api/video/interviews/${id}/upload-recording`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000, // 5 min timeout for large uploads
    });
    return response.data;
  },
  getLiveKitToken: async (roomName: string, participantName: string) => {
    const response = await apiClient.post('/api/livekit/token', {
      room_name: roomName,
      participant_name: participantName
    });
    return response.data;
  },
  joinInterview: async (videoId: number) => {
    const response = await apiClient.post('/api/video/join', { video_id: videoId });
    return response.data;
  },
  checkGracePeriod: async (id: number, graceMinutes: number = 10) => {
    const response = await apiClient.post(`/api/video/interviews/${id}/check-grace-period`, {
      grace_minutes: graceMinutes
    });
    return response.data;
  },

  // Guest (candidate) methods — no auth required
  guestGetInterview: async (id: number) => {
    const response = await guestClient.get(`/api/video/guest/${id}`);
    return response.data;
  },
  guestJoinInterview: async (videoId: number) => {
    const response = await guestClient.post(`/api/video/guest/${videoId}/join`);
    return response.data;
  },
  guestUpdateRecordingConsent: async (id: number, consent: boolean) => {
    const response = await guestClient.patch(`/api/video/guest/${id}/recording-consent`, { consent });
    return response.data;
  },
  guestEndInterview: async (id: number) => {
    const response = await guestClient.post(`/api/video/guest/${id}/end`);
    return response.data;
  },
  guestUploadRecording: async (id: number, blob: Blob) => {
    const formData = new FormData();
    formData.append('file', blob, `interview_${id}.webm`);
    const response = await guestClient.post(`/api/video/guest/${id}/upload-recording`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000,
    });
    return response.data;
  },
};

export default videoInterviewService;
