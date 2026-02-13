import apiClient from './api';

export const gdprService = {
  grantConsent: async (consentType: string, consentText: string) => {
    const response = await apiClient.post('/api/gdpr/consent', { consent_type: consentType, consent_text: consentText });
    return response.data;
  },
  getMyConsents: async () => {
    const response = await apiClient.get('/api/gdpr/consent/me');
    return response.data;
  },
  checkConsent: async (consentType: string) => {
    const response = await apiClient.get(`/api/gdpr/consent/check/${consentType}`);
    return response.data;
  },
  revokeConsent: async (consentId: number) => {
    const response = await apiClient.put(`/api/gdpr/consent/${consentId}/revoke`);
    return response.data;
  },
  requestDeletion: async (reason?: string) => {
    const response = await apiClient.post('/api/gdpr/deletion-request', { request_type: 'full_erasure', reason });
    return response.data;
  },
  getMyDeletionRequests: async () => {
    const response = await apiClient.get('/api/gdpr/deletion-requests/me');
    return response.data;
  },
  requestDataExport: async (format: string = 'json') => {
    const response = await apiClient.post('/api/gdpr/data-export', { export_format: format });
    return response.data;
  },
  getMyExportRequests: async () => {
    const response = await apiClient.get('/api/gdpr/data-export/me');
    return response.data;
  },
  downloadExport: async (requestId: number) => {
    const response = await apiClient.get(`/api/gdpr/data-export/${requestId}/download`, { responseType: 'blob' });
    return response.data;
  },
  getAuditLogs: async (filters?: any) => {
    const response = await apiClient.get('/api/gdpr/audit-logs', { params: filters });
    return response.data;
  },
  getRetentionPolicies: async () => {
    const response = await apiClient.get('/api/gdpr/retention-policies');
    return response.data;
  },
  createRetentionPolicy: async (data: any) => {
    const response = await apiClient.post('/api/gdpr/retention-policies', data);
    return response.data;
  },
  updateRetentionPolicy: async (id: number, data: any) => {
    const response = await apiClient.put(`/api/gdpr/retention-policies/${id}`, data);
    return response.data;
  },
  getDeletionRequests: async () => {
    const response = await apiClient.get('/api/gdpr/deletion-requests');
    return response.data;
  },
  processDeletionRequest: async (requestId: number) => {
    const response = await apiClient.post(`/api/gdpr/deletion-requests/${requestId}/process`);
    return response.data;
  },
  getPrivacyNotice: async () => {
    const response = await apiClient.get('/api/gdpr/privacy-notice');
    return response.data;
  },
};

export default gdprService;
