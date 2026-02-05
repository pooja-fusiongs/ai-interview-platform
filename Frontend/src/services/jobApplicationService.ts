/**
 * Job Application Service
 * Handles job application related API calls
 */

import { apiClient } from './api';

export interface ApplicationStatus {
  has_applied: boolean;
  application_id: number | null;
  application_date: string | null;
  status: string | null;
  applicant_name: string | null;
}

export interface JobApplicationData {
  job_id: number;
  applicant_name: string;
  applicant_email: string;
  applicant_phone?: string;
  resume_url?: string;
  cover_letter?: string;
  experience_years?: number;
  current_company?: string;
  current_position?: string;
  expected_salary?: string;
  availability?: string;
}

export const jobApplicationService = {
  // Check if user has already applied for a job
  checkApplicationStatus: async (jobId: number, email: string): Promise<ApplicationStatus> => {
    try {
      const response = await apiClient.get(`/api/job/${jobId}/check-application?email=${encodeURIComponent(email)}`);
      return response.data;
    } catch (error) {
      console.error('Error checking application status:', error);
      return {
        has_applied: false,
        application_id: null,
        application_date: null,
        status: null,
        applicant_name: null
      };
    }
  },

  // Submit job application
  submitApplication: async (applicationData: JobApplicationData) => {
    try {
      const response = await apiClient.post('/api/job/apply', applicationData);
      return response.data;
    } catch (error) {
      console.error('Error submitting application:', error);
      throw error;
    }
  },

  // Get all applications for a job
  getJobApplications: async (jobId: number) => {
    try {
      const response = await apiClient.get(`/api/job/${jobId}/applications`);
      return response.data;
    } catch (error) {
      console.error('Error fetching job applications:', error);
      throw error;
    }
  }
};