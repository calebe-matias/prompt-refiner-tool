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
  Tabs,
  Tooltip,
  Alert,
  Badge,
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
      <div className="flex justify-start md:justify-end items-center gap-2">{children}</div>
    </div>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'config' | 'results'>('config');

  // Prompt state
  const [model, setModel] = useState<ModelType>(MODELS[0]);
  const [sysA, setSysA] = useState('');
  const [userA, setUserA] = useState('');
  const [sysB, setSysB] = useState('');
  const [userB, setUserB] = useState('');

  // Outputs
  const [resp1, setResp1] = useState('');
  const [resp2, setResp2] = useState('');
  const [loading, setLoading] = useState(false);

  // Placeholders in A
  const [phSysA, setPhSysA] = useState<string[]>([]);
  const [phUserA, setPhUserA] = useState<string[]>([]);
  const [valsA, setValsA] = useState<Record<string,string>>({});

  useEffect(() => {
    const rx = /\$\{([^}]+)\}/g, out = new Set<string>();
    let m;
    while ((m = rx.exec(sysA))) out.add(m[1]);
    setPhSysA([...out]);
  }, [sysA]);

  useEffect(() => {
    const rx = /\$\{([^}]+)\}/g, out = new Set<string>();
    let m;
    while ((m = rx.exec(userA))) out.add(m[1]);
    setPhUserA([...out]);
  }, [userA]);

  useEffect(() => {
    setValsA(prev => {
      const nxt: Record<string,string> = {};
      [...phSysA, ...phUserA].forEach(ph => {
        nxt[ph] = prev[ph] ?? '';
      });
      return nxt;
    });
  }, [phSysA, phUserA]);

  // Placeholders in B
  const [phSysB, setPhSysB] = useState<string[]>([]);
  const [phUserB, setPhUserB] = useState<string[]>([]);
  const [valsB, setValsB] = useState<Record<string,string>>({});

  useEffect(() => {
    const rx = /\$\{([^}]+)\}/g, out = new Set<string>();
    let m;
    while ((m = rx.exec(sysB))) out.add(m[1]);
    setPhSysB([...out]);
  }, [sysB]);

  useEffect(() => {
    const rx = /\$\{([^}]+)\}/g, out = new Set<string>();
    let m;
    while ((m = rx.exec(userB))) out.add(m[1]);
    setPhUserB([...out]);
  }, [userB]);

  useEffect(() => {
    setValsB(prev => {
      const nxt: Record<string,string> = {};
      [...phSysB, ...phUserB].forEach(ph => {
        nxt[ph] = prev[ph] ?? '';
      });
      return nxt;
    });
  }, [phSysB, phUserB]);

  async function runChain() {
    if (!sysA.trim() && !userA.trim()) {
      return message.error('First prompts cannot be empty');
    }
    setLoading(true);
    setResp1(''); setResp2('');

    try {
      // 1️⃣ Replace A-placeholders locally
      let pSysA = sysA, pUserA = userA;
      Object.entries(valsA).forEach(([k,v]) => {
        const re = new RegExp(`\\$\\{${k}\\}`, 'g');
        pSysA   = pSysA.replace(re, v);
        pUserA  = pUserA.replace(re, v);
      });

      // 2️⃣ Send both calls to API
      const res = await fetch('/api/run', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          model,
          sysA: pSysA,
          userA: pUserA,
          sysB,
          userB,
          valsB,             // pass placeholder values
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setResp1(data.first);
      setResp2(data.second);
      message.success(
        `Done—A:${phSysA.length+phUserA.length}, B:${phSysB.length+phUserB.length}`,
        2
      );
      setActiveTab('results');
    } catch (e:any) {
      message.error(e.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  const configureTab = (
    <>
      {/* Model */}
      <Card className="rounded-2xl shadow-sm mb-6" style={{ background:'white' }}>
        <SettingRow bottomBorder label={<Text strong>Model</Text>} description="Choose your LLM">
          <Select value={model} onChange={setModel} className="w-full sm:w-64">
            {MODELS.map(m => <Option key={m} value={m}>{m}</Option>)}
          </Select>
        </SettingRow>
      </Card>

      {/* First Call */}
      <Card title="First Call" className="rounded-2xl shadow-sm mb-6" style={{ background:'white' }}>
        <SettingRow bottomBorder label="System Prompt A">
          <TextArea rows={6} value={sysA} onChange={e=>setSysA(e.target.value)} placeholder="System prompt A" />
        </SettingRow>
        <SettingRow label="User Prompt A">
          <TextArea rows={6} value={userA} onChange={e=>setUserA(e.target.value)} placeholder="User prompt A" />
        </SettingRow>
      </Card>

      {/* First-Call Placeholders */}
      {(phSysA.length||phUserA.length)>0 && (
        <Card title="First-Call Placeholders" className="rounded-2xl shadow-sm mb-6" style={{ background:'transparent' }}>
          {phSysA.length>0 && <>
            <Text strong className="text-teal-500">System A</Text>
            {phSysA.map(ph=>(
              <SettingRow key={ph} bottomBorder label={`Value for \`${ph}\``}>
                <TextArea
                  rows={2}
                  value={valsA[ph]}
                  onChange={e=>setValsA(p=>({...p,[ph]:e.target.value}))}
                  placeholder={ph}
                  className="border-none bg-transparent w-full sm:w-64"
                />
              </SettingRow>
            ))}
          </>}
          {phUserA.length>0 && <>
            <Text strong className="text-teal-500 mt-4">User A</Text>
            {phUserA.map(ph=>(
              <SettingRow key={ph} bottomBorder label={`Value for \`${ph}\``}>
                <TextArea
                  rows={2}
                  value={valsA[ph]}
                  onChange={e=>setValsA(p=>({...p,[ph]:e.target.value}))}
                  placeholder={ph}
                  className="border-none bg-transparent w-full sm:w-64"
                />
              </SettingRow>
            ))}
          </>}
        </Card>
      )}

      {/* Info for FIRST_RESPONSE */}
      <Alert
        message="Referencing First Response"
        description={
          <>
            To inject the **first API call’s output**, simply type <Text code>FIRST_RESPONSE</Text> in any
            <Text code>Second Call</Text> prompt or placeholder. Fields containing it get a teal badge.
          </>
        }
        type="info"
        showIcon
        className="mb-4"
      />

      {/* Second Call */}
      <Card title="Second Call" className="rounded-2xl shadow-sm mb-6" style={{ background:'white' }}>
        <SettingRow bottomBorder label={
          <>
            System Prompt B{' '}
            {sysB.includes('FIRST_RESPONSE') && (
              <Badge count="→ FIRST_RESPONSE" style={{ backgroundColor:'#33B9B1' }} />
            )}
          </>
        }>
          <TextArea
            rows={6}
            value={sysB}
            onChange={e=>setSysB(e.target.value)}
            placeholder="System prompt B"
          />
        </SettingRow>
        <SettingRow label={
          <>
            User Prompt B{' '}
            {userB.includes('FIRST_RESPONSE') && (
              <Badge count="→ FIRST_RESPONSE" style={{ backgroundColor:'#33B9B1' }} />
            )}
          </>
        } description="Type FIRST_RESPONSE or any ${var}">
          <TextArea
            rows={6}
            value={userB}
            onChange={e=>setUserB(e.target.value)}
            placeholder="User prompt B"
          />
        </SettingRow>
      </Card>

      {/* Second-Call Placeholders */}
      {(phSysB.length||phUserB.length)>0 && (
        <Card title="Second-Call Placeholders" className="rounded-2xl shadow-sm mb-6" style={{ background:'transparent' }}>
          {phSysB.length>0 && <>
            <Text strong className="text-teal-500">System B</Text>
            {phSysB.map(ph=>(
              <SettingRow key={ph} bottomBorder label={`Value for \`${ph}\``}>
                <TextArea
                  rows={2}
                  value={valsB[ph]}
                  onChange={e=>setValsB(p=>({...p,[ph]:e.target.value}))}
                  placeholder={ph}
                  className="border-none bg-transparent w-full sm:w-64"
                />
                { (valsB[ph] ?? '').includes('FIRST_RESPONSE') && (
                  <Badge count="→ FIRST_RESPONSE" style={{ backgroundColor:'#33B9B1' }} />
                )}
              </SettingRow>
            ))}
          </>}
          {phUserB.length>0 && <>
            <Text strong className="text-teal-500 mt-4">User B</Text>
            {phUserB.map(ph=>(
              <SettingRow key={ph} bottomBorder label={`Value for \`${ph}\``}>
                <TextArea
                  rows={2}
                  value={valsB[ph]}
                  onChange={e=>setValsB(p=>({...p,[ph]:e.target.value}))}
                  placeholder={ph}
                  className="border-none bg-transparent w-full sm:w-64"
                />
                { (valsB[ph] ?? '').includes('FIRST_RESPONSE') && (
                  <Badge count="→ FIRST_RESPONSE" style={{ backgroundColor:'#33B9B1' }} />
                )}
              </SettingRow>
            ))}
          </>}
        </Card>
      )}

      {/* Run button */}
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

  const resultsTab = (
    <Card title="Results" className="rounded-2xl shadow-sm my-6" style={{ background:'white' }}>
      <Divider />
      <div className="flex gap-4">
        <TextArea
          rows={15}
          value={resp1}
          readOnly
          className="w-1/2 border-none bg-transparent"
        />
        <TextArea
          rows={15}
          value={resp2}
          readOnly
          className="w-1/2 border-none bg-transparent"
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
              { key: 'results', label: 'Results',   children: resultsTab   },
            ]}
          />
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
