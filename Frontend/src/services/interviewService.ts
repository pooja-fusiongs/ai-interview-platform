/**
 * Interview Service
 * Handles interview session API calls
 */

import { apiClient } from './api';

export interface ApprovedQuestion {
  id: number;
  question: string;
  question_text: string;
  sample_answer: string;
  goldStandard: string;
  question_type: string;
  difficulty: string;
  skill_focus: string | null;
}

export interface InterviewSession {
  id: number;
  job_id: number;
  candidate_id: number;
  status: string;
  overall_score: number | null;
  recommendation: string | null;
  strengths: string | null;
  weaknesses: string | null;
  started_at: string | null;
  completed_at: string | null;
  job_title: string | null;
  candidate_name: string | null;
  answers: InterviewAnswer[];
}

export interface InterviewAnswer {
  id: number;
  session_id: number;
  question_id: number;
  answer_text: string;
  score: number | null;
  relevance_score: number | null;
  completeness_score: number | null;
  accuracy_score: number | null;
  clarity_score: number | null;
  feedback: string | null;
  question_text: string | null;
  sample_answer: string | null;
  created_at: string | null;
}

export interface InterviewListItem {
  id: number;
  job_id: number;
  candidate_id: number;
  status: string;
  overall_score: number | null;
  recommendation: string | null;
  started_at: string | null;
  completed_at: string | null;
  job_title: string | null;
  candidate_name: string | null;
  total_questions: number;
  answered_questions: number;
}

export const interviewService = {
  /** Fetch approved questions for a job */
  getApprovedQuestions: async (jobId: number): Promise<{ questions: ApprovedQuestion[]; total: number }> => {
    const response = await apiClient.get(`/api/questions/approved/${jobId}`);
    return response.data;
  },

  /** Create a new interview session */
  createSession: async (jobId: number): Promise<InterviewSession> => {
    const response = await apiClient.post('/api/interview/sessions', { job_id: jobId });
    return response.data;
  },

  /** Get a specific session with answers */
  getSession: async (sessionId: number): Promise<InterviewSession> => {
    const response = await apiClient.get(`/api/interview/sessions/${sessionId}`);
    return response.data;
  },

  /** Get current candidate's sessions */
  getMySessions: async (): Promise<InterviewListItem[]> => {
    const response = await apiClient.get('/api/interview/sessions/candidate/me');
    return response.data;
  },

  /** Submit an answer for one question */
  submitAnswer: async (sessionId: number, questionId: number, answerText: string): Promise<InterviewAnswer> => {
    const response = await apiClient.post(`/api/interview/sessions/${sessionId}/answers`, {
      question_id: questionId,
      answer_text: answerText,
    });
    return response.data;
  },

  /** Complete the session — triggers scoring + recommendation */
  completeSession: async (sessionId: number): Promise<InterviewSession> => {
    const response = await apiClient.post(`/api/interview/sessions/${sessionId}/complete`);
    return response.data;
  },

  /** Get results for a scored session */
  getResults: async (sessionId: number): Promise<InterviewSession> => {
    const response = await apiClient.get(`/api/interview/sessions/${sessionId}/results`);
    return response.data;
  },

  /** List all interviews (recruiters see all, candidates see own) */
  listInterviews: async (): Promise<InterviewListItem[]> => {
    const response = await apiClient.get('/api/interviews');
    return response.data;
  },
};

export default interviewService;
