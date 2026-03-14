import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, theme, Dropdown, Modal, Form, Input, message } from 'antd';
import {
  TeamOutlined,
  ApiOutlined,
  RobotOutlined,
  ApartmentOutlined,
  ThunderboltOutlined,
  DashboardOutlined,
  CommentOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  UserOutlined,
  KeyOutlined,
  FileSearchOutlined,
} from '@ant-design/icons';
import { changePassword } from '../api/admin';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/tenants', icon: <TeamOutlined />, label: '租户管理' },
  { key: '/connectors', icon: <ApiOutlined />, label: '连接器' },
  { key: '/llm', icon: <RobotOutlined />, label: '大模型配置' },
  { key: '/ontology', icon: <ApartmentOutlined />, label: '业务本体' },
  { key: '/intents', icon: <ThunderboltOutlined />, label: '技能/意图' },
  { key: '/logs', icon: <FileSearchOutlined />, label: '日志查询' },
  { type: 'divider' as const },
  { key: '/chat', icon: <CommentOutlined />, label: '对话测试' },
];

const PASSWORD_RULES = [
  { required: true, message: '请输入密码' },
  { min: 8, message: '至少 8 个字符' },
  {
    pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':",./<>?\\|`~])/,
    message: '需包含大写、小写、数字和特殊字符',
  },
];

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdForm] = Form.useForm();
  const navigate = useNavigate();
  const location = useLocation();
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

  const user = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
  })();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleChangePassword = async () => {
    const values = await pwdForm.validateFields();
    if (values.new_password !== values.confirm_password) {
      message.error('两次输入的新密码不一致');
      return;
    }
    setPwdLoading(true);
    try {
      const res = await changePassword({
        old_password: values.old_password,
        new_password: values.new_password,
      });
      if (res.data.code === 0) {
        message.success('密码修改成功，请重新登录');
        setPwdModalOpen(false);
        pwdForm.resetFields();
        handleLogout();
      } else {
        message.error(res.data.message || '修改失败');
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      // Pydantic validation errors come as array
      if (Array.isArray(detail)) {
        const msgs = detail.map((d: any) => d.msg?.replace('Value error, ', '') || d.msg).join('；');
        message.error(msgs);
      } else {
        message.error(detail || '修改失败');
      }
    } finally {
      setPwdLoading(false);
    }
  };

  const userMenuItems = [
    { key: 'pwd', icon: <KeyOutlined />, label: '修改密码', onClick: () => setPwdModalOpen(true) },
    { type: 'divider' as const },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true, onClick: handleLogout },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed} theme="dark">
        <div style={{ height: 48, margin: 16, display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 10 }}>
          <img src="/logo.png" alt="logo" style={{ width: 32, height: 32, borderRadius: 6, flexShrink: 0 }} />
          {!collapsed && (
            <span style={{ color: '#fff', fontSize: 16, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
              河狸云 AI 管理
            </span>
          )}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: '0 16px', background: colorBgContainer, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Button type="text" icon={<UserOutlined />}>
              {user.display_name || user.username || '管理员'}
            </Button>
          </Dropdown>
        </Header>
        <Content style={{ margin: 16, padding: 24, background: colorBgContainer, borderRadius: borderRadiusLG, minHeight: 280, overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>

      <Modal
        title="修改密码"
        open={pwdModalOpen}
        onOk={handleChangePassword}
        onCancel={() => { setPwdModalOpen(false); pwdForm.resetFields(); }}
        confirmLoading={pwdLoading}
        destroyOnClose
      >
        <Form form={pwdForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="old_password" label="原密码" rules={[{ required: true, message: '请输入原密码' }]}>
            <Input.Password placeholder="输入当前密码" />
          </Form.Item>
          <Form.Item name="new_password" label="新密码" rules={PASSWORD_RULES}>
            <Input.Password placeholder="至少8位，含大小写+数字+特殊字符" />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label="确认新密码"
            dependencies={['new_password']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="再次输入新密码" />
          </Form.Item>
        </Form>
        <div style={{ color: '#888', fontSize: 12, marginTop: -8 }}>
          密码要求：至少 8 位，包含大写字母、小写字母、数字和特殊字符
        </div>
      </Modal>
    </Layout>
  );
}
