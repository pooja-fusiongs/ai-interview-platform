/**
 * API Service Layer
 * Centralized API calls and configuration
 */

import axios from 'axios';

// Configure axios base URL
const API_BASE_URL = 'http://localhost:8000';

// Create axios instance
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized access - remove token but don't redirect
      // Let the components handle the redirect through React Router
      localStorage.removeItem('token');
      delete apiClient.defaults.headers.common['Authorization'];
    }
    return Promise.reject(error);
  }
);

export default apiClient;