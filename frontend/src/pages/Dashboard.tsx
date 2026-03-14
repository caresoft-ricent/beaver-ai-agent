import { Card, Row, Col, Statistic } from 'antd';
import { TeamOutlined, ApiOutlined, RobotOutlined, ThunderboltOutlined } from '@ant-design/icons';

export default function Dashboard() {
  return (
    <>
      <h2>仪表盘</h2>
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic title="租户数" value={1} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="连接器" value={0} prefix={<ApiOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="大模型配置" value={0} prefix={<RobotOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="技能" value={0} prefix={<ThunderboltOutlined />} />
          </Card>
        </Col>
      </Row>
    </>
  );
}
