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
  resume?: File;  // Added for file upload
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

  // Submit job application with resume file upload
  submitApplication: async (applicationData: JobApplicationData) => {
    try {
      // If there's a resume file, use FormData with the new endpoint
      if (applicationData.resume) {
        const formData = new FormData();
        formData.append('job_id', applicationData.job_id.toString());
        formData.append('applicant_name', applicationData.applicant_name);
        formData.append('applicant_email', applicationData.applicant_email);
        formData.append('applicant_phone', applicationData.applicant_phone || '');
        formData.append('experience_years', (applicationData.experience_years || 0).toString());
        formData.append('current_company', applicationData.current_company || '');
        formData.append('current_position', applicationData.current_position || '');
        formData.append('cover_letter', applicationData.cover_letter || '');
        formData.append('expected_salary', applicationData.expected_salary || '');
        formData.append('availability', applicationData.availability || '');
        formData.append('resume', applicationData.resume);

        const response = await apiClient.post('/api/job/apply-with-resume', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        return response.data;
      } else {
        // No resume file, use regular JSON endpoint
        const response = await apiClient.post('/api/job/apply', applicationData);
        return response.data;
      }
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