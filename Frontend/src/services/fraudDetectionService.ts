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
  getAllAnalyses: async () => {
    const response = await apiClient.get('/api/video/fraud/all');
    return response.data;
  },
  submitFaceEvents: async (videoInterviewId: number, data: {
    total_detections: number;
    no_face_count: number;
    multiple_face_count: number;
    single_face_count: number;
    no_face_seconds: number;
    multiple_face_seconds: number;
    max_faces_detected: number;
    detection_interval_ms: number;
  }) => {
    const response = await apiClient.post(`/api/video/fraud/${videoInterviewId}/face-events`, data);
    return response.data;
  },
};

export default fraudDetectionService;
