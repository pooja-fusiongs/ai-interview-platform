/**
 * Toast Utility Functions
 * Centralized toast notifications with consistent styling
 */

import toast from 'react-hot-toast';

// Success toast
export const showSuccess = (message: string, options?: any) => {
  return toast.success(message, {
    duration: 3000,
    ...options,
  });
};

// Error toast
export const showError = (message: string, options?: any) => {
  return toast.error(message, {
    duration: 5000,
    ...options,
  });
};

// Loading toast
export const showLoading = (message: string = 'Loading...', options?: any) => {
  return toast.loading(message, {
    ...options,
  });
};

// Info toast (custom)
export const showInfo = (message: string, options?: any) => {
  return toast(message, {
    icon: 'ℹ️',
    duration: 4000,
    style: {
      background: '#eff6ff',
      color: '#1e40af',
      border: '1px solid #dbeafe',
    },
    ...options,
  });
};

// Warning toast (custom)
export const showWarning = (message: string, options?: any) => {
  return toast(message, {
    icon: '⚠️',
    duration: 4000,
    style: {
      background: '#fffbeb',
      color: '#d97706',
      border: '1px solid #fed7aa',
    },
    ...options,
  });
};

// Dismiss specific toast
export const dismissToast = (toastId: string) => {
  toast.dismiss(toastId);
};

// Dismiss all toasts
export const dismissAllToasts = () => {
  toast.dismiss();
};

// Promise toast - shows loading, then success/error
export const showPromiseToast = (
  promise: Promise<any>,
  messages: {
    loading: string;
    success: string;
    error: string;
  },
  options?: any
) => {
  return toast.promise(
    promise,
    {
      loading: messages.loading,
      success: messages.success,
      error: messages.error,
    },
    {
      ...options,
    }
  );
};

// Custom toast with custom styling
export const showCustomToast = (
  message: string,
  type: 'success' | 'error' | 'loading' | 'info' | 'warning' = 'info',
  options?: any
) => {
  switch (type) {
    case 'success':
      return showSuccess(message, options);
    case 'error':
      return showError(message, options);
    case 'loading':
      return showLoading(message, options);
    case 'warning':
      return showWarning(message, options);
    case 'info':
    default:
      return showInfo(message, options);
  }
};

// Form submission toast helper
export const handleFormSubmission = async (
  submitFunction: () => Promise<any>,
  messages: {
    loading?: string;
    success?: string;
    error?: string;
  } = {}
) => {
  const loadingToast = showLoading(messages.loading || 'Submitting...');
  
  try {
    const result = await submitFunction();
    toast.dismiss(loadingToast);
    showSuccess(messages.success || 'Form submitted successfully!');
    return result;
  } catch (error: any) {
    toast.dismiss(loadingToast);
    showError(messages.error || error.message || 'An error occurred');
    throw error;
  }
};

// API call toast helper
export const handleApiCall = async (
  apiFunction: () => Promise<any>,
  messages: {
    loading?: string;
    success?: string;
    error?: string;
  } = {}
) => {
  const loadingToast = showLoading(messages.loading || 'Processing...');
  
  try {
    const result = await apiFunction();
    toast.dismiss(loadingToast);
    if (messages.success) {
      showSuccess(messages.success);
    }
    return result;
  } catch (error: any) {
    toast.dismiss(loadingToast);
    showError(messages.error || error.message || 'An error occurred');
    throw error;
  }
};