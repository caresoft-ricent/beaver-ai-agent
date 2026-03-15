/**
 * 可视化流程编排编辑器 — 基于 React Flow v12+
 *
 * 支持节点类型: tool_call / condition / parallel / confirm / llm_call / reply
 * 拖拽添加节点、连线编排流程，输出 workflow_config JSON
 *
 * UI/UX 遵循商业 SaaS 设计规范：
 * - 重设计节点卡片（顶部色带 + 白底 + 阴影）
 * - 贝塞尔曲线连线
 * - 分组折叠左侧面板（拖拽添加节点）
 * - 右侧属性面板优化（节点选择器显示名称）
 * - 右键上下文菜单 + 快捷键
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  ConnectionLineType,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Button, Space, Select, Input, Form, Divider, Tag, Tooltip,
  Popconfirm, Empty, Typography, InputNumber, Collapse,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  DeleteOutlined, ApiOutlined, BranchesOutlined,
  ThunderboltOutlined, CheckCircleOutlined, RobotOutlined,
  MessageOutlined, QuestionCircleOutlined, SearchOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, CopyOutlined,
  ScissorOutlined, AimOutlined, CloseOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

/* ================================================================
   类型定义
   ================================================================ */

interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  entity_id?: number;
  action_id?: number;
  params?: Record<string, string>;
  output_mapping?: Record<string, string>;
  field?: string;
  branches?: { operator: string; value: string; next: string }[];
  default_next?: string;
  parallel_nodes?: string[];
  title?: string;
  message?: string;
  reject_next?: string;
  prompt?: string;
  max_tokens?: number;
  text?: string;
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

/* ================================================================
   节点类型元数据 — 配色遵循设计规范
   ================================================================ */

const NODE_TYPES_META: {
  type: string; label: string; icon: React.ReactNode;
  color: string; lightBg: string; desc: string; group: 'control' | 'output';
}[] = [
  { type: 'tool_call', label: '工具调用', icon: <ApiOutlined />,          color: '#2563EB', lightBg: '#EFF6FF', desc: '调用外部工具/API',     group: 'control' },
  { type: 'condition', label: '条件判断', icon: <BranchesOutlined />,     color: '#F59E0B', lightBg: '#FFFBEB', desc: '条件分支路由',         group: 'control' },
  { type: 'parallel',  label: '并行执行', icon: <ThunderboltOutlined />,  color: '#7C3AED', lightBg: '#F5F3FF', desc: '并行执行多个分支',     group: 'control' },
  { type: 'confirm',   label: '用户确认', icon: <CheckCircleOutlined />,  color: '#10B981', lightBg: '#ECFDF5', desc: '暂停等待用户确认',     group: 'output' },
  { type: 'llm_call',  label: 'AI 生成',  icon: <RobotOutlined />,       color: '#EC4899', lightBg: '#FDF2F8', desc: '大模型推理生成',       group: 'output' },
  { type: 'reply',     label: '文本回复', icon: <MessageOutlined />,      color: '#06B6D4', lightBg: '#ECFEFF', desc: '模板文本直接输出',     group: 'output' },
];

const getMeta = (type: string) => NODE_TYPES_META.find(n => n.type === type) || NODE_TYPES_META[0];

/* ================================================================
   样式常量
   ================================================================ */

const FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const FONT_MONO = "'SF Mono', 'Menlo', monospace";

const HANDLE_STYLE_BASE: React.CSSProperties = {
  width: 8, height: 8, border: '2px solid #fff', transition: 'all 200ms ease',
};

/* ================================================================
   自定义节点组件 — 重设计卡片
   ================================================================ */

