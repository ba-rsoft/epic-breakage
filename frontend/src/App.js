import React from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import JiraEnhancementUI from "./JiraEnhancementUI";
import 'antd/dist/reset.css';
import { Layout, Button, Typography, Space } from 'antd';

const { Header, Content } = Layout;
const { Title } = Typography;

function HomePage() {
  return (
    <div style={{ textAlign: 'center', padding: '50px' }}>
      <Title level={1}>Welcome to Jira Enhancement Generator</Title>
      <Space direction="vertical" size="large" style={{ marginTop: '30px' }}>
        <p>Please enter a ticket ID in the URL like: /cases/YOUR-TICKET-ID</p>
        {/* Example link */}
        {/* <Link to="/cases/RST-123">
          <Button type="primary">View Sample Case (RST-123)</Button>
        </Link> */}
      </Space>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Layout>
        <Header style={{ background: '#fff', borderBottom: '1px solid #f0f0f0' }}>
          <Link to="/">
            <Title level={3} style={{ margin: '16px 0' }}>Jira Enhancement Generator</Title>
          </Link>
        </Header>
        <Content style={{ padding: '24px', minHeight: 'calc(100vh - 64px)' }}>
          <Routes>
            <Route path="/enhancements/:ticketId" element={<JiraEnhancementUI />} />
            <Route path="/stories/:ticketId" element={<JiraEnhancementUI isBMS={true} />} />
            <Route path="/" element={<HomePage />} />
          </Routes>
        </Content>
      </Layout>
    </Router>
  );
}

export default App;
