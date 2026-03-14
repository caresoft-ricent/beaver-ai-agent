import client from './client';

// Auth
export const login = (data: { username: string; password: string }) =>
  client.post('/admin/auth/login', data);

export const initAdmin = (data: { username: string; password: string }) =>
  client.post('/admin/auth/init', data);

// Tenants
export const getTenants = (params?: { page?: number; size?: number }) =>
  client.get('/admin/tenants', { params });

export const createTenant = (data: { name: string; code: string; description?: string }) =>
  client.post('/admin/tenants', data);

export const updateTenant = (id: number, data: Record<string, unknown>) =>
  client.put(`/admin/tenants/${id}`, data);

export const deleteTenant = (id: number) =>
  client.delete(`/admin/tenants/${id}`);

// Connectors
export const getConnectors = (params?: { tenant_id?: number }) =>
  client.get('/admin/connectors', { params });

export const createConnector = (data: Record<string, unknown>) =>
  client.post('/admin/connectors', data);

export const updateConnector = (id: number, data: Record<string, unknown>) =>
  client.put(`/admin/connectors/${id}`, data);

export const deleteConnector = (id: number) =>
  client.delete(`/admin/connectors/${id}`);

export const testConnector = (id: number) =>
  client.post(`/admin/connectors/${id}/test`);

// LLM Configs
export const getLLMConfigs = (params?: { tenant_id?: number }) =>
  client.get('/admin/llm-configs', { params });

export const createLLMConfig = (data: Record<string, unknown>) =>
  client.post('/admin/llm-configs', data);

export const updateLLMConfig = (id: number, data: Record<string, unknown>) =>
  client.put(`/admin/llm-configs/${id}`, data);

export const deleteLLMConfig = (id: number) =>
  client.delete(`/admin/llm-configs/${id}`);

export const testLLMConfig = (id: number) =>
  client.post(`/admin/llm-configs/${id}/test`);

// Entities (Ontology)
export const getEntities = (params?: { tenant_id?: number }) =>
  client.get('/admin/ontologies/entities', { params });

export const createEntity = (data: Record<string, unknown>) =>
  client.post('/admin/ontologies/entities', data);

export const getEntity = (id: number) =>
  client.get(`/admin/ontologies/entities/${id}`);

export const updateEntity = (id: number, data: Record<string, unknown>) =>
  client.put(`/admin/ontologies/entities/${id}`, data);

export const deleteEntity = (id: number) =>
  client.delete(`/admin/ontologies/entities/${id}`);

export const publishEntity = (id: number) =>
  client.post(`/admin/ontologies/entities/${id}/publish`);

// Skills (Intent)
export const getSkills = (params?: { tenant_id?: number }) =>
  client.get('/admin/intents/skills', { params });

export const createSkill = (data: Record<string, unknown>) =>
  client.post('/admin/intents/skills', data);

export const getSkill = (id: number) =>
  client.get(`/admin/intents/skills/${id}`);

export const updateSkill = (id: number, data: Record<string, unknown>) =>
  client.put(`/admin/intents/skills/${id}`, data);

export const deleteSkill = (id: number) =>
  client.delete(`/admin/intents/skills/${id}`);

export const publishSkill = (id: number) =>
  client.post(`/admin/intents/skills/${id}/publish`);
