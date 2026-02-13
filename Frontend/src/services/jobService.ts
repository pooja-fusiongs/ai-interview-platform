/**
 * Job Service
 * Handles all job-related API calls
 */

import { apiClient } from './api';
import { JobCreate,  } from '../types';

export const jobService = {
  // Get all jobs
  getJobs: async (params?: {
    skip?: number;
    limit?: number;
    status?: string;
    company?: string;
    job_type?: string;
    experience_level?: string;
  }) => {
    const response = await apiClient.get('/api/jobs', { params });
    return response.data;
  },

  // Get job by ID
  getJobById: async (jobId: number) => {
    const response = await apiClient.get(`/api/jobs/${jobId}`);
    return response.data;
  },

  // Create new job
  createJob: async (jobData: JobCreate) => {
    const response = await apiClient.post('/api/createJob', jobData);
    return response.data;
  },

  // Update job
  updateJob: async (jobId: number, jobData: Partial<JobCreate>) => {
    const response = await apiClient.put(`/api/jobs/${jobId}`, jobData);
    return response.data;
  },

  // Delete job
  deleteJob: async (jobId: number) => {
    const response = await apiClient.delete(`/api/jobs/${jobId}`);
    return response.data;
  },

  // Search jobs
  searchJobs: async (query: string, params?: { skip?: number; limit?: number }) => {
    const response = await apiClient.get('/api/jobs/search', {
      params: { q: query, ...params }
    });
    return response.data;
  },

  // Get jobs by company
  getJobsByCompany: async (companyName: string, params?: { skip?: number; limit?: number }) => {
    const response = await apiClient.get(`/api/jobs/company/${companyName}`, { params });
    return response.data;
  },

  // Get job statistics
  getJobStats: async () => {
    const response = await apiClient.get('/api/jobs/stats');
    return response.data;
  },

  // Apply for job
  applyForJob: async (applicationData: any) => {
    const response = await apiClient.post('/api/job/apply', applicationData);
    return response.data;
  },

  // Get job applications
  getJobApplications: async (jobId: number) => {
    const response = await apiClient.get(`/api/job/${jobId}/applications`);
    return response.data;
  }
};

export default jobService;