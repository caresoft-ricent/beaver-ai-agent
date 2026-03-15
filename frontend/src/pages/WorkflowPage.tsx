/**
 * 全屏流程编排页面
 *
 * 路由: /intents/:id/workflow
 * 加载指定技能的 workflow_config，全屏体验编辑后保存回 API。
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, message, Space, Spin, Tag, Typography, Tooltip, Drawer, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, QuestionCircleOutlined,
  ApartmentOutlined, DownloadOutlined, UploadOutlined, MoreOutlined,
} from '@ant-design/icons';
import { getSkill, updateSkill, getEntities, getActions } from '../api/admin';
import WorkflowEditor from '../components/WorkflowEditor';

const { Title, Text, Paragraph } = Typography;

interface EntityItem { id: number; entity_code: string; entity_name: string }
interface WorkflowConfig {
  version: number;
  start_node: string;
  nodes: Array<Record<string, unknown>>;
}

export default function WorkflowPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [skillName, setSkillName] = useState('');
  const [skillCode, setSkillCode] = useState('');
  const [workflowConfig, setWorkflowConfig] = useState<WorkflowConfig | null>(null);
  const [entities, setEntities] = useState<EntityItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const moreMenuItems: MenuProps['items'] = [
    {
      key: 'export', label: '导出 JSON', icon: <DownloadOutlined />,
      onClick: () => {
        if (!workflowConfig) { message.warning('暂无流程数据'); return; }
        const blob = new Blob([JSON.stringify(workflowConfig, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `workflow-${skillCode || id}.json`;
        a.click();
        URL.revokeObjectURL(url);
      },
    },
    {
      key: 'import', label: '导入 JSON', icon: <UploadOutlined />,
      onClick: () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          try {
            const text = await file.text();
            const cfg = JSON.parse(text);
            if (cfg && cfg.nodes) {
              setWorkflowConfig(cfg);
              setDirty(true);
              message.success('导入成功');
            } else {
              message.error('无效的流程配置文件');
            }
          } catch {
            message.error('文件解析失败');
          }
        };
        input.click();
      },
    },
  ];

  // 加载技能数据 & 实体列表
  useEffect(() => {
    if (!id) return;
    const loadData = async () => {
      setLoading(true);
      try {
        const [skillRes, entityRes] = await Promise.all([
          getSkill(Number(id)),
          getEntities(),
        ]);
        const skill = skillRes.data.data;
        setSkillName(skill.skill_name || '');
        setSkillCode(skill.skill_code || '');
        setWorkflowConfig(skill.workflow_config || null);
        setEntities(entityRes.data.data?.items || []);
      } catch {
        message.error('加载技能失败');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [id]);

  const handleChange = useCallback((cfg: WorkflowConfig) => {
    setWorkflowConfig(cfg);
    setDirty(true);
  }, []);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await updateSkill(Number(id), {
        flow_type: 'workflow',
        workflow_config: workflowConfig,
      });
      message.success('流程已保存');
      setDirty(false);
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (dirty) {
      if (!window.confirm('有未保存的修改，确认离开？')) return;
    }
    navigate('/intents');
  };

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#FAFBFC' }}>
      {/* 顶部操作栏 */}
      <div style={{
        height: 56, padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid #E2E8F0', background: '#fff', flexShrink: 0,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}>
        <Space size={16}>
          <Tooltip title="返回技能列表">
            <Button icon={<ArrowLeftOutlined />} onClick={handleBack} />
          </Tooltip>
          <div style={{ height: 24, width: 1, background: '#E2E8F0' }} />
          <ApartmentOutlined style={{ fontSize: 18, color: '#7C3AED' }} />
          <div>
            <Title level={5} style={{ margin: 0, lineHeight: 1.3, fontSize: 15 }}>{skillName}</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>{skillCode} · 流程编排</Text>
          </div>
          {dirty && <Tag color="orange">未保存</Tag>}
        </Space>
        <Space size={8}>
          <Button icon={<QuestionCircleOutlined />} onClick={() => setHelpOpen(true)}>操作说明</Button>
          <Dropdown menu={{ items: moreMenuItems }} placement="bottomRight">
            <Button icon={<MoreOutlined />} />
          </Dropdown>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
            保存
          </Button>
        </Space>
      </div>

      {/* 编辑器主体 —— 填满剩余高度 */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <WorkflowEditor
          value={workflowConfig as any}
          onChange={handleChange}
          entities={entities}
          onLoadActions={async (entityId) => {
            const res = await getActions(entityId);
            return res.data.data || [];
          }}
          fullPage
        />
      </div>

      {/* 操作说明抽屉 */}
      <Drawer
        title="流程编排操作说明"
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        width={420}
      >
        <Typography>
          <Title level={5}>快速开始</Title>
          <Paragraph>
            <ol>
              <li>从<b>左侧面板</b>点击节点类型按钮，在画布上创建节点</li>
              <li>从一个节点的<b>底部连接点</b>拖拽到另一个节点的<b>顶部连接点</b>来建立连线</li>
              <li>点击画布中的节点，在<b>右侧属性面板</b>配置参数</li>
              <li>点击右上角<b>「保存」</b>按钮保存流程</li>
            </ol>
          </Paragraph>

          <Title level={5}>节点类型</Title>
          <Paragraph>
            <ul>
              <li><Tag color="#2563EB">工具调用</Tag> 调用业务本体的操作/API，获取数据或执行动作</li>
              <li><Tag color="#F59E0B">条件判断</Tag> 根据前序节点的结果进行条件分支路由</li>
              <li><Tag color="#7C3AED">并行执行</Tag> 同时执行多个工具调用节点，提升效率</li>
              <li><Tag color="#10B981">用户确认</Tag> 暂停流程，等待用户确认后继续</li>
              <li><Tag color="#EC4899">AI 生成</Tag> 调用大语言模型生成回答</li>
              <li><Tag color="#06B6D4">文本回复</Tag> 直接输出预设的模板文本</li>
            </ul>
          </Paragraph>

          <Title level={5}>画布操作</Title>
          <Paragraph>
            <ul>
              <li><b>添加节点</b> — 从左侧面板拖拽或点击节点类型</li>
              <li><b>建立连线</b> — 从一个节点右侧端口拖拽到另一节点左侧端口</li>
              <li><b>平移画布</b> — 在画布空白处拖动鼠标</li>
              <li><b>缩放画布</b> — 鼠标滚轮或左下角缩放按钮</li>
              <li><b>框选节点</b> — 按住鼠标在画布空白处拖动框选</li>
              <li><b>右键菜单</b> — 右键节点可复制、删除、设为起点、断开连线</li>
              <li><b>删除</b> — 选中节点后按 Delete/Backspace 键</li>
              <li><b>复制节点</b> — Ctrl/⌘ + D</li>
              <li><b>设为起点</b> — 右键菜单或属性面板中设置</li>
            </ul>
          </Paragraph>

          <Title level={5}>变量引用</Title>
          <Paragraph>
            在<b>条件判断</b>、<b>文本回复</b>、<b>AI 生成</b>节点中，可以使用 <Text code>{'${tool_results.node_1.data.字段名}'}</Text> 语法引用前序工具调用结果。
          </Paragraph>
          <Paragraph>
            例如：<br/>
            · 条件字段: <Text code>tool_results.node_1.data.status</Text><br/>
            · 回复模板: <Text code>{'产线 ${tool_results.node_1.data.line_name} 状态正常'}</Text>
          </Paragraph>

          <Title level={5}>典型流程示例</Title>
          <Paragraph>
            <b>示例: 查询并确认</b>
            <ol>
              <li>工具调用 → 查询数据</li>
              <li>条件判断 → 检查是否有结果</li>
              <li>有结果 → 文本回复（展示数据）</li>
              <li>无结果 → AI 生成（用 LLM 给出友好提示）</li>
            </ol>
          </Paragraph>
          <Paragraph>
            <b>示例: 多步操作确认</b>
            <ol>
              <li>工具调用 → 查询当前状态</li>
              <li>用户确认 → 确认是否执行变更</li>
              <li>确认执行 → 工具调用（执行变更操作）</li>
              <li>文本回复 → 输出操作结果</li>
            </ol>
          </Paragraph>
        </Typography>
      </Drawer>
    </div>
  );
}
