import apiClient from './api';

export const feedbackService = {
  submitFeedback: async (data: any) => {
    const response = await apiClient.post('/api/feedback/post-hire', data);
    return response.data;
  },
  getFeedbackList: async (filters?: any) => {
    const response = await apiClient.get('/api/feedback/post-hire', { params: filters });
    return response.data;
  },
  getFeedback: async (id: number) => {
    const response = await apiClient.get(`/api/feedback/post-hire/${id}`);
    return response.data;
  },
  updateFeedback: async (id: number, data: any) => {
    const response = await apiClient.put(`/api/feedback/post-hire/${id}`, data);
    return response.data;
  },
  deleteFeedback: async (id: number) => {
    const response = await apiClient.delete(`/api/feedback/post-hire/${id}`);
    return response.data;
  },
  getCandidateFeedback: async (candidateId: number) => {
    const response = await apiClient.get(`/api/feedback/post-hire/candidate/${candidateId}`);
    return response.data;
  },
  getJobFeedback: async (jobId: number) => {
    const response = await apiClient.get(`/api/feedback/post-hire/job/${jobId}`);
    return response.data;
  },
  getQualityDashboard: async () => {
    const response = await apiClient.get('/api/feedback/quality/dashboard');
    return response.data;
  },
  computeMetrics: async () => {
    const response = await apiClient.post('/api/feedback/quality/compute');
    return response.data;
  },
  getCorrelationData: async () => {
    const response = await apiClient.get('/api/feedback/quality/correlation');
    return response.data;
  },
};
