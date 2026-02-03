import apiClient from './api';

export const atsService = {
  createConnection: async (data: any) => {
    const response = await apiClient.post('/api/ats/connections', data);
    return response.data;
  },
  getConnections: async () => {
    const response = await apiClient.get('/api/ats/connections');
    return response.data;
  },
  getConnection: async (id: number) => {
    const response = await apiClient.get(`/api/ats/connections/${id}`);
    return response.data;
  },
  updateConnection: async (id: number, data: any) => {
    const response = await apiClient.put(`/api/ats/connections/${id}`, data);
    return response.data;
  },
  deleteConnection: async (id: number) => {
    const response = await apiClient.delete(`/api/ats/connections/${id}`);
    return response.data;
  },
  testConnection: async (id: number) => {
    const response = await apiClient.post(`/api/ats/connections/${id}/test`);
    return response.data;
  },
  triggerSync: async (connectionId: number, syncType: string = 'full') => {
    const response = await apiClient.post(`/api/ats/connections/${connectionId}/sync`, { sync_type: syncType });
    return response.data;
  },
  getSyncLogs: async (connectionId: number) => {
    const response = await apiClient.get(`/api/ats/connections/${connectionId}/sync-logs`);
    return response.data;
  },
  getJobMappings: async (connectionId: number) => {
    const response = await apiClient.get(`/api/ats/connections/${connectionId}/job-mappings`);
    return response.data;
  },
  getCandidateMappings: async (connectionId: number) => {
    const response = await apiClient.get(`/api/ats/connections/${connectionId}/candidate-mappings`);
    return response.data;
  },
};
