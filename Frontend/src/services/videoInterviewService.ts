import apiClient from './api';
import axios, { AxiosInstance } from 'axios';

// Guest axios instance — no auth token needed
// NOTE: Do NOT set default Content-Type here — it breaks FormData uploads (file upload sends as JSON instead of multipart)
// Axios auto-sets Content-Type: application/json for objects and multipart/form-data for FormData
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://ai-interview-platform-2bov.onrender.com';
const guestClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 90000, // 90s — Render cold starts can be slow
});

/**
 * Direct-to-Cloudinary upload. Bypasses Cloud Run's 32 MB HTTP/1.1 body limit
 * by having the browser POST the recording straight to Cloudinary, then tells
 * the backend where the file landed.
 *
 * Returns the backend response on success, or null if the server side is not
 * configured (so the caller can fall back to the old proxied-upload path).
 * Throws on network/upload failure so the caller can retry or fall back.
 */
async function uploadToCloudinaryDirect(
  id: number,
  blob: Blob,
  client: AxiosInstance
): Promise<any | null> {
  // 1. Ask backend for a short-lived signed upload payload.
  let sigData: any;
  try {
    const sigRes = await client.post(`/api/video/interviews/${id}/cloudinary-signature`);
    sigData = sigRes.data;
  } catch (err: any) {
    // Backend returns 500 if Cloudinary isn't configured, or 404 for unknown
    // endpoint (older backend revision). Signal "fall back" to caller.
    if (err?.response?.status === 404 || err?.response?.status === 500) return null;
    throw err;
  }

  if (!sigData?.cloud_name || !sigData?.signature) return null;

  // 2. POST the recording directly to Cloudinary (no Cloud Run in the path).
  const form = new FormData();
  form.append('file', blob, `interview_${id}.webm`);
  form.append('api_key', sigData.api_key);
  form.append('timestamp', String(sigData.timestamp));
  form.append('signature', sigData.signature);
  form.append('folder', sigData.folder);
  form.append('public_id', sigData.public_id);
  form.append('overwrite', 'true');

  const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${sigData.cloud_name}/${sigData.resource_type || 'video'}/upload`;

  // Use raw axios (no auth interceptors) and generous timeout for long recordings.
  const uploadRes = await axios.post(cloudinaryUrl, form, {
    timeout: 30 * 60 * 1000, // 30 min — covers large recordings on slow networks
  });
  const secureUrl = uploadRes?.data?.secure_url;
  if (!secureUrl) throw new Error('Cloudinary did not return a secure_url');

  // 3. Save the final URL on the backend so transcription / fraud analysis can fetch it.
  const saveRes = await client.post(`/api/video/interviews/${id}/set-recording-url`, { url: secureUrl });
  return saveRes.data;
}

export const videoInterviewService = {
  scheduleInterview: async (data: any) => {
    try {
      const response = await apiClient.post('/api/video/interviews', data, {
        timeout: 180000, // 3 min — generates questions + sends email
      });
      return response.data;
    } catch (error: any) {
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
  endInterview: async (id: number, data?: { max_participants?: number; force_complete?: boolean; overall_score?: number | null; recommendation?: string }) => {
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
    const response = await apiClient.post(`/api/video/interviews/${id}/generate-transcript`, {}, {
      timeout: 300000, // 5 min — Deepgram/Groq transcription is slow
    });
    return response.data;
  },
  uploadTranscriptAndScore: async (id: number, transcriptText: string) => {
    // BULLETPROOF: try authenticated route first, fall back to no-auth guest route
    // on auth failure so an accidental logout/session-expiry mid-interview cannot
    // block the transcript+scoring flow.
    try {
      const response = await apiClient.post(`/api/video/interviews/${id}/upload-transcript`, {
        transcript_text: transcriptText
      }, {
        timeout: 180000, // 3 min — LLM scoring
      });
      return response.data;
    } catch (err: any) {
      const status = err?.response?.status;
      const isAuthFailure = status === 401 || status === 403 || !status; // network drop too
      if (!isAuthFailure) throw err;
      console.warn(`[uploadTranscript] auth route failed (status=${status ?? 'network'}), retrying via guest route...`);
      const response = await guestClient.post(`/api/video/guest/${id}/upload-transcript`, {
        transcript_text: transcriptText
      }, {
        timeout: 180000,
      });
      return response.data;
    }
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
    }, {
      timeout: 180000, // 3 min — AI scoring of answers
    });
    return response.data;
  },
  // Recording Methods
  updateRecordingConsent: async (id: number, consent: boolean) => {
    const response = await apiClient.patch(`/api/video/interviews/${id}/recording-consent`, { consent });
    return response.data;
  },
  uploadRecording: async (id: number, blob: Blob) => {
    if (!blob || blob.size < 1000) {
      console.warn(`⚠️ Recording blob too small (${blob?.size || 0} bytes), skipping upload`);
      return { message: 'Recording too small, skipped' };
    }

    // PRIMARY PATH: direct-to-Cloudinary upload. Bypasses Cloud Run's 32 MB
    // HTTP/1.1 request body limit — essential for interviews > ~2 min.
    try {
      const direct = await uploadToCloudinaryDirect(id, blob, apiClient);
      if (direct) return direct;
    } catch (directErr: any) {
      console.warn('[uploadRecording] direct Cloudinary path failed, falling back to backend proxy:', directErr?.message || directErr);
    }

    // FALLBACK 1: backend-proxied upload (old path) — only works for files < 32 MB.
    const formData = new FormData();
    formData.append('file', blob, `interview_${id}.webm`);
    // BULLETPROOF: try auth route first, fall back to no-auth guest route on
    // auth failure so a mid-interview logout/session-expiry cannot lose the
    // recording (FormData is rebuilt for the retry — body streams are consumed).
    try {
      const response = await apiClient.post(`/api/video/interviews/${id}/upload-recording`, formData, {
        timeout: 300000, // 5 min timeout for large uploads
      });
      return response.data;
    } catch (err: any) {
      const status = err?.response?.status;
      const isAuthFailure = status === 401 || status === 403 || !status;
      if (!isAuthFailure) throw err;
      console.warn(`[uploadRecording] auth route failed (status=${status ?? 'network'}), retrying via guest route...`);
      const retryForm = new FormData();
      retryForm.append('file', blob, `interview_${id}.webm`);
      const response = await guestClient.post(`/api/video/guest/${id}/upload-recording`, retryForm, {
        timeout: 300000,
      });
      return response.data;
    }
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
    if (!blob || blob.size < 1000) {
      console.warn(`⚠️ Guest recording blob too small (${blob?.size || 0} bytes), skipping upload`);
      return { message: 'Recording too small, skipped' };
    }

    // PRIMARY PATH: direct-to-Cloudinary (bypasses 32 MB Cloud Run limit).
    try {
      const direct = await uploadToCloudinaryDirect(id, blob, guestClient);
      if (direct) return direct;
    } catch (directErr: any) {
      console.warn('[guestUploadRecording] direct Cloudinary path failed, falling back to backend proxy:', directErr?.message || directErr);
    }

    // FALLBACK: backend-proxied upload (old path) — only works for files < 32 MB.
    const formData = new FormData();
    formData.append('file', blob, `interview_${id}.webm`);
    const response = await guestClient.post(`/api/video/guest/${id}/upload-recording`, formData, {
      timeout: 300000, // 5 min timeout for large uploads
    });
    return response.data;
  },
};

export default videoInterviewService;
