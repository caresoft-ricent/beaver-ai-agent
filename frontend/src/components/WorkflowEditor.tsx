/**
 * 可视化流程编排编辑器 — 基于 React Flow
 *
 * 支持节点类型: tool_call / condition / parallel / confirm / llm_call / reply
 * 通过拖拽和连线编排流程，输出 workflow_config JSON
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Card, Button, Space, Select, Input, Form, Divider, Tag, Tooltip,
  Popconfirm, Empty, Typography, InputNumber,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, ApiOutlined, BranchesOutlined,
  ThunderboltOutlined, CheckCircleOutlined, RobotOutlined,
  MessageOutlined, QuestionCircleOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

// ── 类型定义 ──

interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  entity_id?: number;
  action_id?: number;
  params?: Record<string, string>;
  output_mapping?: Record<string, string>;
  // condition
  field?: string;
  branches?: { operator: string; value: string; next: string }[];
  default_next?: string;
  // parallel
  parallel_nodes?: string[];
  // confirm
  title?: string;
  message?: string;
  reject_next?: string;
  // llm_call
  prompt?: string;
  max_tokens?: number;
  // reply
  text?: string;
  // common
  next?: string | null;
}

interface WorkflowConfig {
  version: number;
  start_node: string;
  nodes: WorkflowNode[];
}

interface EntityItem { id: number; entity_code: string; entity_name: string }
interface ActionItem { id: number; action_code: string; action_name: string }

interface WorkflowEditorProps {
  value?: WorkflowConfig | null;
  onChange?: (config: WorkflowConfig) => void;
  entities: EntityItem[];
  onLoadActions: (entityId: number) => Promise<ActionItem[]>;
  /** 全屏模式：填满父容器高度 */
  fullPage?: boolean;
}

// ── 节点类型配置 ──

const NODE_TYPES_META = [
  { type: 'tool_call', label: '工具调用', icon: <ApiOutlined />, color: '#1890ff', desc: '调用本体操作/API' },
  { type: 'condition', label: '条件判断', icon: <BranchesOutlined />, color: '#faad14', desc: '根据条件分支路由' },
  { type: 'parallel', label: '并行执行', icon: <ThunderboltOutlined />, color: '#722ed1', desc: '同时执行多个工具' },
  { type: 'confirm', label: '用户确认', icon: <CheckCircleOutlined />, color: '#52c41a', desc: '暂停等待用户确认' },
  { type: 'llm_call', label: 'AI生成', icon: <RobotOutlined />, color: '#eb2f96', desc: '用大模型生成回答' },
  { type: 'reply', label: '文本回复', icon: <MessageOutlined />, color: '#13c2c2', desc: '直接输出模板文本' },
];

const nodeColor = (type: string) => NODE_TYPES_META.find(n => n.type === type)?.color || '#999';

// ── 自定义流程节点组件 ──

function WorkflowNode({ data, id }: NodeProps) {
  const meta = NODE_TYPES_META.find(m => m.type === data.nodeType) || NODE_TYPES_META[0];
  const borderColor = meta.color;

  return (
    <div style={{
      background: '#fff', border: `2px solid ${borderColor}`, borderRadius: 8,
      padding: '8px 12px', minWidth: 160, fontSize: 13,
      boxShadow: data.isStart ? `0 0 8px ${borderColor}40` : 'none',
    }}>
      <Handle type="target" position={Position.Top} style={{ background: borderColor }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ color: borderColor }}>{meta.icon}</span>
        <Text strong style={{ fontSize: 13 }}>{data.label || meta.label}</Text>
        {data.isStart && <Tag color="blue" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>起点</Tag>}
      </div>
      <Text type="secondary" style={{ fontSize: 11 }}>
        {data.nodeType === 'tool_call' && data.entityName ? `${data.entityName} → ${data.actionName || '?'}` : meta.desc}
      </Text>
      <Handle type="source" position={Position.Bottom} style={{ background: borderColor }} />
      {data.nodeType === 'condition' && (
        <>
          <Handle type="source" position={Position.Right} id="branch-true" style={{ background: '#52c41a', top: '50%' }} />
          <Handle type="source" position={Position.Left} id="branch-false" style={{ background: '#ff4d4f', top: '50%' }} />
        </>
      )}
    </div>
  );
}

