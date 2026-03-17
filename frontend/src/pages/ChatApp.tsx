/**
 * H5独立Chat页面 — 移动端直接访问
 * 路由: /chat/app?tenant_id=1&customer_id=C001
 * 无需登录，全屏对话界面，适配移动端浏览器
 */
import { useSearchParams } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import ChatPage from './ChatPage';

export default function ChatApp() {
  const [params] = useSearchParams();
  const tenantId = Number(params.get('tenant_id') || '1');
  const customerId = params.get('customer_id') || 'C001';

  return (
    <ConfigProvider locale={zhCN} theme={{ algorithm: theme.defaultAlgorithm }}>
      <div style={{ height: '100dvh', overflow: 'hidden' }}>
        <ChatPage embedMode tenantId={tenantId} customerId={customerId} />
      </div>
    </ConfigProvider>
  );
}
