import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Layout, Input, Button, List, Typography, Space, Spin, Tag, Empty,
  theme, Popconfirm, message, Tooltip, Drawer,
} from 'antd';
import {
  SendOutlined, PlusOutlined, MessageOutlined, UserOutlined,
  RobotOutlined, DeleteOutlined, AudioOutlined, AudioMutedOutlined,
  LoadingOutlined, ToolOutlined, MenuOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import client from '../api/client';
import { deleteSession } from '../api/admin';

const { Sider, Content } = Layout;
const { Text } = Typography;

/* AG-UI Event */
type AGUIEvent = {
  type: string;
  messageId?: string;
  delta?: string;
  stepName?: string;
  toolCallId?: string;
  toolCallName?: string;
  content?: string;
  value?: any;
  name?: string;
  threadId?: string;
  runId?: string;
  message?: string;
};

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'step';
  content: string;
  intent?: string;
  toolName?: string;
  created_at?: string;
  streaming?: boolean;
}

interface Session {
  session_id: string;
  customer_id: string;
  customer_name?: string;
  message_count: number;
  created_at?: string;
}

const TENANT_ID_DEFAULT = 1;
const CUSTOMER_ID_DEFAULT = 'C001';

interface ChatPageProps {
  embedMode?: boolean;
  tenantId?: number;
  customerId?: string;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  transcript: string;
}

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
};

