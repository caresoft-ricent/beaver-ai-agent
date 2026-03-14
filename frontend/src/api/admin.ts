import client from './client';

// Auth
export const login = (data: { username: string; password: string }) =>
  client.post('/admin/auth/login', data);

export const initAdmin = (data: { username: string; password: string }) =>
  client.post('/admin/auth/init', data);

export const changePassword = (data: { old_password: string; new_password: string }) =>
  client.post('/admin/auth/change-password', data);

// Chat Sessions
export const deleteSession = (sessionId: string) =>
  client.delete(`/v1/chat/sessions/${sessionId}`);

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
  client.get('/admin/intents', { params });

export const createSkill = (data: Record<string, unknown>) =>
  client.post('/admin/intents', data);

export const getSkill = (id: number) =>
  client.get(`/admin/intents/${id}`);

export const updateSkill = (id: number, data: Record<string, unknown>) =>
  client.put(`/admin/intents/${id}`, data);

export const deleteSkill = (id: number) =>
  client.delete(`/admin/intents/${id}`);

export const publishSkill = (id: number) =>
  client.post(`/admin/intents/${id}/publish`);

// Skill Tools
export const getSkillTools = (skillId: number) =>
  client.get(`/admin/intents/${skillId}`);

export const createSkillTool = (skillId: number, data: Record<string, unknown>) =>
  client.post(`/admin/intents/${skillId}/tools`, data);

export const deleteSkillTool = (toolId: number) =>
  client.delete(`/admin/intents/tools/${toolId}`);

// Actions
export const getActions = (entityId: number) =>
  client.get(`/admin/ontologies/entities/${entityId}/actions`);

export const createAction = (entityId: number, data: Record<string, unknown>) =>
  client.post(`/admin/ontologies/entities/${entityId}/actions`, data);

export const deleteAction = (actionId: number) =>
  client.delete(`/admin/ontologies/actions/${actionId}`);

// Entity Properties
export const createEntityProperty = (entityId: number, data: Record<string, unknown>) =>
  client.post(`/admin/ontologies/entities/${entityId}/properties`, data);

export const deleteEntityProperty = (propertyId: number) =>
  client.delete(`/admin/ontologies/properties/${propertyId}`);

export const updateEntityProperty = (propertyId: number, data: Record<string, unknown>) =>
  client.put(`/admin/ontologies/properties/${propertyId}`, data);

// Normalization Rules
export const getNormalizationRules = (params?: { category?: string; domain?: string; tenant_id?: number; is_active?: boolean; page?: number; size?: number }) =>
  client.get('/admin/normalization', { params });

export const getNormalizationCategories = () =>
  client.get('/admin/normalization/categories');

export const createNormalizationRule = (data: Record<string, unknown>) =>
  client.post('/admin/normalization', data);

export const updateNormalizationRule = (id: number, data: Record<string, unknown>) =>
  client.put(`/admin/normalization/${id}`, data);

export const deleteNormalizationRule = (id: number) =>
  client.delete(`/admin/normalization/${id}`);

export const initNormalizationRules = (tenantId: number = 0) =>
  client.post('/admin/normalization/initialize', null, { params: { tenant_id: tenantId } });
