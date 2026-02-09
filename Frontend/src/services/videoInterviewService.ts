import apiClient from './api';

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
  endInterview: async (id: number) => {
    const response = await apiClient.post(`/api/video/interviews/${id}/end`);
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
  createDemoInterview: async () => {
    const response = await apiClient.post('/api/video/interviews/demo');
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
};

export default videoInterviewService;