export default function ChatPage({ embedMode, tenantId, customerId }: ChatPageProps = {}) {
  const { token: t } = theme.useToken();
  const isMobile = useIsMobile();

  const TENANT_ID = tenantId ?? TENANT_ID_DEFAULT;
  const CUSTOMER_ID = customerId ?? CUSTOMER_ID_DEFAULT;

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [listening, setListening] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [siderOpen, setSiderOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const skipHistoryRef = useRef(false);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await client.get('/v1/chat/sessions', { params: { tenant_id: TENANT_ID } });
      setSessions(res.data?.data?.items ?? []);
    } catch { /* skip */ }
    setLoadingSessions(false);
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => {
    if (!activeSession) { setMessages([]); return; }
    if (skipHistoryRef.current) { skipHistoryRef.current = false; return; }
    (async () => {
      try {
        const res = await client.get(`/v1/chat/sessions/${activeSession}/history`);
        const data: any[] = res.data?.data ?? [];
        setMessages(data.map((m: any, i: number) => ({
          id: `hist_${i}`,
          role: m.role,
          content: m.content,
          intent: m.intent,
          created_at: m.created_at,
        })));
      } catch { setMessages([]); }
    })();
  }, [activeSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentStep]);

  const toggleDictation = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      message.warning('\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u8bed\u97f3\u8bc6\u522b\uff0c\u8bf7\u4f7f\u7528 Chrome');
      return;
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const recognition = new SR();
    recognition.lang = 'zh-CN';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInputValue((prev: string) => {
        const base = prev.replace(/\[.*?\]$/, '').trimEnd();
        const isFinal = event.results[event.results.length - 1].isFinal;
        return isFinal ? (base ? base + ' ' : '') + transcript : base + '[' + transcript + ']';
      });
    };
    recognition.onerror = () => { setListening(false); };
    recognition.onend = () => { setListening(false); };
    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  }, [listening]);

  const handleNewChat = () => {
    if (abortRef.current) abortRef.current.abort();
    setActiveSession(null);
    setMessages([]);
    setInputValue('');
    setCurrentStep(null);
    setSiderOpen(false);
    inputRef.current?.focus();
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteSession(sessionId);
      message.success('\u4f1a\u8bdd\u5df2\u5220\u9664');
      if (activeSession === sessionId) handleNewChat();
      loadSessions();
    } catch { message.error('\u5220\u9664\u5931\u8d25'); }
  };

  const processEvent = (evt: AGUIEvent, assistantId: string) => {
    switch (evt.type) {
      case 'STEP_STARTED':
        setCurrentStep(evt.stepName || null);
        break;
      case 'STEP_FINISHED':
        setCurrentStep(null);
        break;
      case 'TEXT_MESSAGE_CONTENT':
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: m.content + (evt.delta || '') } : m
        ));
        break;
      case 'TOOL_CALL_START':
        setMessages(prev => {
          const toolMsg: ChatMessage = {
            id: `tc_${evt.toolCallId}`,
            role: 'tool',
            content: `\u6b63\u5728\u8c03\u7528 ${evt.toolCallName}...`,
            toolName: evt.toolCallName,
          };
          const idx = prev.findIndex(m => m.id === assistantId);
          if (idx >= 0) {
            const copy = [...prev];
            copy.splice(idx, 0, toolMsg);
            return copy;
          }
          return [...prev, toolMsg];
        });
        break;
      case 'TOOL_CALL_RESULT':
        setMessages(prev => prev.map(m =>
          m.id === `tc_${evt.toolCallId}`
            ? { ...m, content: `${m.toolName} \u8c03\u7528\u5b8c\u6210` }
            : m
        ));
        break;
      case 'CUSTOM':
        if (evt.name === 'intent') {
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, intent: evt.value?.code } : m
          ));
        }
        break;
      case 'RUN_ERROR':
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, content: evt.message || '\u5904\u7406\u51fa\u9519', streaming: false }
            : m
        ));
        break;
    }
  };

  const doSend = async (text: string) => {
    if (!text || sending) return;
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
    }

    const userMsg: ChatMessage = { id: `u_${Date.now()}`, role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setSending(true);
    setCurrentStep(null);

    const controller = new AbortController();
    abortRef.current = controller;

    const assistantId = `a_${Date.now()}`;
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', streaming: true }]);

    try {
      const resp = await fetch('/api/v1/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: activeSession || undefined,
          messages: [{ role: 'user', content: text }],
          context: {
            tenant_id: TENANT_ID,
            customer_id: CUSTOMER_ID,
          },
        }),
        signal: controller.signal,
      });

      const headerSessionId = resp.headers.get('X-Session-Id');
      if (headerSessionId && !activeSession) {
        skipHistoryRef.current = true;
        setActiveSession(headerSessionId);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt: AGUIEvent = JSON.parse(line.slice(6));
            processEvent(evt, assistantId);
          } catch { /* skip */ }
        }
      }
      if (buffer.startsWith('data: ')) {
        try {
          const evt: AGUIEvent = JSON.parse(buffer.slice(6));
          processEvent(evt, assistantId);
        } catch { /* skip */ }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, content: m.content || '\u7f51\u7edc\u5f02\u5e38\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002', streaming: false }
            : m
        ));
      }
    }

    setMessages(prev => prev.map(m =>
      m.id === assistantId ? { ...m, streaming: false } : m
    ));
    setSending(false);
    setCurrentStep(null);
    loadSessions();
    inputRef.current?.focus();
  };

  const handleSend = async () => {
    const text = inputValue.replace(/\[.*?\]$/, '').trim();
    doSend(text);
  };

  const handleQuickSend = (q: string) => {
    doSend(q);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const stepLabel: Record<string, string> = {
    intent_recognition: '\u8bc6\u522b\u610f\u56fe',
    tool_execution: '\u6267\u884c\u67e5\u8be2',
    reply_generation: '\u751f\u6210\u56de\u7b54',
  };

  const hasInput = inputValue.trim().length > 0;

  /* ── Session list content (shared between desktop sider and mobile drawer) ── */
  const sessionList = (
    <>
      <div style={{ padding: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} block onClick={handleNewChat}>
          {'\u65b0\u5efa\u5bf9\u8bdd'}
        </Button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 4px' }}>
        {loadingSessions ? (
          <Spin style={{ display: 'block', marginTop: 40, textAlign: 'center' }} />
        ) : (
          <List
            dataSource={sessions}
            locale={{ emptyText: <Empty description={'\u6682\u65e0\u4f1a\u8bdd'} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            renderItem={(s) => (
              <List.Item
                onClick={() => { setActiveSession(s.session_id); setSiderOpen(false); }}
                style={{
                  cursor: 'pointer', padding: '8px 12px', borderRadius: 6,
                  marginBottom: 2,
                  background: s.session_id === activeSession ? t.colorPrimaryBg : 'transparent',
                }}
              >
                <Space direction="vertical" size={0} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Space>
                      <MessageOutlined />
                      <Text ellipsis style={{ maxWidth: 140 }}>{s.customer_name || s.customer_id}</Text>
                    </Space>
                    <Popconfirm
                      title={'\u786e\u5b9a\u5220\u9664\u8be5\u4f1a\u8bdd\uff1f'}
                      description={'\u5220\u9664\u540e\u4e0d\u53ef\u6062\u590d'}
                      onConfirm={(e) => handleDeleteSession(s.session_id, e as unknown as React.MouseEvent)}
                      onCancel={(e) => e?.stopPropagation()}
                      okText={'\u5220\u9664'}
                      cancelText={'\u53d6\u6d88'}
                    >
                      <DeleteOutlined
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: t.colorTextSecondary, fontSize: 13 }}
                      />
                    </Popconfirm>
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {s.message_count} {'\u6761\u6d88\u606f'}
                    {s.created_at && ` \u00b7 ${s.created_at.slice(5, 16).replace('T', ' ')}`}
                  </Text>
                </Space>
              </List.Item>
            )}
          />
        )}
      </div>
    </>
  );

  return (
    <Layout style={{
      height: (isMobile || embedMode) ? '100vh' : 'calc(100vh - 112px)',
      margin: (isMobile || embedMode) ? 0 : '-24px',
      background: 'transparent', overflow: 'hidden',
    }}>
      {/* Desktop sidebar */}
      {!isMobile && (
        <Sider
          width={260}
          style={{
            background: t.colorBgContainer,
            borderRight: `1px solid ${t.colorBorderSecondary}`,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {sessionList}
        </Sider>
      )}

      {/* Mobile drawer */}
      {isMobile && (
        <Drawer
          placement="left"
          open={siderOpen}
          onClose={() => setSiderOpen(false)}
          width={280}
          styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
          title={'\u5386\u53f2\u5bf9\u8bdd'}
        >
          {sessionList}
        </Drawer>
      )}

      <Content style={{ display: 'flex', flexDirection: 'column', background: '#f7f7f8', overflow: 'hidden' }}>
        {/* Mobile topbar */}
        {isMobile && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', background: t.colorBgContainer,
            borderBottom: `1px solid ${t.colorBorderSecondary}`,
          }}>
            <Button type="text" icon={<MenuOutlined />} onClick={() => setSiderOpen(true)} />
            <Text strong>{'\u6cb3\u72f8\u4e91 AI'}</Text>
            <Button type="text" icon={<PlusOutlined />} onClick={handleNewChat} />
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '16px 0' : '24px 0', minHeight: 0 }}>
          <div style={{ maxWidth: 768, margin: '0 auto', padding: isMobile ? '0 12px' : '0 24px' }}>
            {messages.length === 0 ? (
              <div style={{ textAlign: 'center', marginTop: isMobile ? 40 : 80, color: t.colorTextSecondary }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 20, margin: '0 auto 16px',
                  background: 'linear-gradient(135deg, #8B5CF6, #3B82F6)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 32, color: '#fff',
                }}>
                  <RobotOutlined />
                </div>
                <div style={{ fontSize: 18, fontWeight: 600, color: t.colorText }}>{'\u60a8\u597d\uff01\u6211\u662f\u6cb3\u72f8\u4e91AI\u52a9\u624b'}</div>
                <div style={{ marginTop: 8, fontSize: 13, color: '#666', lineHeight: 1.6 }}>
                  {'\u6211\u53ef\u4ee5\u5e2e\u60a8\u67e5\u8be2\u4ea7\u7ebf\u8fdb\u5ea6\u3001\u73b0\u573a\u4eba\u5458\u3001\u670d\u52a1\u8bb0\u5f55\u7b49\uff0c\u4e5f\u53ef\u4ee5\u5e2e\u60a8\u63d0\u4ea4\u6295\u8bc9\u6216\u53d1\u8d77\u8054\u7cfb\u3002'}
                </div>
                <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320, margin: '24px auto 0' }}>
                  {[
                    { icon: '\ud83d\udcca', text: '\u67e5\u770b\u6211\u7684\u4ea7\u7ebf\u8fdb\u5ea6' },
                    { icon: '\ud83d\udc65', text: '\u73b0\u573a\u6709\u51e0\u4e2a\u4eba\u5728\u65bd\u5de5' },
                    { icon: '\ud83d\udcdd', text: '\u6211\u8981\u53cd\u9988\u4e00\u4e2a\u95ee\u9898' },
                  ].map((q) => (
                    <div
                      key={q.text}
                      onClick={() => handleQuickSend(q.text)}
                      style={{
                        cursor: 'pointer', padding: '12px 16px', borderRadius: 12,
                        border: '1px solid #E5E7EB', background: '#fff', fontSize: 13,
                        color: '#666', display: 'flex', alignItems: 'center', gap: 10,
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#8B5CF6';
                        e.currentTarget.style.color = '#8B5CF6';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#E5E7EB';
                        e.currentTarget.style.color = '#666';
                      }}
                    >
                      <span style={{
                        width: 32, height: 32, borderRadius: 8, background: '#F5F7FA',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                      }}>{q.icon}</span>
                      <span>{q.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} style={{ marginBottom: isMobile ? 12 : 20 }}>
                  {msg.role === 'tool' ? (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '4px 12px', fontSize: 12, color: t.colorTextSecondary,
                    }}>
                      <ToolOutlined style={{ fontSize: 11 }} />
                      <span style={{ opacity: 0.8 }}>{msg.content}</span>
                    </div>
                  ) : (
                    <div style={{
                      display: 'flex', gap: isMobile ? 8 : 12,
                      flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                      alignItems: 'flex-start',
                    }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: msg.role === 'user' ? 'linear-gradient(135deg, #F5811F, #E06D0C)' : 'linear-gradient(135deg, #8B5CF6, #3B82F6)',
                        color: '#fff', fontSize: 16,
                      }}>
                        {msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                      </div>
                      <div style={{ maxWidth: isMobile ? '82%' : '75%', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{
                          background: msg.role === 'user' ? 'linear-gradient(135deg, #F5811F, #E06D0C)' : '#fff',
                          color: msg.role === 'user' ? '#fff' : t.colorText,
                          padding: isMobile ? '10px 14px' : '12px 16px',
                          borderRadius: 16,
                          borderBottomRightRadius: msg.role === 'user' ? 4 : 16,
                          borderBottomLeftRadius: msg.role === 'user' ? 16 : 4,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                          lineHeight: 1.7, fontSize: isMobile ? 14 : 14,
                        }}>
                          {msg.role === 'user' ? (
                            <span>{msg.content}</span>
                          ) : (
                            <div className="md-body">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                              {msg.streaming && <span className="cursor-blink">{'\u258d'}</span>}
                            </div>
                          )}
                        </div>
                        {msg.intent && (
                          <Tag color="purple" style={{ alignSelf: 'flex-start', fontSize: 11, borderRadius: 10 }}>{msg.intent}</Tag>
                        )}
                        {msg.created_at && (
                          <span style={{ fontSize: 11, color: t.colorTextQuaternary, paddingLeft: 4 }}>
                            {msg.created_at.slice(11, 16)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}

            {sending && currentStep && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 0', color: t.colorTextSecondary, fontSize: 13,
              }}>
                <LoadingOutlined />
                <span>{stepLabel[currentStep] || currentStep}...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div style={{
          padding: isMobile ? '8px 12px' : '12px 24px',
          paddingBottom: isMobile ? 'calc(8px + env(safe-area-inset-bottom, 0px))' : 12,
          background: '#fff',
          borderTop: '1px solid #E5E7EB',
        }}>
          <div style={{
            maxWidth: 768, margin: '0 auto',
            background: '#F5F7FA', borderRadius: 24,
            display: 'flex', alignItems: 'flex-end',
            padding: '4px 4px 4px 16px',
            border: '2px solid transparent',
            transition: 'border-color 0.2s',
          }}>
            <Input.TextArea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={'\u7ed9 \u6cb3\u72f8\u4e91AI \u53d1\u6d88\u606f\u2026'}
              autoSize={{ minRows: 1, maxRows: 6 }}
              variant="borderless"
              style={{ flex: 1, resize: 'none', fontSize: 14 }}
              disabled={sending}
            />
            <Space size={4}>
              {!hasInput && (
                <Tooltip title={listening ? '\u505c\u6b62\u542c\u5199' : '\u8bed\u97f3\u8f93\u5165'}>
                  <Button
                    type="text"
                    shape="circle"
                    icon={listening ? <AudioMutedOutlined style={{ color: '#f5222d' }} /> : <AudioOutlined />}
                    onClick={toggleDictation}
                    disabled={sending}
                  />
                </Tooltip>
              )}
              <Button
                type="primary"
                shape="circle"
                icon={<SendOutlined />}
                onClick={handleSend}
                loading={sending}
                disabled={!hasInput}
                style={{ background: hasInput ? 'linear-gradient(135deg, #8B5CF6, #3B82F6)' : undefined }}
              />
            </Space>
          </div>
        </div>
      </Content>

      <style>{`
        .cursor-blink {
          animation: blink 1s step-end infinite;
          font-weight: 100;
          color: inherit;
        }
        @keyframes blink {
          50% { opacity: 0; }
        }
        /* Markdown body styles */
        .md-body { font-size: 14px; line-height: 1.7; }
        .md-body p { margin: 0 0 8px; }
        .md-body p:last-child { margin-bottom: 0; }
        .md-body h1, .md-body h2, .md-body h3 { margin: 12px 0 8px; font-weight: 600; }
        .md-body h3 { font-size: 15px; }
        .md-body ul, .md-body ol { margin: 4px 0; padding-left: 20px; }
        .md-body li { margin-bottom: 2px; }
        .md-body strong { font-weight: 600; }
        .md-body code {
          background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 4px;
          font-size: 13px; font-family: 'SF Mono', 'Menlo', monospace;
        }
        .md-body pre { background: #1E1B4B; color: #E2E8F0; padding: 12px; border-radius: 8px; overflow-x: auto; margin: 8px 0; }
        .md-body pre code { background: none; color: inherit; padding: 0; }
        .md-body table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 13px; }
        .md-body th, .md-body td { border: 1px solid #E5E7EB; padding: 6px 10px; text-align: left; }
        .md-body th { background: #F5F7FA; font-weight: 600; }
        .md-body blockquote { border-left: 3px solid #8B5CF6; margin: 8px 0; padding: 4px 12px; color: #666; background: #F9FAFB; border-radius: 0 6px 6px 0; }
        .md-body hr { border: none; border-top: 1px solid #E5E7EB; margin: 12px 0; }
        .md-body a { color: #3B82F6; text-decoration: none; }
      `}</style>
    </Layout>
  );
}
