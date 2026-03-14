/**
 * 日志查询页面 — 证据链 + 错误日志 + 操作日志
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Table, Card, Tabs, Tag, Input, Select, Space, Button, Modal, Typography, Descriptions,
  message, Popconfirm,
} from 'antd';
import { SearchOutlined, ReloadOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import client from '../api/client';

const { Text, Paragraph } = Typography;

interface ActionLogItem {
  id: number;
  session_id: string;
  tenant_id: number;
  customer_id: string;
  action_type: string;
  action_params: any;
  status: string;
  result: any;
  error_message: string | null;
  created_at: string;
}

interface MessageLogItem {
  id: number;
  session_id: string;
  role: string;
  content: string;
  intent: string | null;
  entities: any;
  evidence_chain: any;
  processing_time_ms: number | null;
  created_at: string;
}

const statusColor: Record<string, string> = {
  success: 'green',
  error: 'red',
  failed: 'red',
  pending: 'orange',
};

export default function LogsPage() {
  const [activeTab, setActiveTab] = useState('action');
  const [actionLogs, setActionLogs] = useState<ActionLogItem[]>([]);
  const [messageLogs, setMessageLogs] = useState<MessageLogItem[]>([]);
  const [errorLogs, setErrorLogs] = useState<ActionLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sessionFilter, setSessionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [detailModal, setDetailModal] = useState<any>(null);

  const fetchActionLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { tenant_id: 1, page, size: 20 };
      if (sessionFilter) params.session_id = sessionFilter;
      if (statusFilter) params.status = statusFilter;
      const res = await client.get('/admin/logs/action-logs', { params });
      setActionLogs(res.data?.data?.items ?? []);
      setTotal(res.data?.data?.total ?? 0);
    } catch { message.error('加载失败'); }
    setLoading(false);
  }, [page, sessionFilter, statusFilter]);

  const fetchMessageLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, size: 20 };
      if (sessionFilter) params.session_id = sessionFilter;
      const res = await client.get('/admin/logs/message-logs', { params });
      setMessageLogs(res.data?.data?.items ?? []);
      setTotal(res.data?.data?.total ?? 0);
    } catch { message.error('加载失败'); }
    setLoading(false);
  }, [page, sessionFilter]);

  const fetchErrorLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get('/admin/logs/error-logs', { params: { tenant_id: 1, page, size: 20 } });
      setErrorLogs(res.data?.data?.items ?? []);
      setTotal(res.data?.data?.total ?? 0);
    } catch { message.error('加载失败'); }
    setLoading(false);
  }, [page]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, sessionFilter, statusFilter]);

  useEffect(() => {
    if (activeTab === 'action') fetchActionLogs();
    else if (activeTab === 'message') fetchMessageLogs();
    else fetchErrorLogs();
  }, [activeTab, fetchActionLogs, fetchMessageLogs, fetchErrorLogs]);

  const actionColumns: ColumnsType<ActionLogItem> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '会话', dataIndex: 'session_id', width: 160, ellipsis: true },
    { title: '客户', dataIndex: 'customer_id', width: 80 },
    { title: '类型', dataIndex: 'action_type', width: 120 },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (s: string) => <Tag color={statusColor[s] || 'default'}>{s}</Tag>,
    },
    { title: '错误', dataIndex: 'error_message', width: 200, ellipsis: true },
    { title: '时间', dataIndex: 'created_at', width: 160, render: (v: string) => v?.slice(0, 19).replace('T', ' ') },
    {
      title: '操作', width: 80,
      render: (_: any, record: ActionLogItem) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailModal(record)}>
          详情
        </Button>
      ),
    },
  ];

  const messageColumns: ColumnsType<MessageLogItem> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '会话', dataIndex: 'session_id', width: 160, ellipsis: true },
    { title: '角色', dataIndex: 'role', width: 70, render: (r: string) => <Tag color={r === 'user' ? 'blue' : 'green'}>{r}</Tag> },
    { title: '内容', dataIndex: 'content', ellipsis: true },
    { title: '意图', dataIndex: 'intent', width: 120 },
    { title: '耗时(ms)', dataIndex: 'processing_time_ms', width: 80 },
    { title: '时间', dataIndex: 'created_at', width: 160, render: (v: string) => v?.slice(0, 19).replace('T', ' ') },
    {
      title: '操作', width: 80,
      render: (_: any, record: MessageLogItem) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailModal(record)}>
          详情
        </Button>
      ),
    },
  ];

  const errorColumns: ColumnsType<ActionLogItem> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '会话', dataIndex: 'session_id', width: 160, ellipsis: true },
    { title: '类型', dataIndex: 'action_type', width: 120 },
    { title: '错误信息', dataIndex: 'error_message', ellipsis: true },
    { title: '时间', dataIndex: 'created_at', width: 160, render: (v: string) => v?.slice(0, 19).replace('T', ' ') },
    {
      title: '操作', width: 80,
      render: (_: any, record: ActionLogItem) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailModal(record)}>
          详情
        </Button>
      ),
    },
  ];

  const renderEvidenceSteps = (result: any) => {
    if (!result?.steps) return null;
    return (
      <div style={{ marginTop: 8 }}>
        <Text strong>证据链步骤：</Text>
        {result.steps.map((s: any, i: number) => (
          <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
            <Tag color="blue">{s.step}</Tag>
            <Text type="secondary">{s.duration_ms}ms</Text>
            {s.detail && (
              <Paragraph
                style={{ margin: '4px 0 0', fontSize: 12 }}
                ellipsis={{ rows: 2, expandable: true }}
              >
                {typeof s.detail === 'string' ? s.detail : JSON.stringify(s.detail, null, 2)}
              </Paragraph>
            )}
          </div>
        ))}
        {result.errors?.length > 0 && (
          <>
            <Text strong type="danger" style={{ marginTop: 8, display: 'block' }}>错误记录：</Text>
            {result.errors.map((e: any, i: number) => (
              <div key={i} style={{ padding: '4px 0', color: '#cf1322' }}>
                <Tag color="red">{e.step}</Tag> {e.error}
                {e.traceback && (
                  <Paragraph code style={{ fontSize: 11, marginTop: 4 }} ellipsis={{ rows: 3, expandable: true }}>
                    {e.traceback}
                  </Paragraph>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    );
  };

  return (
    <Card title="日志查询" extra={
      <Space>
        <Input
          placeholder="按会话ID筛选"
          prefix={<SearchOutlined />}
          value={sessionFilter}
          onChange={(e) => setSessionFilter(e.target.value)}
          style={{ width: 220 }}
          allowClear
        />
        {activeTab === 'action' && (
          <Select
            placeholder="状态"
            value={statusFilter}
            onChange={setStatusFilter}
            allowClear
            style={{ width: 100 }}
            options={[
              { label: '成功', value: 'success' },
              { label: '错误', value: 'error' },
              { label: '待处理', value: 'pending' },
            ]}
          />
        )}
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            if (activeTab === 'action') fetchActionLogs();
            else if (activeTab === 'message') fetchMessageLogs();
            else fetchErrorLogs();
          }}
        >
          刷新
        </Button>
        <Popconfirm
          title="确认清空当前类型的日志?"
          okText="确认"
          cancelText="取消"
          onConfirm={async () => {
            try {
              await client.delete('/admin/logs/clear', { params: { log_type: activeTab, tenant_id: 1 } });
              message.success('清空成功');
              if (activeTab === 'action') fetchActionLogs();
              else if (activeTab === 'message') fetchMessageLogs();
              else fetchErrorLogs();
            } catch { message.error('清空失败'); }
          }}
        >
          <Button icon={<DeleteOutlined />} danger>清空</Button>
        </Popconfirm>
      </Space>
    }>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'action',
            label: '操作日志 / 证据链',
            children: (
              <Table
                columns={actionColumns}
                dataSource={actionLogs}
                rowKey="id"
                loading={loading}
                size="small"
                pagination={{
                  current: page, total, pageSize: 20,
                  onChange: setPage, showTotal: (t) => `共 ${t} 条`,
                }}
                scroll={{ x: 900 }}
              />
            ),
          },
          {
            key: 'message',
            label: '消息日志',
            children: (
              <Table
                columns={messageColumns}
                dataSource={messageLogs}
                rowKey="id"
                loading={loading}
                size="small"
                pagination={{
                  current: page, total, pageSize: 20,
                  onChange: setPage, showTotal: (t) => `共 ${t} 条`,
                }}
                scroll={{ x: 800 }}
              />
            ),
          },
          {
            key: 'error',
            label: '错误日志',
            children: (
              <Table
                columns={errorColumns}
                dataSource={errorLogs}
                rowKey="id"
                loading={loading}
                size="small"
                pagination={{
                  current: page, total, pageSize: 20,
                  onChange: setPage, showTotal: (t) => `共 ${t} 条`,
                }}
                scroll={{ x: 700 }}
              />
            ),
          },
        ]}
      />

      <Modal
        title="日志详情"
        open={!!detailModal}
        onCancel={() => setDetailModal(null)}
        footer={null}
        width={720}
      >
        {detailModal && (
          <div>
            <Descriptions column={2} size="small" bordered>
              {detailModal.session_id && (
                <Descriptions.Item label="会话ID" span={2}>{detailModal.session_id}</Descriptions.Item>
              )}
              {detailModal.action_type && (
                <Descriptions.Item label="类型">{detailModal.action_type}</Descriptions.Item>
              )}
              {detailModal.role && (
                <Descriptions.Item label="角色">
                  <Tag color={detailModal.role === 'user' ? 'blue' : 'green'}>{detailModal.role}</Tag>
                </Descriptions.Item>
              )}
              {detailModal.status && (
                <Descriptions.Item label="状态">
                  <Tag color={statusColor[detailModal.status] || 'default'}>{detailModal.status}</Tag>
                </Descriptions.Item>
              )}
              {detailModal.intent && (
                <Descriptions.Item label="意图">{detailModal.intent}</Descriptions.Item>
              )}
              {detailModal.customer_id && (
                <Descriptions.Item label="客户">{detailModal.customer_id}</Descriptions.Item>
              )}
              {detailModal.processing_time_ms != null && (
                <Descriptions.Item label="耗时">{detailModal.processing_time_ms}ms</Descriptions.Item>
              )}
              {detailModal.created_at && (
                <Descriptions.Item label="时间">{detailModal.created_at.slice(0, 19).replace('T', ' ')}</Descriptions.Item>
              )}
            </Descriptions>

            {detailModal.content && (
              <div style={{ marginTop: 12 }}>
                <Text strong>消息内容：</Text>
                <Paragraph style={{ marginTop: 4, whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: 12, borderRadius: 6 }}>
                  {detailModal.content}
                </Paragraph>
              </div>
            )}

            {detailModal.error_message && (
              <div style={{ marginTop: 12 }}>
                <Text strong type="danger">错误信息：</Text>
                <Paragraph type="danger" style={{ marginTop: 4 }}>{detailModal.error_message}</Paragraph>
              </div>
            )}

            {detailModal.action_params && (
              <div style={{ marginTop: 12 }}>
                <Text strong>请求参数：</Text>
                <Paragraph code style={{ marginTop: 4, fontSize: 12 }}>
                  {JSON.stringify(detailModal.action_params, null, 2)}
                </Paragraph>
              </div>
            )}

            {detailModal.result && renderEvidenceSteps(detailModal.result)}

            {detailModal.entities && (
              <div style={{ marginTop: 12 }}>
                <Text strong>实体信息：</Text>
                <Paragraph code style={{ marginTop: 4, fontSize: 12 }}>
                  {JSON.stringify(detailModal.entities, null, 2)}
                </Paragraph>
              </div>
            )}

            {detailModal.evidence_chain && (
              <div style={{ marginTop: 12 }}>
                <Text strong>证据链：</Text>
                <Paragraph code style={{ marginTop: 4, fontSize: 12 }}>
                  {JSON.stringify(detailModal.evidence_chain, null, 2)}
                </Paragraph>
              </div>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
}
