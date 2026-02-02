/**
 * Recruiter Service
 * API calls for the recruiter-driven interview flow
 */

import { apiClient } from './api';

export interface RecruiterCandidate {
  id: number;
  applicant_name: string;
  applicant_email: string;
  applicant_phone?: string;
  experience_years?: number;
  current_position?: string;
  status: string;
  applied_at: string;
  has_resume: boolean;
  resume_parsed: boolean;
  parsed_skills: string[];
  has_questions: boolean;
  questions_status: string;
  question_session_id?: number;
  has_transcript: boolean;
  has_scores: boolean;
  overall_score?: number;
  recommendation?: string;
  session_id?: number;
}

export interface TranscriptResult {
  session_id: number;
  status: string;
  overall_score: number;
  recommendation: string;
  strengths: string;
  weaknesses: string;
  candidate_name: string;
  job_title: string;
  answers: {
    id: number;
    question_id: number;
    question_text: string;
    sample_answer: string;
    answer_text: string;
    score: number;
    relevance_score: number;
    completeness_score: number;
    accuracy_score: number;
    clarity_score: number;
    feedback: string;
  }[];
}

export const recruiterService = {
  /** Add a candidate to a job with resume upload */
  addCandidate: async (jobId: number, formData: FormData): Promise<any> => {
    const response = await apiClient.post(
      `/api/recruiter/job/${jobId}/add-candidate`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },

  /** Get all candidates under a job with pipeline status */
  getCandidates: async (jobId: number): Promise<RecruiterCandidate[]> => {
    const response = await apiClient.get(`/api/recruiter/job/${jobId}/candidates`);
    return response.data;
  },

  /** Generate questions for a candidate (calls existing endpoint with live mode) */
  generateQuestions: async (jobId: number, candidateId: number): Promise<any> => {
    const response = await apiClient.post('/api/interview/generate-questions', {
      job_id: jobId,
      candidate_id: candidateId,
      generation_mode: 'live',
      total_questions: 10,
    });
    return response.data;
  },

  /** Submit interview transcript and trigger LLM scoring */
  submitTranscript: async (jobId: number, applicationId: number, transcriptText: string): Promise<TranscriptResult> => {
    const response = await apiClient.post(
      `/api/recruiter/job/${jobId}/candidate/${applicationId}/transcript`,
      { transcript_text: transcriptText }
    );
    return response.data;
  },

  /** Get all scored results for a job */
  getJobResults: async (jobId: number): Promise<any[]> => {
    const response = await apiClient.get(`/api/recruiter/job/${jobId}/results`);
    return response.data;
  },
};

export default recruiterService;
