import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Layout, Input, Button, List, Typography, Space, Spin, Tag, Empty, theme, Popconfirm, message,
} from 'antd';
import {
  SendOutlined, PlusOutlined, MessageOutlined, UserOutlined, RobotOutlined, DeleteOutlined,
} from '@ant-design/icons';
import client from '../api/client';
import { deleteSession } from '../api/admin';

const { Sider, Content } = Layout;
const { Text, Paragraph } = Typography;

/* ───── Types ───── */
interface Message {
  role: 'user' | 'assistant';
  content: string;
  intent?: string;
  created_at?: string;
}

interface Session {
  session_id: string;
  customer_id: string;
  customer_name?: string;
  message_count: number;
  created_at?: string;
}

/* ───── Constants ───── */
const TENANT_ID = 1;
const CUSTOMER_ID = 'C001';

export default function ChatPage() {
  const { token: themeToken } = theme.useToken();

  /* ─── State ─── */
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<any>(null);

  /* ─── Load sessions ─── */
  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await client.get('/v1/chat/sessions', { params: { tenant_id: TENANT_ID } });
      setSessions(res.data?.data?.items ?? []);
    } catch { /* ignore */ }
    setLoadingSessions(false);
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  /* ─── Load history when session changes ─── */
  useEffect(() => {
    if (!activeSession) { setMessages([]); return; }
    (async () => {
      try {
        const res = await client.get(`/v1/chat/sessions/${activeSession}/history`);
        setMessages(res.data?.data ?? []);
      } catch { setMessages([]); }
    })();
  }, [activeSession]);

  /* ─── Auto scroll ─── */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* ─── New conversation ─── */
  const handleNewChat = () => {
    setActiveSession(null);
    setMessages([]);
    setInputValue('');
    inputRef.current?.focus();
  };

  /* ─── Delete session ─── */
  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteSession(sessionId);
      message.success('会话已删除');
      if (activeSession === sessionId) {
        setActiveSession(null);
        setMessages([]);
      }
      loadSessions();
    } catch {
      message.error('删除失败');
    }
  };

  /* ─── Send message ─── */
  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || sending) return;

    // Optimistic user message
    const userMsg: Message = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setSending(true);

    try {
      const res = await client.post('/v1/chat/completions', {
        tenant_id: TENANT_ID,
        customer_id: CUSTOMER_ID,
        session_id: activeSession || undefined,
        message: text,
      });
      const data = res.data?.data;
      if (data) {
        // Set session id if new
        if (!activeSession && data.session_id) {
          setActiveSession(data.session_id);
        }
        const aiMsg: Message = {
          role: 'assistant',
          content: data.reply,
          intent: data.intent,
        };
        setMessages((prev) => [...prev, aiMsg]);
      }
      // Refresh session list
      loadSessions();
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '网络异常，请稍后重试。' },
      ]);
    }
    setSending(false);
    inputRef.current?.focus();
  };

  /* ─── Key handler ─── */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* ─── Render ─── */
  return (
    <Layout style={{ height: 'calc(100vh - 112px)', margin: '-24px', background: 'transparent', overflow: 'hidden' }}>
      {/* --- Session sidebar --- */}
      <Sider
        width={260}
        style={{
          background: themeToken.colorBgContainer,
          borderRight: `1px solid ${themeToken.colorBorderSecondary}`,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: 12 }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            block
            onClick={handleNewChat}
          >
            新建对话
          </Button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '0 4px' }}>
          {loadingSessions ? (
            <Spin style={{ display: 'block', marginTop: 40, textAlign: 'center' }} />
          ) : (
            <List
              dataSource={sessions}
              locale={{ emptyText: <Empty description="暂无会话" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              renderItem={(s) => (
                <List.Item
                  onClick={() => setActiveSession(s.session_id)}
                  style={{
                    cursor: 'pointer',
                    padding: '8px 12px',
                    borderRadius: 6,
                    marginBottom: 2,
                    background:
                      s.session_id === activeSession
                        ? themeToken.colorPrimaryBg
                        : 'transparent',
                  }}
                >
                  <Space direction="vertical" size={0} style={{ width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Space>
                        <MessageOutlined />
                        <Text ellipsis style={{ maxWidth: 140 }}>
                          {s.customer_name || s.customer_id}
                        </Text>
                      </Space>
                      <Popconfirm
                        title="确定删除该会话？"
                        description="删除后不可恢复"
                        onConfirm={(e) => handleDeleteSession(s.session_id, e as unknown as React.MouseEvent)}
                        onCancel={(e) => e?.stopPropagation()}
                        okText="删除"
                        cancelText="取消"
                      >
                        <DeleteOutlined
                          onClick={(e) => e.stopPropagation()}
                          style={{ color: themeToken.colorTextSecondary, fontSize: 13 }}
                        />
                      </Popconfirm>
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {s.message_count} 条消息
                      {s.created_at && ` · ${s.created_at.slice(5, 16).replace('T', ' ')}`}
                    </Text>
                  </Space>
                </List.Item>
              )}
            />
          )}
        </div>
      </Sider>

      {/* --- Main chat area --- */}
      <Content style={{ display: 'flex', flexDirection: 'column', background: themeToken.colorBgLayout, overflow: 'hidden' }}>
        {/* Messages */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px', minHeight: 0 }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: 80, color: themeToken.colorTextSecondary }}>
              <RobotOutlined style={{ fontSize: 48, marginBottom: 16 }} />
              <div style={{ fontSize: 16 }}>你好，我是河狸云 AI 助手</div>
              <div style={{ marginTop: 8 }}>可以帮您查询产线进度、现场人员信息等</div>
              <Space style={{ marginTop: 24 }}>
                {['查看产线进度', '查询驻厂人员', '你好'].map((q) => (
                  <Tag
                    key={q}
                    color="blue"
                    style={{ cursor: 'pointer', padding: '4px 12px', fontSize: 14 }}
                    onClick={() => { setInputValue(q); inputRef.current?.focus(); }}
                  >
                    {q}
                  </Tag>
                ))}
              </Space>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    maxWidth: '70%',
                    display: 'flex',
                    gap: 8,
                    flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background:
                        msg.role === 'user'
                          ? themeToken.colorPrimary
                          : themeToken.colorSuccessBg,
                      color:
                        msg.role === 'user' ? '#fff' : themeToken.colorSuccess,
                      flexShrink: 0,
                    }}
                  >
                    {msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                  </div>
                  <div
                    style={{
                      background:
                        msg.role === 'user'
                          ? themeToken.colorPrimary
                          : themeToken.colorBgContainer,
                      color: msg.role === 'user' ? '#fff' : themeToken.colorText,
                      padding: '10px 16px',
                      borderRadius: 12,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                    }}
                  >
                    <Paragraph
                      style={{
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        color: 'inherit',
                      }}
                    >
                      {msg.content}
                    </Paragraph>
                    {msg.intent && (
                      <Tag color="geekblue" style={{ marginTop: 6, fontSize: 11 }}>
                        {msg.intent}
                      </Tag>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          {sending && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <div
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: themeToken.colorSuccessBg, color: themeToken.colorSuccess,
                }}
              >
                <RobotOutlined />
              </div>
              <div
                style={{
                  background: themeToken.colorBgContainer,
                  padding: '10px 16px', borderRadius: 12,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                }}
              >
                <Spin size="small" /> <Text type="secondary">思考中...</Text>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: `1px solid ${themeToken.colorBorderSecondary}`,
            background: themeToken.colorBgContainer,
          }}
        >
          <Space.Compact style={{ width: '100%' }}>
            <Input.TextArea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入您的问题…（Enter 发送，Shift+Enter 换行）"
              autoSize={{ minRows: 1, maxRows: 4 }}
              style={{ borderRadius: '8px 0 0 8px' }}
              disabled={sending}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={sending}
              style={{ height: 'auto', borderRadius: '0 8px 8px 0' }}
            >
              发送
            </Button>
          </Space.Compact>
        </div>
      </Content>
    </Layout>
  );
}
