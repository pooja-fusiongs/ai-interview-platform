/**
 * Candidate Service
 * Handles all candidate-related API calls
 */

import { apiClient } from './api';

export interface CandidateMatchResponse {
  id: number;
  name: string;
  email: string;
  phone?: string;
  location?: string;
  category: string;
  matchScore: number;
  education?: string;
  jobTitle: string;
  skills: string[];
  industry: string;
  languages: string[];
  resumeId?: number;
  hasResume: boolean;
  appliedAt: string;
  status: string; // Add status field
}

export interface CandidateFilters {
  matchScoreMin?: number;
  matchScoreMax?: number;
  candidateName?: string;
  email?: string;
  location?: string;
  category?: string;
}

export const candidateService = {
  // Get all candidates
  getCandidates: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    filters?: CandidateFilters;
  }) => {
    const response = await apiClient.get('/api/candidates', { params: {
      ...params,
      filters: params?.filters ? JSON.stringify(params.filters) : undefined
    }});
    return response.data;
  },

  // Get candidates for a specific job
  getCandidatesByJob: async (jobId: number, params?: {
    page?: number;
    limit?: number;
    search?: string;
    filters?: CandidateFilters;
  }) => {
    const response = await apiClient.get('/api/candidates/candidates', {
      params: {
        job_id: jobId,
        ...params,
        filters: params?.filters ? JSON.stringify(params.filters) : undefined
      }
    });
    return response.data;
  },

  // Get candidate by ID
  getCandidateById: async (candidateId: number) => {
    const response = await apiClient.get(`/api/candidates/${candidateId}`);
    return response.data;
  },

  // Get candidate resume
  getCandidateResume: async (resumeId: number) => {
    const response = await apiClient.get(`/api/resume/view/${resumeId}`);
    return response.data;
  },

  // Update candidate status (shortlist/reject)
  updateCandidateStatus: async (candidateId: number, status: 'shortlist' | 'reject') => {
    const response = await apiClient.post(`/api/candidates/${candidateId}/status`, { status });
    return response.data;
  },

  // Bulk update candidate status
  bulkUpdateCandidateStatus: async (candidateIds: number[], status: 'shortlist' | 'reject') => {
    const response = await apiClient.post('/api/candidates/bulk-status', { 
      candidate_ids: candidateIds, 
      status 
    });
    return response.data;
  },

  // Calculate detailed match score
  calculateDetailedMatchScore: async (candidateId: number, jobId: number, filters?: {
    education?: number;
    jobTitle?: number;
    skills?: number;
    industry?: number;
    language?: number;
  }) => {
    const response = await apiClient.post('/api/candidates/matching/calculate-match', {
      candidate_id: candidateId,
      job_id: jobId,
      filters: filters || {
        education: 25,
        jobTitle: 30,
        skills: 35,
        industry: 20,
        language: 15
      }
    });
    return response.data;
  }
};