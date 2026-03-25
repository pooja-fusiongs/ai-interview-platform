/**
 * Rating Service - Merged from client's iHire codebase
 * Handles interview ratings, transcript scoring, and report card APIs
 */

import { apiClient } from './api';

export interface Rating {
  id: number;
  question_id: number;
  rating: number;
  notes: string | null;
  created_at: string;
}

export interface TranscriptScoreResponse {
  ai_score: number;
  final_score: number;
  ai_feedback: string;
  report_card?: InterviewReportCard | null;
}

export interface InterviewReportCard {
  scores: ReportCardScoreItem[];
  performed_well: string[];
  areas_to_improve: string[];
  transcript_qa: TranscriptQAItem[];
}

export interface ReportCardScoreItem {
  label: string;
  score: number | null;
}

export interface TranscriptQAItem {
  question: string;
  answer_summary: string;
}

export interface QuestionWithRating {
  id: number;
  question_text: string;
  suggested_answer: string | null;
  category: string | null;
  difficulty: string | null;
  order_number: number;
  rating: number | null;
  notes: string | null;
}

export interface InterviewSummary {
  candidate_id: number;
  candidate_name: string;
  candidate_email: string | null;
  position_title: string;
  position_company: string | null;
  interview_datetime: string | null;
  duration_minutes: number | null;
  total_questions: number;
  rated_questions: number;
  average_score: number | null;
  overall_score: number | null;
  ai_score: number | null;
  final_score: number | null;
  report_card: InterviewReportCard | null;
  questions: QuestionWithRating[];
}

export const ratingService = {
  /** Rate a question (1-10) */
  rateQuestion: async (
    jobId: number,
    candidateId: number,
    questionId: number,
    data: { rating: number; notes?: string }
  ): Promise<Rating> => {
    const response = await apiClient.post(
      `/api/jobs/${jobId}/candidates/${candidateId}/questions/${questionId}/rate`,
      data,
      { timeout: 10000 }
    );
    return response.data;
  },

  /** Update an existing rating */
  updateRating: async (
    jobId: number,
    candidateId: number,
    questionId: number,
    data: { rating?: number; notes?: string }
  ): Promise<Rating> => {
    const response = await apiClient.put(
      `/api/jobs/${jobId}/candidates/${candidateId}/questions/${questionId}/rate`,
      data,
      { timeout: 10000 }
    );
    return response.data;
  },

  /** Get interview summary with all ratings */
  getSummary: async (
    jobId: number,
    candidateId: number
  ): Promise<InterviewSummary> => {
    const response = await apiClient.get(
      `/api/jobs/${jobId}/candidates/${candidateId}/summary`,
      { timeout: 30000 }
    );
    return response.data;
  },

  /** Finalize report card from recruiter ratings after interview ends */
  finalizeReport: async (
    jobId: number,
    candidateId: number
  ): Promise<any> => {
    const response = await apiClient.post(
      `/api/jobs/${jobId}/candidates/${candidateId}/finalize-report`,
      {},
      { timeout: 30000 }
    );
    return response.data;
  },

  /** Submit transcript for AI scoring */
  submitTranscript: async (
    jobId: number,
    candidateId: number,
    data: FormData
  ): Promise<TranscriptScoreResponse> => {
    const response = await apiClient.post(
      `/api/jobs/${jobId}/candidates/${candidateId}/transcript`,
      data,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000, // 3 min for AI processing
      }
    );
    return response.data;
  },
};

export default ratingService;
