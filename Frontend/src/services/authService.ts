/**
 * Authentication Service
 * Handles all auth-related API calls
 */

import { apiClient } from './api';
import { User, SignupData } from '../types';

export const authService = {
  // Login user
  login: async (username: string, password: string) => {
    const response = await apiClient.post('/api/auth/login', {
      username,
      password
    });
    return response.data;
  },

  // Register user
  signup: async (userData: SignupData) => {
    const response = await apiClient.post('/api/auth/signup', userData);
    return response.data;
  },

  // Get current user
  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get('/api/auth/me');
    return response.data;
  },

  // Validate role
  validateRole: async (role: string) => {
    const response = await apiClient.get(`/api/auth/validate-role/${role}`);
    return response.data;
  },

  // Get role information
  getRoleInfo: async () => {
    const response = await apiClient.get('/api/auth/roles');
    return response.data;
  },

  // Change password
  changePassword: async (oldPassword: string, newPassword: string) => {
    const response = await apiClient.post('/api/auth/change-password', {
      old_password: oldPassword,
      new_password: newPassword
    });
    return response.data;
  }
};

export default authService;