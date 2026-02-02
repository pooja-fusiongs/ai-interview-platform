/**
 * Candidate Profile Service
 * Handles candidate profile-related API calls
 */

import { apiClient } from './api';
import { CandidateProfileData } from '../types';

export const candidateProfileService = {
  // Get candidate profile
  getProfile: async (): Promise<CandidateProfileData> => {
    const response = await apiClient.get('/api/candidate/profile');
    // Handle the wrapped response structure {success: true, data: {...}}
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    return response.data;
  },

  // Update candidate profile
  updateProfile: async (profileData: Partial<CandidateProfileData>): Promise<void> => {
    const response = await apiClient.put('/api/candidate/profile', profileData);
    return response.data;
  },

  // Upload profile image
  uploadProfileImage: async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('profile_image', file);
    
    const response = await apiClient.post('/api/candidate/profile/image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.image_url;
  },

  // Upload resume
  uploadResume: async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('resume', file);
    
    const response = await apiClient.post('/api/candidate/profile/resume', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.resume_url;
  },

  // Download resume
  downloadResume: async (candidateId: number): Promise<void> => {
    const response = await apiClient.get(`/api/candidate/profile/resume/${candidateId}`, {
      responseType: 'blob',
    });
    
    // Create blob link to download
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'resume.pdf');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  // Get profile completion percentage
  getProfileCompletion: async (): Promise<number> => {
    const response = await apiClient.get('/api/candidate/profile/completion');
    return response.data.completion_percentage;
  },

  // Change password
  changePassword: async (oldPassword: string, newPassword: string): Promise<void> => {
    console.log('🔐 Attempting to change password...');
    try {
      const response = await apiClient.post('/api/auth/change-password', {
        old_password: oldPassword,
        new_password: newPassword
      });
      console.log('✅ Password change response:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Password change error:', error);
      throw error;
    }
  },

  // Get current user (for debugging)
  getCurrentUser: async (): Promise<any> => {
    const response = await apiClient.get('/api/auth/me');
    return response.data;
  }
};

export default candidateProfileService;