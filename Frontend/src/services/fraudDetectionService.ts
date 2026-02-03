import apiClient from './api';

export const fraudDetectionService = {
  triggerAnalysis: async (videoInterviewId: number) => {
    const response = await apiClient.post(`/api/video/fraud/${videoInterviewId}/analyze`);
    return response.data;
  },
  getAnalysis: async (videoInterviewId: number) => {
    const response = await apiClient.get(`/api/video/fraud/${videoInterviewId}`);
    return response.data;
  },
  getDashboardStats: async () => {
    const response = await apiClient.get('/api/video/fraud/dashboard');
    return response.data;
  },
  getFlaggedInterviews: async () => {
    const response = await apiClient.get('/api/video/fraud/flagged');
    return response.data;
  },
};

export default fraudDetectionService;
