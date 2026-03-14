import { Card, Row, Col, Statistic, Spin } from 'antd';
import { TeamOutlined, ApiOutlined, RobotOutlined, ThunderboltOutlined, ApartmentOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';

interface Stats {
  tenants: number;
  connectors: number;
  llm_configs: number;
  entities: number;
  skills: number;
}

const cards: { key: keyof Stats; title: string; icon: React.ReactNode; route: string; span: number }[] = [
  { key: 'tenants', title: '租户数', icon: <TeamOutlined />, route: '/tenants', span: 4 },
  { key: 'connectors', title: '连接器', icon: <ApiOutlined />, route: '/connectors', span: 5 },
  { key: 'llm_configs', title: '大模型配置', icon: <RobotOutlined />, route: '/llm', span: 5 },
  { key: 'entities', title: '业务本体', icon: <ApartmentOutlined />, route: '/ontology', span: 5 },
  { key: 'skills', title: '已发布技能', icon: <ThunderboltOutlined />, route: '/intents', span: 5 },
];

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    client.get('/admin/stats').then((res) => setStats(res.data));
  }, []);

  if (!stats) return <Spin style={{ marginTop: 100, display: 'block', textAlign: 'center' }} />;

  return (
    <>
      <h2>仪表盘</h2>
      <Row gutter={[16, 16]}>
        {cards.map((c) => (
          <Col span={c.span} key={c.key}>
            <Card
              hoverable
              onClick={() => navigate(c.route)}
              style={{ cursor: 'pointer' }}
            >
              <Statistic title={c.title} value={stats[c.key]} prefix={c.icon} />
            </Card>
          </Col>
        ))}
      </Row>
    </>
  );
}
