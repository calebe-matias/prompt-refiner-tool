'use client';

import React, { useState, useEffect } from 'react';
import {
  ConfigProvider,
  Layout,
  Card,
  Input,
  Select,
  Button,
  Typography,
  Divider,
  message,
  Tag,
  Tabs,
  Tooltip,
} from 'antd';
import {
  LoadingOutlined,
  PlayCircleFilled,
  InfoCircleOutlined,
} from '@ant-design/icons';

const { Header, Content } = Layout;
const { TextArea } = Input;
const { Title, Text } = Typography;
const { Option } = Select;

const MODELS = [
  'gpt-4.1-nano',
  'gpt-4.1-mini',
  'gpt-4.1',
  'o3-mini',
] as const;
type ModelType = typeof MODELS[number];

/** Reusable row layout matching Anamnai’s Design System */
function SettingRow({
  label,
  description,
  children,
  bottomBorder = false,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  bottomBorder?: boolean;
}) {
  return (
    <div
      className={`
        grid grid-cols-1 md:grid-cols-2 items-center
        py-4 px-4 sm:px-6 gap-y-2 md:gap-y-0
        ${bottomBorder ? 'border-b border-gray-200' : ''}
      `}
    >
      <div>
        <div className="text-sm font-medium mb-1 text-gray-800">{label}</div>
        {description && (
          <div className="text-xs text-gray-500">{description}</div>
        )}
      </div>
      <div className="flex justify-start md:justify-end">{children}</div>
    </div>
  );
}

