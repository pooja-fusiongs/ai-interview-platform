/**
 * Question Generation Service
 * Handles AI question generation and expert review workflow
 */

import apiClient from './api';

export interface QuestionGenerateRequest {
  job_id: number;
  candidate_id: number;
  generation_mode?: string;
  total_questions?: number;
}

export interface InterviewQuestion {
  id: number;
  question_text: string;
  sample_answer: string;
  question_type: string;
  difficulty: string;
  skill_focus?: string;
  job_id: number;
  candidate_id: number;
  generation_mode: string;
  is_approved: boolean;
  expert_reviewed: boolean;
  expert_notes?: string;
  reviewed_by?: number;
  reviewed_at?: string;
  created_at: string;
}

export interface QuestionGenerationSession {
  id: number;
  job_id: number;
  candidate_id: number;
  generation_mode: string;
  total_questions: number;
  approved_questions: number;
  status: string;
  expert_review_status: string;
  generated_at?: string;
  created_at: string;
  questions: InterviewQuestion[];
}

export interface ExpertReviewRequest {
  question_id: number;
  is_approved: boolean;
  expert_notes?: string;
  updated_question?: string;
  updated_answer?: string;
}

export interface QuestionUpdateRequest {
  question_text?: string;
  sample_answer?: string;
  question_type?: string;
  difficulty?: string;
  skill_focus?: string;
  is_approved?: boolean;
  expert_notes?: string;
}

class QuestionGenerationService {
  /**
   * Generate AI questions for a job candidate
   */
  async generateQuestions(request: QuestionGenerateRequest) {
    try {
      const response = await apiClient.post('/api/interview/generate-questions', {
        job_id: request.job_id,
        candidate_id: request.candidate_id,
        generation_mode: request.generation_mode || 'preview',
        total_questions: request.total_questions || 10
      });
      return response.data;
    } catch (error: any) {
      console.error('Error generating questions:', error);
      throw new Error(error.response?.data?.detail || 'Failed to generate questions');
    }
  }

  /**
   * Regenerate AI questions for a job candidate (deletes existing and creates new)
   */
  async regenerateQuestions(request: QuestionGenerateRequest) {
    try {
      const response = await apiClient.post('/api/interview/regenerate-questions', {
        job_id: request.job_id,
        candidate_id: request.candidate_id,
        generation_mode: request.generation_mode || 'preview',
        total_questions: request.total_questions || 10
      });
      return response.data;
    } catch (error: any) {
      console.error('Error regenerating questions:', error);
      throw new Error(error.response?.data?.detail || 'Failed to regenerate questions');
    }
  }

  /**
   * Get question generation session with questions
   */
  async getGenerationSession(sessionId: number): Promise<QuestionGenerationSession> {
    try {
      const response = await apiClient.get(`/api/interview/sessions/${sessionId}`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching generation session:', error);
      throw new Error(error.response?.data?.detail || 'Failed to fetch generation session');
    }
  }

  /**
   * Get questions for a specific job-candidate combination
   */
  async getCandidateQuestions(jobId: number, candidateId: number): Promise<InterviewQuestion[]> {
    try {
      const response = await apiClient.get(`/api/interview/job/${jobId}/candidate/${candidateId}/questions`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching candidate questions:', error);
      throw new Error(error.response?.data?.detail || 'Failed to fetch candidate questions');
    }
  }

  /**
   * Update a question (for expert review)
   */
  async updateQuestion(questionId: number, updateData: QuestionUpdateRequest): Promise<InterviewQuestion> {
    try {
      const response = await apiClient.put(`/api/interview/questions/${questionId}`, updateData);
      return response.data;
    } catch (error: any) {
      console.error('Error updating question:', error);
      throw new Error(error.response?.data?.detail || 'Failed to update question');
    }
  }

  /**
   * Expert review and approval of questions
   */
  async expertReviewQuestion(review: ExpertReviewRequest) {
    try {
      const response = await apiClient.post('/api/interview/expert-review', review);
      return response.data;
    } catch (error: any) {
      console.error('Error reviewing question:', error);
      throw new Error(error.response?.data?.detail || 'Failed to review question');
    }
  }

  /**
   * Get all sessions pending expert review
   */
  async getPendingReviews(): Promise<QuestionGenerationSession[]> {
    try {
      const response = await apiClient.get('/api/interview/pending-reviews');
      return response.data;
    } catch (error: any) {
      console.error('Error fetching pending reviews:', error);
      throw new Error(error.response?.data?.detail || 'Failed to fetch pending reviews');
    }
  }

  /**
   * Check if questions are generated for a candidate
   */
  async checkQuestionsGenerated(jobId: number, candidateId: number): Promise<boolean> {
    try {
      const questions = await this.getCandidateQuestions(jobId, candidateId);
      return questions.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get question generation status for a job-candidate pair
   */
  async getGenerationStatus(jobId: number, candidateId: number) {
    try {
      const questions = await this.getCandidateQuestions(jobId, candidateId);
      
      if (questions.length === 0) {
        return {
          status: 'not_generated',
          total_questions: 0,
          approved_questions: 0,
          expert_review_status: 'pending'
        };
      }

      const approvedCount = questions.filter(q => q.is_approved).length;
      const reviewedCount = questions.filter(q => q.expert_reviewed).length;
      
      let expertReviewStatus = 'pending';
      if (reviewedCount === questions.length) {
        expertReviewStatus = 'completed';
      } else if (reviewedCount > 0) {
        expertReviewStatus = 'in_review';
      }

      return {
        status: 'generated',
        total_questions: questions.length,
        approved_questions: approvedCount,
        expert_review_status: expertReviewStatus,
        questions
      };
    } catch (error) {
      return {
        status: 'error',
        total_questions: 0,
        approved_questions: 0,
        expert_review_status: 'pending'
      };
    }
  }

  /**
   * Get job applications for a specific job
   */
  async getJobApplications(jobId: number) {
    try {
      const response = await apiClient.get(`/api/job/${jobId}/applications`);
      return response;
    } catch (error: any) {
      console.error('Error fetching job applications:', error);
      throw new Error(error.response?.data?.detail || 'Failed to fetch job applications');
    }
  }

  /**
   * Get all question sets for review
   */
  async getQuestionSets() {
    try {
      // Try the authenticated endpoint first
      const response = await apiClient.get('/api/interview/question-sets');
      return response;
    } catch (error: any) {
      console.error('Error fetching question sets (authenticated):', error);
      
      // Fallback to test endpoint if authentication fails
      try {
        const response = await apiClient.get('/api/interview/question-sets-test');
        return response;
      } catch (fallbackError: any) {
        console.error('Error fetching question sets (test endpoint):', fallbackError);
        // Return mock data for preview mode
        return {
          data: []
        };
      }
    }
  }

  /**
   * Get version history for a specific question
   */
  async getQuestionHistory(questionId: number) {
    try {
      const response = await apiClient.get(`/api/interview/questions/${questionId}/history`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching question history:', error);
      return [];
    }
  }
}



export const questionGenerationService = new QuestionGenerationService();
export default questionGenerationService;