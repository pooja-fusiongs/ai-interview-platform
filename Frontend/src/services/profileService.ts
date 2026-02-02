/**
 * Profile Service
 * Handles profile-related API calls
 */

import { apiClient } from './api';
import { ProfileData } from '../types';

export const profileService = {
  // Get current user's profile
  getProfile: async (): Promise<ProfileData> => {
    const response = await apiClient.get('/api/profile');
    return response.data.data;
  },

  // Update current user's profile
  updateProfile: async (profileData: Partial<ProfileData>): Promise<void> => {
    const response = await apiClient.put('/api/profile', profileData);
    return response.data;
  }
};

export default profileService;