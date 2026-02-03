import apiClient from './api';

export const videoInterviewService = {
  scheduleInterview: async (data: any) => {
    const response = await apiClient.post('/api/video/interviews', data);
    return response.data;
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
};
