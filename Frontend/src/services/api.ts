/**
 * API Service Layer
 * Centralized API calls and configuration
 */

import axios from 'axios';
import toast from 'react-hot-toast';

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

// Flag to prevent multiple redirects/toasts
let isRedirecting = false;

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
      // Check if this is a login request - don't redirect for login failures
      const isLoginRequest = error.config?.url?.includes('/auth/login');

      if (!isLoginRequest && !isRedirecting) {
        isRedirecting = true;

        // Clear auth data
        localStorage.removeItem('token');
        delete apiClient.defaults.headers.common['Authorization'];

        // Show toast message
        toast.error('Your session has expired. Please login again.', {
          duration: 4000,
          icon: '🔒',
          style: {
            borderRadius: '10px',
            background: '#1e293b',
            color: '#fff',
          },
        });

        // Redirect to login page after a short delay
        setTimeout(() => {
          window.location.href = '/login';
          isRedirecting = false;
        }, 1000);
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;