export default function Home() {
  // — Tabs
  const [activeTab, setActiveTab] = useState<'config' | 'results'>('config');

  // — Form state
  const [model, setModel] = useState<ModelType>(MODELS[0]);
  const [sysA, setSysA]   = useState('');
  const [userA, setUserA] = useState('');
  const [sysB, setSysB]   = useState('');
  const [userB, setUserB] = useState('');

  // — Outputs
  const [resp1, setResp1]   = useState('');
  const [resp2, setResp2]   = useState('');
  const [loading, setLoading] = useState(false);

  // — A-placeholders
  const [placeholdersA, setPlaceholdersA] = useState<string[]>([]);
  const [valuesA, setValuesA] = useState<Record<string,string>>({});

  useEffect(() => {
    const rx = /\$\{([^}]+)\}/g;
    const found = new Set<string>();
    for (const txt of [sysA, userA]) {
      let m;
      while ((m = rx.exec(txt))) found.add(m[1]);
    }
    setPlaceholdersA(Array.from(found));
  }, [sysA, userA]);

  useEffect(() => {
    setValuesA(prev => {
      const nxt: Record<string,string> = {};
      placeholdersA.forEach(ph => {
        nxt[ph] = prev[ph] ?? '';
      });
      return nxt;
    });
  }, [placeholdersA]);

  // — B-placeholders (including FIRST_RESPONSE)
  const [placeholdersB, setPlaceholdersB] = useState<string[]>([]);
  const [valuesB, setValuesB] = useState<Record<string,string>>({});

  useEffect(() => {
    const rx = /\$\{([^}]+)\}/g;
    const found = new Set<string>();
    for (const txt of [sysB, userB]) {
      let m;
      while ((m = rx.exec(txt))) found.add(m[1]);
    }
    setPlaceholdersB(Array.from(found));
  }, [sysB, userB]);

  useEffect(() => {
    setValuesB(prev => {
      const nxt: Record<string,string> = {};
      placeholdersB.forEach(ph => {
        // auto-fill FIRST_RESPONSE when it appears
        nxt[ph] = ph === 'FIRST_RESPONSE' ? resp1 : prev[ph] ?? '';
      });
      return nxt;
    });
  }, [placeholdersB, resp1]);

  // — Run both calls
  async function runChain() {
    if (!sysA.trim() && !userA.trim()) {
      return message.error('First prompts cannot be empty');
    }
    setLoading(true);
    setResp1('');
    setResp2('');

    try {
      // 1️⃣ Replace A-placeholders
      let pSysA  = sysA;
      let pUserA = userA;
      Object.entries(valuesA).forEach(([k,v]) => {
        pSysA  = pSysA.replace(new RegExp(`\\$\\{${k}\\}`, 'g'), v);
        pUserA = pUserA.replace(new RegExp(`\\$\\{${k}\\}`, 'g'), v);
      });

      // 2️⃣ Replace B-placeholders except FIRST_RESPONSE
      let pSysB  = sysB;
      let pUserB = userB;
      Object.entries(valuesB).forEach(([k,v]) => {
        if (k !== 'FIRST_RESPONSE') {
          pSysB  = pSysB.replace(new RegExp(`\\$\\{${k}\\}`, 'g'), v);
          pUserB = pUserB.replace(new RegExp(`\\$\\{${k}\\}`, 'g'), v);
        }
      });

      // 3️⃣ Call your serverless endpoint
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          sysA: pSysA,
          userA: pUserA,
          sysB: pSysB,
          userB: pUserB,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setResp1(data.first);
      setResp2(data.second);
      message.success(
        `Ran with ${placeholdersA.length} A-placeholders and ${placeholdersB.length} B-placeholders`,
        2
      );
      setActiveTab('results');
    } catch (err: any) {
      message.error(err.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  // — Tab contents
  const configureTab = (
    <>
      {/* Model selector */}
      <Card className="rounded-2xl shadow-sm mb-6">
        <SettingRow
          bottomBorder
          label={<Text strong>Model</Text>}
          description="Choose your LLM"
        >
          <Select
            value={model}
            onChange={setModel}
            className="w-full sm:w-64"
            placeholder="Select model"
          >
            {MODELS.map(m => (
              <Option key={m} value={m}>{m}</Option>
            ))}
          </Select>
        </SettingRow>
      </Card>

      {/* First Call */}
      <Card title="First Call" className="rounded-2xl shadow-sm mb-6">
        <SettingRow bottomBorder label="System Prompt A">
          <TextArea
            rows={6}
            value={sysA}
            onChange={e => setSysA(e.target.value)}
            placeholder="Enter system prompt A"
            className="border-none bg-gray-100"
          />
        </SettingRow>
        <SettingRow label="User Prompt A">
          <TextArea
            rows={6}
            value={userA}
            onChange={e => setUserA(e.target.value)}
            placeholder="Enter user prompt A"
            className="border-none bg-gray-100"
          />
        </SettingRow>
      </Card>

      {/* A­-placeholder values */}
      {placeholdersA.length > 0 && (
        <Card
          title={
            <>
              Placeholder Values{' '}
              <Tooltip title="Auto-detected from ${var} in First Call prompts">
                <InfoCircleOutlined />
              </Tooltip>
            </>
          }
          className="rounded-2xl shadow-sm mb-6"
        >
          {placeholdersA.map(ph => (
            <SettingRow key={ph} bottomBorder label={`Value for \`${ph}\``}>
              <TextArea
                rows={2}
                value={valuesA[ph]}
                onChange={e =>
                  setValuesA(prev => ({ ...prev, [ph]: e.target.value }))
                }
                placeholder={`Enter value for ${ph}`}
                className="border-none bg-gray-100 w-full sm:w-64"
              />
            </SettingRow>
          ))}
        </Card>
      )}

      {/* First Response Injection */}
      {resp1 && (
        <Card title="First Response Injection" className="rounded-2xl shadow-sm mb-6">
          <SettingRow
            bottomBorder
            label={<Text strong>Insert First Response</Text>}
            description="Will become ${FIRST_RESPONSE} in B-prompts"
          >
            <Tooltip title="Append full first response into Prompt B">
              <Button size="small" onClick={() => setSysB(prev => prev + resp1)}>
                To System B
              </Button>
            </Tooltip>
            <Tooltip title="Append full first response into Prompt B">
              <Button size="small" onClick={() => setUserB(prev => prev + resp1)}>
                To User B
              </Button>
            </Tooltip>
          </SettingRow>
        </Card>
      )}

      {/* Second Call */}
      <Card title="Second Call" className="rounded-2xl shadow-sm mb-6">
        <SettingRow bottomBorder label="System Prompt B">
          <TextArea
            rows={6}
            value={sysB}
            onChange={e => setSysB(e.target.value)}
            placeholder="Enter system prompt B"
            className="border-none bg-gray-100"
          />
        </SettingRow>
        <SettingRow
          label="User Prompt B"
          description="Use ${placeholder} or let FIRST_RESPONSE inject"
        >
          <TextArea
            rows={6}
            value={userB}
            onChange={e => setUserB(e.target.value)}
            placeholder="Enter user prompt B"
            className="border-none bg-gray-100"
          />
        </SettingRow>
      </Card>

      {/* B­-placeholder values */}
      {placeholdersB.length > 0 && (
        <Card
          title={
            <>
              Second-Prompt Values{' '}
              <Tooltip title="Auto-detected from ${var} in Second Call prompts">
                <InfoCircleOutlined />
              </Tooltip>
            </>
          }
          className="rounded-2xl shadow-sm mb-6"
        >
          {placeholdersB.map(ph => (
            <SettingRow key={ph} bottomBorder label={`Value for \`${ph}\``}>
              <TextArea
                rows={2}
                value={valuesB[ph]}
                onChange={e =>
                  setValuesB(prev => ({ ...prev, [ph]: e.target.value }))
                }
                placeholder={`Enter value for ${ph}`}
                className="border-none bg-gray-100 w-full sm:w-64"
              />
            </SettingRow>
          ))}
        </Card>
      )}

      {/* Run */}
      <div className="px-4 mb-6">
        <Button
          type="primary"
          block
          size="large"
          icon={loading ? <LoadingOutlined /> : <PlayCircleFilled />}
          onClick={runChain}
          loading={loading}
          className="rounded-full mt-4"
        >
          Run Chain
        </Button>
      </div>
    </>
  );

  const resultsTab = (
    <Card title="Results" className="rounded-2xl shadow-sm my-6">
      <Divider />
      <div className="grid md:grid-cols-2 gap-4">
        <TextArea
          rows={10}
          value={resp1}
          readOnly
          className="border-none bg-gray-50"
        />
        <TextArea
          rows={10}
          value={resp2}
          readOnly
          className="border-none bg-gray-50"
        />
      </div>
    </Card>
  );

  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#33B9B1' } }}>
      <Layout className="min-h-screen bg-gray-50">
        <Header 
          className="bg-white shadow-sm px-6 flex items-center"
          style={{ backgroundColor: '#fff' }}
          >
          <Title level={3} className="!m-0 text-[#33B9B1]">
            Anamnai Prompt Tuner
          </Title>
        </Header>

        <Content className="py-6 px-4 md:px-0 max-w-4xl mx-auto">
          <Tabs
            activeKey={activeTab}
            onChange={key => setActiveTab(key as any)}
            className="mb-6"
            items={[
              { key: 'config', label: 'Configure', children: configureTab },
              { key: 'results', label: 'Results',  children: resultsTab  },
            ]}
          />
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