function CustomWorkflowNode({ data, selected }: NodeProps) {
  const meta = getMeta(data.nodeType as string);
  const isStart = data.isStart as boolean;

  return (
    <div
      style={{
        width: 220, minHeight: 80, background: '#fff',
        borderRadius: 12,
        border: selected ? `2px solid ${meta.color}` : '1px solid #E2E8F0',
        boxShadow: selected
          ? '0 4px 16px rgba(0,0,0,0.12)'
          : '0 2px 8px rgba(0,0,0,0.08)',
        transition: 'all 200ms ease',
        fontFamily: FONT_FAMILY,
        position: 'relative',
        overflow: 'visible',
        ...(selected ? { backgroundColor: meta.lightBg } : {}),
      }}
    >
      {/* 顶部色带 */}
      <div style={{
        height: 4, background: meta.color, borderRadius: '12px 12px 0 0',
      }} />

      {/* 起点 badge */}
      {isStart && (
        <div style={{
          position: 'absolute', top: -8, left: -8,
          background: meta.color, color: '#fff', fontSize: 10, fontWeight: 600,
          padding: '1px 6px', borderRadius: 6, lineHeight: '16px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        }}>起点</div>
      )}

      {/* 内容区 */}
      <div style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ color: meta.color, fontSize: 16 }}>{meta.icon}</span>
          <Text strong style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {(data.label as string) || meta.label}
          </Text>
        </div>
        <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.4, display: 'block' }}>
          {data.nodeType === 'tool_call' && data.entityName
            ? `${data.entityName} \u2192 ${data.actionName || '?'}`
            : meta.desc}
        </Text>
      </div>

      {/* 输入端口 — 左侧实心圆 */}
      <Handle
        type="target" position={Position.Left}
        style={{ ...HANDLE_STYLE_BASE, background: meta.color, left: -5, top: '50%' }}
      />
      {/* 输出端口 — 右侧空心圆 */}
      <Handle
        type="source" position={Position.Right}
        style={{ ...HANDLE_STYLE_BASE, background: '#fff', borderColor: meta.color, right: -5, top: '50%' }}
      />
      {/* 条件节点额外端口 */}
      {data.nodeType === 'condition' && (
        <Handle
          type="source" position={Position.Bottom} id="branch-default"
          style={{ ...HANDLE_STYLE_BASE, background: '#fff', borderColor: '#F59E0B', bottom: -5 }}
        />
      )}
    </div>
  );
}

const customNodeTypes = { workflow: CustomWorkflowNode };

/* ================================================================
   默认连线选项 — 贝塞尔曲线
   ================================================================ */