const customNodeTypes = { workflow: WorkflowNode };

// ── 主组件 ──

export default function WorkflowEditor({ value, onChange, entities, onLoadActions, fullPage }: WorkflowEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeConfigs, setNodeConfigs] = useState<Record<string, WorkflowNode>>({});
  const [startNode, setStartNode] = useState<string>('');
  const [actionCache, setActionCache] = useState<Record<number, ActionItem[]>>({});
  const [idCounter, setIdCounter] = useState(1);

  // 实体 id→name 映射
  const entityMap = useMemo(() => {
    const m: Record<number, string> = {};
    entities.forEach(e => { m[e.id] = e.entity_name; });
    return m;
  }, [entities]);

  // 加载操作列表(带缓存)
  const loadActions = useCallback(async (entityId: number) => {
    if (actionCache[entityId]) return actionCache[entityId];
    const actions = await onLoadActions(entityId);
    setActionCache(prev => ({ ...prev, [entityId]: actions }));
    return actions;
  }, [actionCache, onLoadActions]);

  // ── 从 value 初始化 ──
  useEffect(() => {
    if (!value?.nodes?.length) {
      setNodes([]);
      setEdges([]);
      setNodeConfigs({});
      setStartNode('');
      return;
    }

    const cfgs: Record<string, WorkflowNode> = {};
    value.nodes.forEach(n => { cfgs[n.id] = n; });
    setNodeConfigs(cfgs);
    setStartNode(value.start_node || value.nodes[0]?.id || '');

    // 布局：简单自动排列
    const flowNodes: Node[] = value.nodes.map((n, i) => ({
      id: n.id,
      type: 'workflow',
      position: { x: 250 * (i % 3), y: 120 * Math.floor(i / 3) },
      data: {
        label: n.label,
        nodeType: n.type,
        isStart: n.id === (value.start_node || value.nodes[0]?.id),
        entityName: n.entity_id ? entityMap[n.entity_id] : undefined,
        actionName: '', // will be loaded
      },
    }));

    const flowEdges: Edge[] = [];
    value.nodes.forEach(n => {
      if (n.next) {
        flowEdges.push({
          id: `e-${n.id}-${n.next}`,
          source: n.id, target: n.next,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: '#999' },
        });
      }
      if (n.type === 'condition') {
        n.branches?.forEach((b, bi) => {
          if (b.next) {
            flowEdges.push({
              id: `e-${n.id}-br${bi}-${b.next}`,
              source: n.id, target: b.next,
              sourceHandle: 'branch-true',
              label: `${b.operator} ${b.value}`,
              markerEnd: { type: MarkerType.ArrowClosed },
              style: { stroke: '#52c41a' },
            });
          }
        });
        if (n.default_next) {
          flowEdges.push({
            id: `e-${n.id}-default-${n.default_next}`,
            source: n.id, target: n.default_next,
            sourceHandle: 'branch-false',
            label: '默认',
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: '#ff4d4f' },
          });
        }
      }
    });

    setNodes(flowNodes);
    setEdges(flowEdges);

    // 计算 id counter
    const maxId = Math.max(0, ...value.nodes.map(n => {
      const m = n.id.match(/node_(\d+)/);
      return m ? parseInt(m[1]) : 0;
    }));
    setIdCounter(maxId + 1);
  }, [value, entityMap]);

  // ── 同步变更到外部 ──
  const syncToParent = useCallback((cfgs: Record<string, WorkflowNode>, start: string, currentEdges: Edge[]) => {
    if (!onChange) return;

    // 从 edges 重建 next 关系
    const nextMap: Record<string, string> = {};
    currentEdges.forEach(e => {
      if (!e.sourceHandle || e.sourceHandle === 'source') {
        nextMap[e.source] = e.target;
      }
    });

    const nodeList = Object.values(cfgs).map(n => ({
      ...n,
      next: nextMap[n.id] || n.next || null,
    }));

    onChange({
      version: 1,
      start_node: start || nodeList[0]?.id || '',
      nodes: nodeList,
    });
  }, [onChange]);

  // ── 添加节点 ──
  const addNode = useCallback((type: string) => {
    const nodeId = `node_${idCounter}`;
    setIdCounter(prev => prev + 1);

    const meta = NODE_TYPES_META.find(m => m.type === type)!;
    const newConfig: WorkflowNode = {
      id: nodeId,
      type,
      label: meta.label,
    };

    const newCfgs = { ...nodeConfigs, [nodeId]: newConfig };
    setNodeConfigs(newCfgs);

    const isFirst = nodes.length === 0;
    if (isFirst) setStartNode(nodeId);

    const newNode: Node = {
      id: nodeId,
      type: 'workflow',
      position: { x: 100 + (nodes.length % 3) * 250, y: 40 + Math.floor(nodes.length / 3) * 120 },
      data: { label: meta.label, nodeType: type, isStart: isFirst },
    };
    setNodes(prev => [...prev, newNode]);

    syncToParent(newCfgs, isFirst ? nodeId : startNode, edges);
  }, [idCounter, nodeConfigs, nodes, edges, startNode, syncToParent]);

  // ── 删除节点 ──
  const deleteNode = useCallback((nodeId: string) => {
    const newCfgs = { ...nodeConfigs };
    delete newCfgs[nodeId];
    setNodeConfigs(newCfgs);

    setNodes(prev => prev.filter(n => n.id !== nodeId));
    const newEdges = edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    setEdges(newEdges);

    const newStart = startNode === nodeId ? Object.keys(newCfgs)[0] || '' : startNode;
    if (startNode === nodeId) setStartNode(newStart);

    setSelectedNodeId(null);
    syncToParent(newCfgs, newStart, newEdges);
  }, [nodeConfigs, edges, startNode, syncToParent]);

  // ── 连线 ──
  const onConnect = useCallback((params: Connection) => {
    setEdges(prev => {
      const newEdges = addEdge({
        ...params,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#999' },
      }, prev);
      // 同步 next 关系到 config
      const src = params.source;
      const tgt = params.target;
      if (src && tgt) {
        setNodeConfigs(prev => {
          const updated = { ...prev };
          if (updated[src]) {
            updated[src] = { ...updated[src], next: tgt };
          }
          syncToParent(updated, startNode, newEdges);
          return updated;
        });
      }
      return newEdges;
    });
  }, [startNode, syncToParent]);

  // ── 节点点击 ──
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  // ── 更新节点配置 ──
  const updateNodeConfig = useCallback((nodeId: string, patch: Partial<WorkflowNode>) => {
    setNodeConfigs(prev => {
      const updated = { ...prev, [nodeId]: { ...prev[nodeId], ...patch } };
      // 同步 label 到 flow node data
      if (patch.label) {
        setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, label: patch.label } } : n));
      }
      if (patch.entity_id !== undefined) {
        const eName = patch.entity_id ? entityMap[patch.entity_id] : '';
        setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, entityName: eName } } : n));
      }
      syncToParent(updated, startNode, edges);
      return updated;
    });
  }, [entityMap, edges, startNode, syncToParent]);

  const setAsStart = useCallback((nodeId: string) => {
    setStartNode(nodeId);
    setNodes(prev => prev.map(n => ({
      ...n,
      data: { ...n.data, isStart: n.id === nodeId },
    })));
    syncToParent(nodeConfigs, nodeId, edges);
  }, [nodeConfigs, edges, syncToParent]);

  // 当前选中的节点配置
  const selectedConfig = selectedNodeId ? nodeConfigs[selectedNodeId] : null;

  return (
    <div style={{ display: 'flex', height: fullPage ? '100%' : 520, border: fullPage ? 'none' : '1px solid #f0f0f0', borderRadius: fullPage ? 0 : 8, overflow: 'hidden' }}>
      {/* 左侧: 节点面板 */}
      <div style={{ width: fullPage ? 180 : 160, background: '#fafafa', borderRight: '1px solid #f0f0f0', padding: fullPage ? 12 : 8, overflowY: 'auto' }}>
        <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>添加节点</Text>
        {NODE_TYPES_META.map(meta => (
          <Tooltip key={meta.type} title={meta.desc} placement="right">
            <Button
              block size="small"
              style={{ marginBottom: 6, textAlign: 'left', borderColor: meta.color, color: meta.color }}
              icon={meta.icon}
              onClick={() => addNode(meta.type)}
            >
              {meta.label}
            </Button>
          </Tooltip>
        ))}
        <Divider style={{ margin: '8px 0' }} />
        <Text type="secondary" style={{ fontSize: 11 }}>
          <QuestionCircleOutlined /> 点击节点编辑属性；拖拽节点端点连线
        </Text>
      </div>

      {/* 中间: 画布 */}
      <div style={{ flex: 1 }}>
        {nodes.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <Empty description={false} />
            <Text type="secondary" style={{ fontSize: 15 }}>从左侧面板点击按钮添加第一个节点</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>添加节点后，拖拽连接点建立流程连线</Text>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={customNodeTypes}
            fitView
            deleteKeyCode="Backspace"
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={(n) => nodeColor(n.data?.nodeType as string)}
              style={{ height: 80, width: 120 }}
            />
          </ReactFlow>
        )}
      </div>

      {/* 右侧: 属性面板 */}
      <div style={{ width: fullPage ? 300 : 260, background: '#fafafa', borderLeft: '1px solid #f0f0f0', padding: 12, overflowY: 'auto' }}>
        {selectedConfig ? (
          <NodePropertyPanel
            config={selectedConfig}
            entities={entities}
            actionCache={actionCache}
            loadActions={loadActions}
            allNodeIds={Object.keys(nodeConfigs)}
            startNode={startNode}
            onChange={(patch) => updateNodeConfig(selectedNodeId!, patch)}
            onDelete={() => deleteNode(selectedNodeId!)}
            onSetStart={() => setAsStart(selectedNodeId!)}
          />
        ) : (
          <div style={{ textAlign: 'center', color: '#999', marginTop: 40 }}>
            <Text type="secondary">点击画布中的节点<br/>编辑其属性</Text>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 右侧属性面板 ──

interface NodePropertyPanelProps {
  config: WorkflowNode;
  entities: EntityItem[];
  actionCache: Record<number, ActionItem[]>;
  loadActions: (entityId: number) => Promise<ActionItem[]>;
  allNodeIds: string[];
  startNode: string;
  onChange: (patch: Partial<WorkflowNode>) => void;
  onDelete: () => void;
  onSetStart: () => void;
}

function NodePropertyPanel({
  config, entities, actionCache, loadActions, allNodeIds, startNode,
  onChange, onDelete, onSetStart,
}: NodePropertyPanelProps) {
  const [actions, setActions] = useState<ActionItem[]>([]);

  useEffect(() => {
    if (config.entity_id) {
      if (actionCache[config.entity_id]) {
        setActions(actionCache[config.entity_id]);
      } else {
        loadActions(config.entity_id).then(setActions);
      }
    } else {
      setActions([]);
    }
  }, [config.entity_id, actionCache, loadActions]);

  const meta = NODE_TYPES_META.find(m => m.type === config.type);
  const otherNodes = allNodeIds.filter(id => id !== config.id);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Tag color={meta?.color}>{meta?.icon} {meta?.label}</Tag>
        <Space size={4}>
          {config.id !== startNode && (
            <Tooltip title="设为起点">
              <Button size="small" type="text" onClick={onSetStart}>📌</Button>
            </Tooltip>
          )}
          <Popconfirm title="删除此节点?" onConfirm={onDelete} okText="确认" cancelText="取消">
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      </div>

      <Form size="small" layout="vertical">
        <Form.Item label="节点名称">
          <Input value={config.label} onChange={e => onChange({ label: e.target.value })} placeholder="节点名称" />
        </Form.Item>

        {/* tool_call 特有配置 */}
        {config.type === 'tool_call' && (
          <>
            <Form.Item label="本体">
              <Select
                value={config.entity_id} placeholder="选择本体"
                onChange={v => { onChange({ entity_id: v, action_id: undefined }); }}
                options={entities.map(e => ({ value: e.id, label: `${e.entity_name} (${e.entity_code})` }))}
                showSearch optionFilterProp="label" allowClear
              />
            </Form.Item>
            <Form.Item label="操作">
              <Select
                value={config.action_id} placeholder="选择操作"
                onChange={v => onChange({ action_id: v })}
                options={actions.map(a => ({ value: a.id, label: `${a.action_name} (${a.action_code})` }))}
                showSearch optionFilterProp="label" allowClear
              />
            </Form.Item>
          </>
        )}

        {/* condition 特有配置 */}
        {config.type === 'condition' && (
          <>
            <Form.Item label="判断字段" tooltip="如: tool_results.node_1.data.status">
              <Input value={config.field} onChange={e => onChange({ field: e.target.value })}
                placeholder="tool_results.node_1.status" />
            </Form.Item>
            <Form.Item label="默认分支(不匹配时)">
              <Select value={config.default_next} allowClear placeholder="选择节点"
                onChange={v => onChange({ default_next: v })}
                options={otherNodes.map(id => ({ value: id, label: id }))} />
            </Form.Item>
          </>
        )}

        {/* confirm 特有配置 */}
        {config.type === 'confirm' && (
          <>
            <Form.Item label="确认标题">
              <Input value={config.title} onChange={e => onChange({ title: e.target.value })} placeholder="请确认" />
            </Form.Item>
            <Form.Item label="确认消息" tooltip="支持 {变量名} 引用">
              <Input.TextArea rows={2} value={config.message} onChange={e => onChange({ message: e.target.value })}
                placeholder="请确认以下信息是否正确" />
            </Form.Item>
            <Form.Item label="拒绝后跳转">
              <Select value={config.reject_next} allowClear placeholder="选择节点"
                onChange={v => onChange({ reject_next: v })}
                options={otherNodes.map(id => ({ value: id, label: id }))} />
            </Form.Item>
          </>
        )}

        {/* llm_call 特有配置 */}
        {config.type === 'llm_call' && (
          <>
            <Form.Item label="提示词" tooltip="支持 {变量名} 引用前序结果">
              <Input.TextArea rows={3} value={config.prompt} onChange={e => onChange({ prompt: e.target.value })}
                placeholder="请根据以下数据回答用户的问题..." />
            </Form.Item>
            <Form.Item label="最大Token">
              <InputNumber value={config.max_tokens} onChange={v => onChange({ max_tokens: v || 512 })}
                min={64} max={8192} style={{ width: '100%' }} placeholder="512" />
            </Form.Item>
          </>
        )}

        {/* reply 特有配置 */}
        {config.type === 'reply' && (
          <Form.Item label="回复文本" tooltip="支持 {变量名} 模板替换">
            <Input.TextArea rows={3} value={config.text} onChange={e => onChange({ text: e.target.value })}
              placeholder="产线 {line_name} 的状态为 {status}" />
          </Form.Item>
        )}

        {/* parallel 特有配置 */}
        {config.type === 'parallel' && (
          <Form.Item label="并行节点" tooltip="选择要并行执行的工具调用节点">
            <Select mode="multiple" value={config.parallel_nodes} placeholder="选择节点"
              onChange={v => onChange({ parallel_nodes: v })}
              options={otherNodes.map(id => ({ value: id, label: id }))} />
          </Form.Item>
        )}

        {/* 通用: 后继节点 */}
        {config.type !== 'condition' && (
          <Form.Item label="下一节点">
            <Select value={config.next || undefined} allowClear placeholder="流程结束"
              onChange={v => onChange({ next: v || null })}
              options={otherNodes.map(id => ({ value: id, label: id }))} />
          </Form.Item>
        )}
      </Form>
    </div>
  );
}
