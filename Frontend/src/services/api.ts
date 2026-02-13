/**
 * API Service Layer
 * Centralized API calls and configuration
 */

import axios from 'axios';
import toast from 'react-hot-toast';

// Configure axios base URL - uses environment variable or falls back to production URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://ai-interview-platform-2bov.onrender.com';

// Log current API configuration (only in development)
if (import.meta.env.DEV) {
  console.log('🔧 API Configuration:', {
    mode: import.meta.env.MODE,
    baseURL: API_BASE_URL,
    isDevelopment: import.meta.env.DEV,
    isProduction: import.meta.env.PROD
  });
}

// Create axios instance
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // Increased to 60 seconds to prevent premature cancellation
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