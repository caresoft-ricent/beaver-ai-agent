import { Card, Row, Col, Statistic, Spin } from 'antd';
import { TeamOutlined, ApiOutlined, RobotOutlined, ThunderboltOutlined, ApartmentOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import client from '../api/client';

interface Stats {
  tenants: number;
  connectors: number;
  llm_configs: number;
  entities: number;
  skills: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    client.get('/admin/stats').then((res) => setStats(res.data));
  }, []);

  if (!stats) return <Spin style={{ marginTop: 100, display: 'block', textAlign: 'center' }} />;

  return (
    <>
      <h2>仪表盘</h2>
      <Row gutter={[16, 16]}>
        <Col span={4}>
          <Card>
            <Statistic title="租户数" value={stats.tenants} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic title="连接器" value={stats.connectors} prefix={<ApiOutlined />} />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic title="大模型配置" value={stats.llm_configs} prefix={<RobotOutlined />} />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic title="业务本体" value={stats.entities} prefix={<ApartmentOutlined />} />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic title="已发布技能" value={stats.skills} prefix={<ThunderboltOutlined />} />
          </Card>
        </Col>
      </Row>
    </>
  );
}
