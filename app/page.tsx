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

  // — First-Call placeholders
  const [placeholdersSysA, setPlaceholdersSysA] = useState<string[]>([]);
  const [placeholdersUserA, setPlaceholdersUserA] = useState<string[]>([]);
  const [valuesA, setValuesA] = useState<Record<string,string>>({});

  useEffect(() => {
    const rx = /\$\{([^}]+)\}/g;
    const found = new Set<string>();
    let m;
    while ((m = rx.exec(sysA))) found.add(m[1]);
    setPlaceholdersSysA(Array.from(found));
  }, [sysA]);

  useEffect(() => {
    const rx = /\$\{([^}]+)\}/g;
    const found = new Set<string>();
    let m;
    while ((m = rx.exec(userA))) found.add(m[1]);
    setPlaceholdersUserA(Array.from(found));
  }, [userA]);

  // initialize A-values whenever placeholders change
  useEffect(() => {
    setValuesA(prev => {
      const nxt: Record<string,string> = {};
      [...placeholdersSysA, ...placeholdersUserA].forEach(ph => {
        nxt[ph] = prev[ph] ?? '';
      });
      return nxt;
    });
  }, [placeholdersSysA, placeholdersUserA]);

  // — Second-Call placeholders (incl. FIRST_RESPONSE)
  const [placeholdersSysB, setPlaceholdersSysB] = useState<string[]>([]);
  const [placeholdersUserB, setPlaceholdersUserB] = useState<string[]>([]);
  const [valuesB, setValuesB] = useState<Record<string,string>>({});

  useEffect(() => {
    const rx = /\$\{([^}]+)\}/g;
    const found = new Set<string>();
    let m;
    while ((m = rx.exec(sysB))) found.add(m[1]);
    setPlaceholdersSysB(Array.from(found));
  }, [sysB]);

  useEffect(() => {
    const rx = /\$\{([^}]+)\}/g;
    const found = new Set<string>();
    let m;
    while ((m = rx.exec(userB))) found.add(m[1]);
    setPlaceholdersUserB(Array.from(found));
  }, [userB]);

  useEffect(() => {
    setValuesB(prev => {
      const nxt: Record<string,string> = {};
      [...placeholdersSysB, ...placeholdersUserB].forEach(ph => {
        // auto-fill FIRST_RESPONSE
        nxt[ph] = ph === 'FIRST_RESPONSE' ? resp1 : prev[ph] ?? '';
      });
      return nxt;
    });
  }, [placeholdersSysB, placeholdersUserB, resp1]);

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
        const pat = new RegExp(`\\$\\{${k}\\}`, 'g');
        pSysA  = pSysA.replace(pat, v);
        pUserA = pUserA.replace(pat, v);
      });

      // 2️⃣ Replace B-placeholders (except FIRST_RESPONSE)
      let pSysB  = sysB;
      let pUserB = userB;
      Object.entries(valuesB).forEach(([k,v]) => {
        if (k !== 'FIRST_RESPONSE') {
          const pat = new RegExp(`\\$\\{${k}\\}`, 'g');
          pSysB  = pSysB.replace(pat, v);
          pUserB = pUserB.replace(pat, v);
        }
      });

      // 3️⃣ Serverless chain
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
        `Ran with ${placeholdersSysA.length+placeholdersUserA.length} First-Call and ${placeholdersSysB.length+placeholdersUserB.length} Second-Call placeholders`,
        2
      );
      setActiveTab('results');
    } catch (err: any) {
      message.error(err.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  // — Configure Tab
  const configureTab = (
    <>
      {/* Model selector */}
      <Card className="rounded-2xl shadow-sm mb-6" style={{ background: 'white' }}>
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
      <Card title="First Call" className="rounded-2xl shadow-sm mb-6" style={{ background: 'white' }}>
        <SettingRow bottomBorder label="System Prompt A">
          <TextArea
            rows={6}
            value={sysA}
            onChange={e => setSysA(e.target.value)}
            placeholder="System prompt A"
            className="border-none bg-transparent"
          />
        </SettingRow>
        <SettingRow label="User Prompt A">
          <TextArea
            rows={6}
            value={userA}
            onChange={e => setUserA(e.target.value)}
            placeholder="User prompt A"
            className="border-none bg-transparent"
          />
        </SettingRow>
      </Card>

      {/* First-Call Placeholder Values */}
      {(placeholdersSysA.length + placeholdersUserA.length) > 0 && (
        <Card
          title={<>First-Call Placeholders <Tooltip title="Detected ${var} in prompts"><InfoCircleOutlined /></Tooltip></>}
          className="rounded-2xl shadow-sm mb-6"
          style={{ background: 'transparent' }}
        >
          {placeholdersSysA.length > 0 && (
            <>
              <Text strong className="text-teal-500">System A</Text>
              {placeholdersSysA.map(ph => (
                <SettingRow key={ph} bottomBorder label={`Value for \`${ph}\``}>
                  <TextArea
                    rows={2}
                    value={valuesA[ph]}
                    onChange={e =>
                      setValuesA(prev => ({ ...prev, [ph]: e.target.value }))
                    }
                    placeholder={ph}
                    className="border-none bg-transparent w-full sm:w-64"
                  />
                </SettingRow>
              ))}
            </>
          )}
          {placeholdersUserA.length > 0 && (
            <>
              <Text strong className="text-teal-500 mt-4">User A</Text>
              {placeholdersUserA.map(ph => (
                <SettingRow key={ph} bottomBorder label={`Value for \`${ph}\``}>
                  <TextArea
                    rows={2}
                    value={valuesA[ph]}
                    onChange={e =>
                      setValuesA(prev => ({ ...prev, [ph]: e.target.value }))
                    }
                    placeholder={ph}
                    className="border-none bg-transparent w-full sm:w-64"
                  />
                </SettingRow>
              ))}
            </>
          )}
        </Card>
      )}

      {/* First-Response Injection */}
      {resp1 && (
        <Card title="First Response Injection" className="rounded-2xl shadow-sm mb-6" style={{ background: 'white' }}>
          <SettingRow
            bottomBorder
            label={<Text strong>Insert First Response</Text>}
            description="Creates ${FIRST_RESPONSE} for Second Call"
          >
            <Button
              size="small"
              style={{ background: '#33B9B1', color: 'white' }}
              onClick={() => setSysB(prev => prev + resp1)}
            >
              To System B
            </Button>
            <Button
              size="small"
              style={{ background: 'transparent', border: '1px solid #33B9B1', color: '#33B9B1' }}
              onClick={() => setUserB(prev => prev + resp1)}
            >
              To User B
            </Button>
          </SettingRow>
        </Card>
      )}

      {/* Second Call */}
      <Card title="Second Call" className="rounded-2xl shadow-sm mb-6" style={{ background: 'white' }}>
        <SettingRow bottomBorder label="System Prompt B">
          <TextArea
            rows={6}
            value={sysB}
            onChange={e => setSysB(e.target.value)}
            placeholder="System prompt B"
            className="border-none bg-transparent"
          />
        </SettingRow>
        <SettingRow
          label="User Prompt B"
          description="Use ${var} or FIRST_RESPONSE"
        >
          <TextArea
            rows={6}
            value={userB}
            onChange={e => setUserB(e.target.value)}
            placeholder="User prompt B"
            className="border-none bg-transparent"
          />
        </SettingRow>
      </Card>

      {/* Second-Call Placeholder Values */}
      {(placeholdersSysB.length + placeholdersUserB.length) > 0 && (
        <Card
          title={<>Second-Call Placeholders <Tooltip title="Detected ${var}"><InfoCircleOutlined /></Tooltip></>}
          className="rounded-2xl shadow-sm mb-6"
          style={{ background: 'transparent' }}
        >
          {placeholdersSysB.length > 0 && (
            <>
              <Text strong className="text-teal-500">System B</Text>
              {placeholdersSysB.map(ph => (
                <SettingRow key={ph} bottomBorder label={`Value for \`${ph}\``}>
                  <TextArea
                    rows={2}
                    value={valuesB[ph]}
                    onChange={e =>
                      setValuesB(prev => ({ ...prev, [ph]: e.target.value }))
                    }
                    placeholder={ph}
                    className="border-none bg-transparent w-full sm:w-64"
                  />
                </SettingRow>
              ))}
            </>
          )}
          {placeholdersUserB.length > 0 && (
            <>
              <Text strong className="text-teal-500 mt-4">User B</Text>
              {placeholdersUserB.map(ph => (
                <SettingRow key={ph} bottomBorder label={`Value for \`${ph}\``}>
                  <TextArea
                    rows={2}
                    value={valuesB[ph]}
                    onChange={e =>
                      setValuesB(prev => ({ ...prev, [ph]: e.target.value }))
                    }
                    placeholder={ph}
                    className="border-none bg-transparent w-full sm:w-64"
                  />
                </SettingRow>
              ))}
            </>
          )}
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
          style={{ background: '#33B9B1', border: 'none' }}
        >
          Run Chain
        </Button>
      </div>
    </>
  );

  // — Results Tab
  const resultsTab = (
    <Card title="Results" className="rounded-2xl shadow-sm my-6" style={{ background: 'white' }}>
      <Divider />
      <div className="grid md:grid-cols-2 gap-4">
        <TextArea
          rows={10}
          value={resp1}
          readOnly
          className="border-none bg-transparent"
        />
        <TextArea
          rows={10}
          value={resp2}
          readOnly
          className="border-none bg-transparent"
        />
      </div>
    </Card>
  );

  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#33B9B1' } }}>
      <Layout className="min-h-screen bg-white">
        <Header className="bg-white shadow-sm px-6 flex items-center" style={{ backgroundColor: 'white' }}>
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
