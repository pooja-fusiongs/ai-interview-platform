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
  submitLipEvents: async (videoInterviewId: number, data: {
    total_frames: number;
    lip_moving_with_audio: number;
    lip_still_with_audio: number;
    lip_moving_no_audio: number;
    lip_still_no_audio: number;
    no_face_frames: number;
    max_mouth_openness: number;
    avg_mouth_openness: number;
    mismatch_seconds: number;
    detection_interval_ms: number;
  }) => {
    const response = await apiClient.post(`/api/video/fraud/${videoInterviewId}/lip-events`, data);
    return response.data;
  },
  submitVoiceEvents: async (videoInterviewId: number, data: {
    total_segments: number;
    consistent_segments: number;
    inconsistent_segments: number;
    silent_segments: number;
    avg_pitch: number;
    pitch_shift_count: number;
    max_pitch_deviation: number;
    inconsistent_seconds: number;
    detection_interval_ms: number;
  }) => {
    const response = await apiClient.post(`/api/video/fraud/${videoInterviewId}/voice-events`, data);
    return response.data;
  },
  submitUnifiedDetection: async (data: any) => {
    // The unified payload has interview_id inside data
    // Use short timeout (10s) — this is a lightweight call that fires every 5s
    // If it fails, the next one will succeed (data is accumulated in 5s windows)
    const response = await apiClient.post(`/api/movement-detection`, data, { timeout: 10000 });
    return response.data;
  },
};

export default fraudDetectionService;
