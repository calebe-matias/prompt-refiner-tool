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
} from 'antd';
import { LoadingOutlined, PlayCircleFilled } from '@ant-design/icons';

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

  // — Placeholder detection for ${var} in A-prompts
  const [placeholders, setPlaceholders] = useState<string[]>([]);
  const [placeholderValues, setPlaceholderValues] = useState<
    Record<string,string>
  >({});

  useEffect(() => {
    const regex = /\$\{([^}]+)\}/g;
    const found = new Set<string>();
    for (const txt of [sysA, userA]) {
      let m;
      while ((m = regex.exec(txt))) found.add(m[1]);
    }
    setPlaceholders(Array.from(found));
  }, [sysA, userA]);

  // Initialize any new placeholders with empty string
  useEffect(() => {
    setPlaceholderValues(prev => {
      const next: Record<string,string> = {};
      placeholders.forEach(ph => {
        next[ph] = prev[ph] ?? '';
      });
      return next;
    });
  }, [placeholders]);

  // — Run both calls in one go
  async function runChain() {
    if (!sysA.trim() && !userA.trim()) {
      return message.error('First prompts cannot be empty');
    }
    setLoading(true);
    setResp1(''); setResp2('');

    try {
      // 1️⃣ Replace A-placeholders before first call
      let procSysA  = sysA;
      let procUserA = userA;
      Object.entries(placeholderValues).forEach(([k,v]) => {
        const p = new RegExp(`\\$\\{${k}\\}`, 'g');
        procSysA  = procSysA.replace(p, v);
        procUserA = procUserA.replace(p, v);
      });

      // 2️⃣ Fire serverless endpoint
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          sysA: procSysA,
          userA: procUserA,
          sysB,
          userB,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setResp1(data.first);
      setResp2(data.second);
      message.success(
        `Ran with ${placeholders.length} placeholder(s)`, 
        2
      );
    } catch (err: any) {
      message.error(err.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

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
                  <Option key={m} value={m}>
                    {m}
                  </Option>
                ))}
              </Select>
            </SettingRow>
          </Card>

          {/* First call */}
          <Card title="First Call" className="rounded-2xl shadow-sm mb-6">
            <SettingRow
              bottomBorder
              label="System Prompt A"
            >
              <TextArea
                rows={4}
                value={sysA}
                onChange={e => setSysA(e.target.value)}
                placeholder="Enter system prompt A"
                className="border-none bg-gray-100"
              />
            </SettingRow>
            <SettingRow label="User Prompt A">
              <TextArea
                rows={4}
                value={userA}
                onChange={e => setUserA(e.target.value)}
                placeholder="Enter user prompt A"
                className="border-none bg-gray-100"
              />
            </SettingRow>
          </Card>

          {/* Placeholder values */}
          {placeholders.length > 0 && (
            <Card title="Placeholder Values" className="rounded-2xl shadow-sm mb-6">
              {placeholders.map(ph => (
                <SettingRow
                  key={ph}
                  bottomBorder
                  label={`Value for \`${ph}\``}
                >
                  <Input
                    value={placeholderValues[ph]}
                    onChange={e =>
                      setPlaceholderValues(prev => ({
                        ...prev,
                        [ph]: e.target.value,
                      }))
                    }
                    placeholder={`Enter value for ${ph}`}
                    className="w-full sm:w-64"
                  />
                </SettingRow>
              ))}

              <div className="px-4">
                <Text type="secondary">
                  Click a tag to append that placeholder (e.g. {'${foo}'}) into Prompt B.
                </Text>
                <div className="mt-2 flex flex-wrap gap-2">
                  {placeholders.map(ph => (
                    <Tag
                      key={ph}
                      color="cyan"
                      className="cursor-pointer"
                      onClick={() => setUserB(prev => prev + `\${${ph}}`)}
                    >
                      {`$\{${ph}\}`}
                    </Tag>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* First-response injection */}
          {resp1 && (
            <Card title="First Response Injection" className="rounded-2xl shadow-sm mb-6">
              <SettingRow
                bottomBorder
                label={<Text strong>Insert First Response</Text>}
                description="Append the full text of the first response into Prompt B"
              >
                <div className="flex gap-2">
                  <Button
                    size="small"
                    onClick={() => setSysB(prev => prev + resp1)}
                  >
                    To System B
                  </Button>
                  <Button
                    size="small"
                    onClick={() => setUserB(prev => prev + resp1)}
                  >
                    To User B
                  </Button>
                </div>
              </SettingRow>
            </Card>
          )}

          {/* Second call */}
          <Card title="Second Call" className="rounded-2xl shadow-sm mb-6">
            <SettingRow bottomBorder label="System Prompt B">
              <TextArea
                rows={4}
                value={sysB}
                onChange={e => setSysB(e.target.value)}
                placeholder="Enter system prompt B"
                className="border-none bg-gray-100"
              />
            </SettingRow>
            <SettingRow
              label="User Prompt B"
              description="Use ${placeholder} or click tags above"
            >
              <TextArea
                rows={4}
                value={userB}
                onChange={e => setUserB(e.target.value)}
                placeholder="Enter user prompt B"
                className="border-none bg-gray-100"
              />
            </SettingRow>
          </Card>

          {/* Run */}
          <div className="px-0 mb-6">
            <Button
              type="primary"
              block
              size="large"
              icon={loading ? <LoadingOutlined /> : <PlayCircleFilled />}
              onClick={runChain}
              loading={loading}
              className='rounded-full mt-4'
            >
              Run Chain
            </Button>
          </div>

          {/* Results */}
          {(resp1 || resp2) && (
            <Card title="Results" className="rounded-2xl shadow-sm my-6">
              <Divider />
              <div className="grid md:grid-cols-2 gap-4">
                <TextArea
                  rows={8}
                  value={resp1}
                  readOnly
                  className="border-none bg-gray-50"
                />
                <TextArea
                  rows={8}
                  value={resp2}
                  readOnly
                  className="border-none bg-gray-50"
                />
              </div>
            </Card>
          )}
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
