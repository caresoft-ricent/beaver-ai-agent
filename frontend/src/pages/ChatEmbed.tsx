/**
 * 独立Chat页面 — 用于 iframe 嵌入
 * 路由: /chat-embed?tenant_id=1&customer_id=C001
 * 无需登录，不含 AdminLayout
 */
import { useSearchParams } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import ChatPage from './ChatPage';

export default function ChatEmbed() {
  const [params] = useSearchParams();
  const tenantId = Number(params.get('tenant_id') || '1');
  const customerId = params.get('customer_id') || 'C001';

  return (
    <ConfigProvider locale={zhCN} theme={{ algorithm: theme.defaultAlgorithm }}>
      <div style={{ height: '100vh', overflow: 'hidden' }}>
        <ChatPage embedMode tenantId={tenantId} customerId={customerId} />
      </div>
    </ConfigProvider>
  );
}
