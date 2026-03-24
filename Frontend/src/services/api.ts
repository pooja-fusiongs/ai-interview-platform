/**
 * API Service Layer
 * Centralized API calls and configuration with auto token refresh
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
// NOTE: Do NOT set default Content-Type — it breaks FormData uploads (recording upload)
// Axios auto-sets Content-Type: application/json for objects and multipart/form-data for FormData
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});

// Flags and queues for token refresh
let isRedirecting = false;
let isRefreshing = false;
let failedQueue: any[] = [];

// Check if user is in active interview
const isInActiveInterview = (): boolean => {
  const path = window.location.pathname;
  return path.includes('/video-room') || path.includes('/video-interview-room');
};

// Process queued requests after token refresh
const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Refresh token function
const refreshAccessToken = async (): Promise<string | null> => {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {}, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    const newToken = response.data.access_token;
    if (newToken) {
      localStorage.setItem('token', newToken);
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      console.log('✅ Token refreshed successfully');
      return newToken;
    }
    return null;
  } catch (error) {
    console.error('❌ Token refresh failed:', error);
    return null;
  }
};

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

// Response interceptor for error handling with auto-refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 errors (token expired)
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Check if this is a login request - don't refresh for login failures
      const isLoginRequest = error.config?.url?.includes('/auth/login');
      
      if (isLoginRequest) {
        return Promise.reject(error);
      }

      // If user is in active interview, try to refresh token silently
      if (isInActiveInterview()) {
        if (isRefreshing) {
          // If already refreshing, queue this request
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then(token => {
            originalRequest.headers['Authorization'] = 'Bearer ' + token;
            return apiClient(originalRequest);
          }).catch(err => {
            return Promise.reject(err);
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const newToken = await refreshAccessToken();
          
          if (newToken) {
            processQueue(null, newToken);
            originalRequest.headers['Authorization'] = 'Bearer ' + newToken;
            return apiClient(originalRequest);
          } else {
            // Refresh failed - show warning but DON'T redirect during interview
            processQueue(new Error('Token refresh failed'), null);
            toast.error('Session expired. Please save your progress and re-login after interview.', {
              duration: 8000,
              icon: '⚠️',
              style: {
                borderRadius: '10px',
                background: '#fef3c7',
                color: '#92400e',
                border: '2px solid #fde68a'
              },
            });
            return Promise.reject(error);
          }
        } catch (refreshError) {
          processQueue(refreshError, null);
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      } else {
        // Not in interview - normal redirect behavior
        if (!isRedirecting) {
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
    }
    return Promise.reject(error);
  }
);

export default apiClient;
