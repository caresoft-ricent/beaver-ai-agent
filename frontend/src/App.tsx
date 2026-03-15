import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import AdminLayout from './layouts/AdminLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TenantList from './pages/TenantList';
import ConnectorList from './pages/ConnectorList';
import LLMConfigList from './pages/LLMConfigList';
import EntityList from './pages/EntityList';
import SkillList from './pages/SkillList';
import ChatPage from './pages/ChatPage';
import ChatEmbed from './pages/ChatEmbed';
import LogsPage from './pages/LogsPage';
import NormalizationPage from './pages/NormalizationPage';
import WorkflowPage from './pages/WorkflowPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/chat-embed" element={<ChatEmbed />} />
          <Route path="/intents/:id/workflow" element={<ProtectedRoute><WorkflowPage /></ProtectedRoute>} />
          <Route path="/" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="tenants" element={<TenantList />} />
            <Route path="connectors" element={<ConnectorList />} />
            <Route path="llm" element={<LLMConfigList />} />
            <Route path="ontology" element={<EntityList />} />
            <Route path="intents" element={<SkillList />} />
            <Route path="normalization" element={<NormalizationPage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="chat" element={<ChatPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}

export default App;