const defaultEdgeOptions = {
  type: 'default',
  style: { stroke: '#CBD5E1', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#CBD5E1', width: 16, height: 16 },
};

/* ================================================================
   内部编辑器 — 使用 useReactFlow 需包裹在 Provider 内
   ================================================================ */

function WorkflowEditorInner({ value, onChange, entities, onLoadActions, fullPage }: WorkflowEditorProps) {
  const reactFlowInstance = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeConfigs, setNodeConfigs] = useState<Record<string, WorkflowNode>>({});
  const [startNode, setStartNode] = useState<string>('');
  const [actionCache, setActionCache] = useState<Record<number, ActionItem[]>>({});
  const [idCounter, setIdCounter] = useState(1);

  // 左侧面板状态
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [nodeSearch, setNodeSearch] = useState('');

  // 右键菜单
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);

  const entityMap = useMemo(() => {
    const m: Record<number, string> = {};
    entities.forEach(e => { m[e.id] = e.entity_name; });
    return m;
  }, [entities]);

  const loadActions = useCallback(async (entityId: number) => {
    if (actionCache[entityId]) return actionCache[entityId];
    const actions = await onLoadActions(entityId);
    setActionCache(prev => ({ ...prev, [entityId]: actions }));
    return actions;
  }, [actionCache, onLoadActions]);

  /* -- 从 value 初始化 -- */
  useEffect(() => {
    if (!value?.nodes?.length) {
      setNodes([]); setEdges([]); setNodeConfigs({}); setStartNode('');
      return;
    }

    const cfgs: Record<string, WorkflowNode> = {};
    value.nodes.forEach(n => { cfgs[n.id] = n; });
    setNodeConfigs(cfgs);
    setStartNode(value.start_node || value.nodes[0]?.id || '');

    const flowNodes: Node[] = value.nodes.map((n, i) => ({
      id: n.id,
      type: 'workflow',
      position: { x: 300 * (i % 4), y: 140 * Math.floor(i / 4) },
      data: {
        label: n.label, nodeType: n.type,
        isStart: n.id === (value.start_node || value.nodes[0]?.id),
        entityName: n.entity_id ? entityMap[n.entity_id] : undefined,
        actionName: '',
      },
    }));

    const flowEdges: Edge[] = [];
    value.nodes.forEach(n => {
      if (n.next) {
        flowEdges.push({
          id: `e-${n.id}-${n.next}`, source: n.id, target: n.next,
          ...defaultEdgeOptions,
        });
      }
      if (n.type === 'condition') {
        (n.branches || []).forEach((b, bi) => {
          if (b.next) {
            flowEdges.push({
              id: `e-${n.id}-br${bi}-${b.next}`,
              source: n.id, target: b.next,
              label: `${b.operator} ${b.value}`,
              style: { stroke: '#10B981', strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981' },
              labelStyle: { fontSize: 11, fill: '#10B981', fontWeight: 500 },
              labelBgStyle: { fill: '#ECFDF5', stroke: '#10B981', strokeWidth: 0.5 },
              labelBgPadding: [6, 4] as [number, number],
              labelBgBorderRadius: 4,
            });
          }
        });
        if (n.default_next) {
          flowEdges.push({
            id: `e-${n.id}-default-${n.default_next}`,
            source: n.id, target: n.default_next,
            sourceHandle: 'branch-default',
            label: '默认',
            style: { stroke: '#F59E0B', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#F59E0B' },
            labelStyle: { fontSize: 11, fill: '#F59E0B', fontWeight: 500 },
            labelBgStyle: { fill: '#FFFBEB', stroke: '#F59E0B', strokeWidth: 0.5 },
            labelBgPadding: [6, 4] as [number, number],
            labelBgBorderRadius: 4,
          });
        }
      }
    });

    setNodes(flowNodes);
    setEdges(flowEdges);

    const maxId = Math.max(0, ...value.nodes.map(n => {
      const m = n.id.match(/node_(\d+)/);
      return m ? parseInt(m[1]) : 0;
    }));
    setIdCounter(maxId + 1);
  }, [value, entityMap]);

  /* -- 同步到外部 -- */
  const syncToParent = useCallback((cfgs: Record<string, WorkflowNode>, start: string, currentEdges: Edge[]) => {
    if (!onChange) return;
    const nextMap: Record<string, string> = {};
    currentEdges.forEach(e => {
      if (!e.sourceHandle || e.sourceHandle === 'source') {
        nextMap[e.source] = e.target;
      }
    });
    const nodeList = Object.values(cfgs).map(n => ({
      ...n, next: nextMap[n.id] || n.next || null,
    }));
    onChange({ version: 1, start_node: start || nodeList[0]?.id || '', nodes: nodeList });
  }, [onChange]);

  /* -- 添加节点 -- */
  const addNode = useCallback((type: string, position?: { x: number; y: number }) => {
    const nodeId = `node_${idCounter}`;
    setIdCounter(prev => prev + 1);

    const meta = getMeta(type);
    const newConfig: WorkflowNode = { id: nodeId, type, label: meta.label };
    const newCfgs = { ...nodeConfigs, [nodeId]: newConfig };
    setNodeConfigs(newCfgs);

    const isFirst = nodes.length === 0;
    if (isFirst) setStartNode(nodeId);

    const pos = position || {
      x: 100 + (nodes.length % 4) * 300,
      y: 60 + Math.floor(nodes.length / 4) * 140,
    };

    const newNode: Node = {
      id: nodeId, type: 'workflow', position: pos,
      data: { label: meta.label, nodeType: type, isStart: isFirst },
    };
    setNodes(prev => [...prev, newNode]);
    syncToParent(newCfgs, isFirst ? nodeId : startNode, edges);
  }, [idCounter, nodeConfigs, nodes, edges, startNode, syncToParent]);

  /* -- 删除节点 -- */
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

  /* -- 复制节点 -- */
  const duplicateNode = useCallback((nodeId: string) => {
    const cfg = nodeConfigs[nodeId];
    if (!cfg) return;
    const origNode = nodes.find(n => n.id === nodeId);
    const pos = origNode
      ? { x: origNode.position.x + 40, y: origNode.position.y + 40 }
      : undefined;
    const newId = `node_${idCounter}`;
    setIdCounter(prev => prev + 1);

    const newConfig: WorkflowNode = { ...cfg, id: newId, next: null };
    const newCfgs = { ...nodeConfigs, [newId]: newConfig };
    setNodeConfigs(newCfgs);

    const newNode: Node = {
      id: newId, type: 'workflow',
      position: pos || { x: 200, y: 200 },
      data: {
        label: cfg.label, nodeType: cfg.type, isStart: false,
        entityName: cfg.entity_id ? entityMap[cfg.entity_id] : undefined,
      },
    };
    setNodes(prev => [...prev, newNode]);
    syncToParent(newCfgs, startNode, edges);
  }, [idCounter, nodeConfigs, nodes, edges, startNode, entityMap, syncToParent]);

  /* -- 断开连线 -- */
  const disconnectNode = useCallback((nodeId: string) => {
    const newEdges = edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    setEdges(newEdges);
    syncToParent(nodeConfigs, startNode, newEdges);
  }, [edges, nodeConfigs, startNode, syncToParent]);

  /* -- 连线 -- */
  const onConnect = useCallback((params: Connection) => {
    setEdges(prev => {
      const newEdges = addEdge({ ...params, ...defaultEdgeOptions }, prev);
      const src = params.source;
      const tgt = params.target;
      if (src && tgt) {
        setNodeConfigs(prevCfg => {
          const updated = { ...prevCfg };
          if (updated[src]) updated[src] = { ...updated[src], next: tgt };
          syncToParent(updated, startNode, newEdges);
          return updated;
        });
      }
      return newEdges;
    });
  }, [startNode, syncToParent]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    setCtxMenu(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setCtxMenu(null);
  }, []);

  /* -- 更新节点配置 -- */
  const updateNodeConfig = useCallback((nodeId: string, patch: Partial<WorkflowNode>) => {
    setNodeConfigs(prev => {
      const updated = { ...prev, [nodeId]: { ...prev[nodeId], ...patch } };
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
      ...n, data: { ...n.data, isStart: n.id === nodeId },
    })));
    syncToParent(nodeConfigs, nodeId, edges);
  }, [nodeConfigs, edges, syncToParent]);

  /* -- 拖拽添加节点 -- */
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/reactflow-type');
    if (!type) return;
    const position = reactFlowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addNode(type, position);
  }, [reactFlowInstance, addNode]);

  /* -- 右键菜单 -- */
  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
    setSelectedNodeId(node.id);
  }, []);

  /* -- 键盘快捷键 -- */
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
      e.preventDefault();
      if (selectedNodeId) duplicateNode(selectedNodeId);
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (selectedNodeId) deleteNode(selectedNodeId);
    }
  }, [selectedNodeId, duplicateNode, deleteNode]);

  /* -- 节点搜索 -- */
  const filteredMeta = useMemo(() => {
    if (!nodeSearch) return NODE_TYPES_META;
    const s = nodeSearch.toLowerCase();
    return NODE_TYPES_META.filter(m => m.label.toLowerCase().includes(s) || m.desc.includes(s));
  }, [nodeSearch]);

  const controlGroup = filteredMeta.filter(m => m.group === 'control');
  const outputGroup = filteredMeta.filter(m => m.group === 'output');

  const selectedConfig = selectedNodeId ? nodeConfigs[selectedNodeId] : null;

  const onDragStartPalette = (e: React.DragEvent, type: string) => {
    e.dataTransfer.setData('application/reactflow-type', type);
    e.dataTransfer.effectAllowed = 'move';
  };

  const ctxMenuItems = ctxMenu ? [
    { key: 'copy', label: '复制节点', icon: <CopyOutlined />, danger: false, disabled: false, onClick: () => { duplicateNode(ctxMenu.nodeId); setCtxMenu(null); } },
    { key: 'delete', label: '删除节点', icon: <DeleteOutlined />, danger: true, disabled: false, onClick: () => { deleteNode(ctxMenu.nodeId); setCtxMenu(null); } },
    { key: 'div1', type: 'divider' as const },
    { key: 'start', label: '设为起点', icon: <AimOutlined />, danger: false, disabled: ctxMenu.nodeId === startNode, onClick: () => { setAsStart(ctxMenu.nodeId); setCtxMenu(null); } },
    { key: 'disconnect', label: '断开所有连线', icon: <ScissorOutlined />, danger: false, disabled: false, onClick: () => { disconnectNode(ctxMenu.nodeId); setCtxMenu(null); } },
  ] : [];

  /* -- 渲染 -- */
  return (
    <div
      ref={wrapperRef}
      style={{
        display: 'flex', height: fullPage ? '100%' : 520,
        border: fullPage ? 'none' : '1px solid #E2E8F0', borderRadius: fullPage ? 0 : 12,
        overflow: 'hidden', fontFamily: FONT_FAMILY, background: '#FAFBFC',
      }}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      {/* ====== 左侧节点面板 ====== */}
      <div style={{
        width: panelCollapsed ? 48 : 240, background: '#fff',
        borderRight: '1px solid #E2E8F0', transition: 'width 200ms ease',
        display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden',
      }}>
        <div style={{
          padding: panelCollapsed ? '12px 8px' : '12px 16px',
          borderBottom: '1px solid #F0F0F0', display: 'flex',
          alignItems: 'center', justifyContent: panelCollapsed ? 'center' : 'space-between',
        }}>
          {!panelCollapsed && <Text strong style={{ fontSize: 13 }}>添加节点</Text>}
          <Tooltip title={panelCollapsed ? '展开面板' : '收起面板'} placement="right">
            <Button size="small" type="text"
              icon={panelCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setPanelCollapsed(!panelCollapsed)}
            />
          </Tooltip>
        </div>

        {panelCollapsed ? (
          <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            {NODE_TYPES_META.map(meta => (
              <Tooltip key={meta.type} title={meta.label} placement="right">
                <div
                  draggable
                  onDragStart={e => onDragStartPalette(e, meta.type)}
                  style={{
                    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'grab', borderRadius: 8, color: meta.color, fontSize: 16,
                    transition: 'background 200ms',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = meta.lightBg)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {meta.icon}
                </div>
              </Tooltip>
            ))}
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
            <Input
              size="small" placeholder="搜索节点..." prefix={<SearchOutlined style={{ color: '#999' }} />}
              value={nodeSearch} onChange={e => setNodeSearch(e.target.value)}
              allowClear style={{ marginBottom: 8, borderRadius: 8 }}
            />
            <Collapse
              ghost size="small" defaultActiveKey={['control', 'output']}
              items={[
                ...(controlGroup.length ? [{
                  key: 'control',
                  label: <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>流程控制</Text>,
                  children: (<>{controlGroup.map(meta => (
                    <NodePaletteItem key={meta.type} meta={meta} onDragStart={onDragStartPalette} onAdd={addNode} />
                  ))}</>),
                }] : []),
                ...(outputGroup.length ? [{
                  key: 'output',
                  label: <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>交互与输出</Text>,
                  children: (<>{outputGroup.map(meta => (
                    <NodePaletteItem key={meta.type} meta={meta} onDragStart={onDragStartPalette} onAdd={addNode} />
                  ))}</>),
                }] : []),
              ]}
            />
            <div style={{ padding: '12px 0 4px', borderTop: '1px solid #F0F0F0', marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.6, display: 'block' }}>
                <QuestionCircleOutlined style={{ marginRight: 4 }} />
                拖拽节点到画布添加；连接端口建立连线；右键节点更多操作
              </Text>
            </div>
          </div>
        )}
      </div>

      {/* ====== 中间画布 ====== */}
      <div style={{ flex: 1, position: 'relative' }}>
        {nodes.length === 0 ? (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 16, background: '#FAFBFC',
          }}>
            <Empty description={false} imageStyle={{ height: 80 }} />
            <div style={{ textAlign: 'center' }}>
              <Text style={{ fontSize: 15, display: 'block', marginBottom: 4 }}>拖拽或点击左侧节点开始编排</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>从左侧面板拖入第一个节点，然后连接端口建立流程</Text>
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onNodeContextMenu={onNodeContextMenu}
            nodeTypes={customNodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            connectionLineType={ConnectionLineType.SmoothStep}
            fitView
            selectionOnDrag
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
            onDragOver={onDragOver}
            onDrop={onDrop}
            snapToGrid
            snapGrid={[20, 20]}
          >
            <Background variant={"dots" as any} gap={20} size={1.5} color="#E2E8F0" />
            <Controls showInteractive={false} style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }} />
            <MiniMap
              nodeColor={(n) => getMeta(n.data?.nodeType as string).color}
              style={{ height: 100, width: 140, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
              maskColor="rgba(0,0,0,0.08)"
            />
          </ReactFlow>
        )}

        {/* 右键菜单 */}
        {ctxMenu && (
          <>
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
              onClick={() => setCtxMenu(null)} />
            <div style={{
              position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 1000,
              background: '#fff', borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
              border: '1px solid #E2E8F0', padding: '4px 0', minWidth: 160,
            }}>
              {ctxMenuItems.map((item) => {
                if (item.type === 'divider') return <Divider key={item.key} style={{ margin: '4px 0' }} />;
                return (
                  <div
                    key={item.key}
                    onClick={item.disabled ? undefined : item.onClick}
                    style={{
                      padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8,
                      cursor: item.disabled ? 'not-allowed' : 'pointer', fontSize: 13,
                      color: item.danger ? '#ff4d4f' : item.disabled ? '#ccc' : '#333',
                      transition: 'background 150ms',
                    }}
                    onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = '#F5F5F5'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ====== 右侧属性面板 ====== */}
      <div style={{
        width: fullPage ? 300 : 280, background: '#fff',
        borderLeft: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        {selectedConfig ? (
          <NodePropertyPanel
            config={selectedConfig}
            entities={entities}
            actionCache={actionCache}
            loadActions={loadActions}
            nodeConfigs={nodeConfigs}
            startNode={startNode}
            onChange={(patch) => updateNodeConfig(selectedNodeId!, patch)}
            onDelete={() => deleteNode(selectedNodeId!)}
            onSetStart={() => setAsStart(selectedNodeId!)}
            onClose={() => setSelectedNodeId(null)}
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ textAlign: 'center' }}>
              <AimOutlined style={{ fontSize: 32, color: '#CBD5E1', marginBottom: 12, display: 'block' }} />
              <Text type="secondary" style={{ fontSize: 13 }}>点击画布中的节点<br/>编辑其属性</Text>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================
   左侧面板 — 节点拖拽项
   ================================================================ */

function NodePaletteItem({ meta, onDragStart, onAdd }: {
  meta: typeof NODE_TYPES_META[number];
  onDragStart: (e: React.DragEvent, type: string) => void;
  onAdd: (type: string) => void;
}) {
  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, meta.type)}
      onClick={() => onAdd(meta.type)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
        marginBottom: 2, borderRadius: 8, cursor: 'grab',
        borderLeft: `3px solid ${meta.color}`, transition: 'background 200ms',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = meta.lightBg)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ color: meta.color, fontSize: 14 }}>{meta.icon}</span>
      <div style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: 500, display: 'block', lineHeight: 1.2 }}>{meta.label}</Text>
        <Text type="secondary" style={{ fontSize: 10 }}>{meta.desc}</Text>
      </div>
    </div>
  );
}

/* ================================================================
   右侧属性面板 — 重设计
   ================================================================ */

interface NodePropertyPanelProps {
  config: WorkflowNode;
  entities: EntityItem[];
  actionCache: Record<number, ActionItem[]>;
  loadActions: (entityId: number) => Promise<ActionItem[]>;
  nodeConfigs: Record<string, WorkflowNode>;
  startNode: string;
  onChange: (patch: Partial<WorkflowNode>) => void;
  onDelete: () => void;
  onSetStart: () => void;
  onClose: () => void;
}

function NodePropertyPanel({
  config, entities, actionCache, loadActions, nodeConfigs, startNode,
  onChange, onDelete, onSetStart, onClose,
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

  const meta = getMeta(config.type);
  const otherNodes = Object.keys(nodeConfigs).filter(id => id !== config.id);

  // 节点选择器选项 — 显示名称+ID
  const nodeSelectOptions = otherNodes.map(id => {
    const cfg = nodeConfigs[id];
    const m = cfg ? getMeta(cfg.type) : null;
    return {
      value: id,
      label: `${m?.label || ''} ${cfg?.label || id} (${id})`,
    };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 顶部色带 + 头部 */}
      <div>
        <div style={{ height: 4, background: meta.color }} />
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #F0F0F0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Space size={6}>
              <span style={{ color: meta.color, fontSize: 16 }}>{meta.icon}</span>
              <Text strong style={{ fontSize: 14 }}>{meta.label}</Text>
            </Space>
            <Space size={2}>
              {config.id !== startNode && (
                <Tooltip title="设为起点">
                  <Button size="small" type="text" onClick={onSetStart} icon={<AimOutlined />} />
                </Tooltip>
              )}
              <Tooltip title="关闭面板">
                <Button size="small" type="text" onClick={onClose} icon={<CloseOutlined />} />
              </Tooltip>
            </Space>
          </div>
          <Text type="secondary" style={{ fontSize: 11, fontFamily: FONT_MONO }}>{config.id}</Text>
        </div>
      </div>

      {/* 表单区 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        <Form size="small" layout="vertical">
          <Form.Item label="节点名称" tooltip="显示在节点卡片上的名称">
            <Input value={config.label} onChange={e => onChange({ label: e.target.value })}
              placeholder="节点名称" style={{ borderRadius: 8 }} />
          </Form.Item>

          {/* tool_call */}
          {config.type === 'tool_call' && (
            <>
              <Form.Item label="本体" tooltip="选择要调用的业务本体">
                <Select
                  value={config.entity_id} placeholder="选择本体"
                  onChange={v => { onChange({ entity_id: v, action_id: undefined }); }}
                  options={entities.map(e => ({ value: e.id, label: `${e.entity_name} (${e.entity_code})` }))}
                  showSearch optionFilterProp="label" allowClear
                />
              </Form.Item>
              <Form.Item label="操作" tooltip="该本体下的操作/API">
                <Select
                  value={config.action_id} placeholder="选择操作"
                  onChange={v => onChange({ action_id: v })}
                  options={actions.map(a => ({ value: a.id, label: `${a.action_name} (${a.action_code})` }))}
                  showSearch optionFilterProp="label" allowClear
                />
              </Form.Item>
            </>
          )}

          {/* condition */}
          {config.type === 'condition' && (
            <>
              <Form.Item label="判断字段" tooltip="引用前序结果，如 tool_results.node_1.data.status">
                <Input value={config.field} onChange={e => onChange({ field: e.target.value })}
                  placeholder="tool_results.node_1.data.status"
                  style={{ borderRadius: 8, fontFamily: FONT_MONO, fontSize: 12 }} />
              </Form.Item>

              <div style={{ marginBottom: 12 }}>
                <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>条件分支</Text>
                {(config.branches || []).map((b, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 4, marginBottom: 4, padding: '6px 8px',
                    background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0', alignItems: 'center',
                  }}>
                    <Select size="small" value={b.operator} style={{ width: 80 }}
                      onChange={v => {
                        const branches = [...(config.branches || [])];
                        branches[i] = { ...branches[i], operator: v };
                        onChange({ branches });
                      }}
                      options={[
                        { value: 'eq', label: '=' }, { value: 'neq', label: '!=' },
                        { value: 'contains', label: '包含' }, { value: 'gt', label: '>' },
                        { value: 'lt', label: '<' },
                      ]}
                    />
                    <Input size="small" value={b.value} placeholder="值" style={{ width: 60, borderRadius: 6 }}
                      onChange={e => {
                        const branches = [...(config.branches || [])];
                        branches[i] = { ...branches[i], value: e.target.value };
                        onChange({ branches });
                      }}
                    />
                    <span style={{ fontSize: 11, color: '#999' }}>{'\u2192'}</span>
                    <Select size="small" value={b.next || undefined} placeholder="节点" style={{ flex: 1 }}
                      onChange={v => {
                        const branches = [...(config.branches || [])];
                        branches[i] = { ...branches[i], next: v };
                        onChange({ branches });
                      }}
                      options={nodeSelectOptions}
                      allowClear
                    />
                    <Button size="small" type="text" danger icon={<DeleteOutlined />}
                      onClick={() => {
                        const branches = [...(config.branches || [])];
                        branches.splice(i, 1);
                        onChange({ branches });
                      }}
                    />
                  </div>
                ))}
                <Button size="small" type="dashed" block style={{ borderRadius: 8, marginTop: 4 }}
                  onClick={() => {
                    const branches = [...(config.branches || []), { operator: 'eq', value: '', next: '' }];
                    onChange({ branches });
                  }}
                >+ 添加分支</Button>
              </div>

              <Form.Item label="默认分支" tooltip="所有条件不匹配时走此分支">
                <Select value={config.default_next} allowClear placeholder="选择节点"
                  onChange={v => onChange({ default_next: v })}
                  options={nodeSelectOptions} />
              </Form.Item>
            </>
          )}

          {/* confirm */}
          {config.type === 'confirm' && (
            <>
              <Form.Item label="确认标题" tooltip="显示给用户的确认弹窗标题">
                <Input value={config.title} onChange={e => onChange({ title: e.target.value })}
                  placeholder="请确认" style={{ borderRadius: 8 }} />
              </Form.Item>
              <Form.Item label="确认消息" tooltip="支持变量引用前序结果">
                <Input.TextArea rows={2} value={config.message} onChange={e => onChange({ message: e.target.value })}
                  placeholder="请确认以下信息是否正确" style={{ borderRadius: 8 }} />
              </Form.Item>
              <Form.Item label="拒绝后跳转" tooltip="用户点击取消后跳转到的节点">
                <Select value={config.reject_next} allowClear placeholder="选择节点"
                  onChange={v => onChange({ reject_next: v })}
                  options={nodeSelectOptions} />
              </Form.Item>
            </>
          )}

          {/* llm_call */}
          {config.type === 'llm_call' && (
            <>
              <Form.Item label="提示词" tooltip="支持变量引用前序结果">
                <Input.TextArea rows={3} value={config.prompt} onChange={e => onChange({ prompt: e.target.value })}
                  placeholder="请根据以下数据回答用户的问题..."
                  style={{ borderRadius: 8, fontFamily: FONT_MONO, fontSize: 12 }} />
              </Form.Item>
              <Form.Item label="最大 Token" tooltip="生成回答的最大 token 数">
                <InputNumber value={config.max_tokens} onChange={v => onChange({ max_tokens: v || 512 })}
                  min={64} max={8192} style={{ width: '100%' }} placeholder="512" />
              </Form.Item>
            </>
          )}

          {/* reply */}
          {config.type === 'reply' && (
            <Form.Item label="回复文本" tooltip="支持变量模板替换">
              <Input.TextArea rows={3} value={config.text} onChange={e => onChange({ text: e.target.value })}
                placeholder="展示查询结果"
                style={{ borderRadius: 8, fontFamily: FONT_MONO, fontSize: 12 }} />
            </Form.Item>
          )}

          {/* parallel */}
          {config.type === 'parallel' && (
            <Form.Item label="并行节点" tooltip="选择要并行执行的节点">
              <Select mode="multiple" value={config.parallel_nodes} placeholder="选择节点"
                onChange={v => onChange({ parallel_nodes: v })}
                options={nodeSelectOptions} />
            </Form.Item>
          )}

          {/* 下一节点 */}
          {config.type !== 'condition' && (
            <Form.Item label="下一节点" tooltip="当前节点执行完成后的下一步">
              <Select value={config.next || undefined} allowClear placeholder="流程结束"
                onChange={v => onChange({ next: v || null })}
                options={nodeSelectOptions} />
            </Form.Item>
          )}
        </Form>
      </div>

      {/* 底部操作 */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #F0F0F0' }}>
        <Popconfirm title="确认删除此节点?" onConfirm={onDelete} okText="确认" cancelText="取消">
          <Button size="small" danger block icon={<DeleteOutlined />}>删除节点</Button>
        </Popconfirm>
      </div>
    </div>
  );
}

/* ================================================================
   导出组件 — 包裹 ReactFlowProvider
   ================================================================ */

export default function WorkflowEditor(props: WorkflowEditorProps) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner {...props} />
    </ReactFlowProvider>
  );
}
