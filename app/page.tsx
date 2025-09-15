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
  Alert,
  Badge,
  Switch,
  Tooltip,
} from 'antd';
import { LoadingOutlined, PlayCircleFilled } from '@ant-design/icons';

const { Header, Content } = Layout;
const { TextArea } = Input;
const { Title, Text } = Typography;
const { Option } = Select;

const MODELS = ['gpt-4.1-nano', 'gpt-4.1-mini', 'gpt-4.1', 'o3-mini', 'gpt-5'] as const;
type ModelType = typeof MODELS[number];
type Gpt5Effort = 'minimal' | 'low' | 'medium' | 'high';

interface RunResponse {
  first: string;
  second: string;
  error?: string;
  issues?: Array<{ title: string; detail?: string }>;
  requestId?: string;
  structured?: boolean;
  schemaName?: string;
}

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
        {description && <div className="text-xs text-gray-500">{description}</div>}
      </div>
      <div className="flex justify-start md:justify-end items-center gap-2">{children}</div>
    </div>
  );
}

function removeSources(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(removeSources);
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'source') continue;
      out[k] = removeSources(v);
    }
    return out;
  }
  return obj;
}

type Issue = { title: string; detail?: string };

export default function Home() {
  const [activeTab, setActiveTab] = useState<'config' | 'results'>('config');
  const [messageApi, contextHolder] = message.useMessage();

  const [modelA, setModelA] = useState<ModelType>(MODELS[0]);
  const [modelB, setModelB] = useState<ModelType>(MODELS[0]);
  const [gpt5EffortA, setGpt5EffortA] = useState<Gpt5Effort>('medium');
  const [gpt5EffortB, setGpt5EffortB] = useState<Gpt5Effort>('medium');

  const [sysA, setSysA] = useState('');
  const [userA, setUserA] = useState('');
  const [sysB, setSysB] = useState('');
  const [userB, setUserB] = useState('');

  const [schemaName, setSchemaName] = useState('ClinicalJSON');
  const [schemaText, setSchemaText] = useState('');
  const [schemaIssues, setSchemaIssues] = useState<Issue[]>([]);
  const [schemaIsValid, setSchemaIsValid] = useState<boolean | null>(null);

  const [resp1, setResp1] = useState('');
  const [resp2, setResp2] = useState('');
  const [loading, setLoading] = useState(false);

  const [incluirFontes, setIncluirFontes] = useState(true);
  const [previewFirst, setPreviewFirst] = useState('');

  const [alerts, setAlerts] = useState<Array<{ type: 'error' | 'warning' | 'info' | 'success'; title: string; description?: string }>>([]);

  const [phSysA, setPhSysA] = useState<string[]>([]);
  const [phUserA, setPhUserA] = useState<string[]>([]);
  const [valsA, setValsA] = useState<Record<string, string>>({});

  useEffect(() => {
    const rx = /\$\{([^}]+)\}/g,
      out = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = rx.exec(sysA))) out.add(m[1]);
    setPhSysA([...out]);
  }, [sysA]);

  useEffect(() => {
    const rx = /\$\{([^}]+)\}/g,
      out = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = rx.exec(userA))) out.add(m[1]);
    setPhUserA([...out]);
  }, [userA]);

  useEffect(() => {
    setValsA(prev => {
      const nxt: Record<string, string> = {};
      [...phSysA, ...phUserA].forEach(ph => (nxt[ph] = prev[ph] ?? ''));
      return nxt;
    });
  }, [phSysA, phUserA]);

  const [phSysB, setPhSysB] = useState<string[]>([]);
  const [phUserB, setPhUserB] = useState<string[]>([]);
  const [valsB, setValsB] = useState<Record<string, string>>({});

  useEffect(() => {
    const rx = /\$\{([^}]+)\}/g,
      out = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = rx.exec(sysB))) out.add(m[1]);
    setPhSysB([...out]);
  }, [sysB]);

  useEffect(() => {
    const rx = /\$\{([^}]+)\}/g,
      out = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = rx.exec(userB))) out.add(m[1]);
    setPhUserB([...out]);
  }, [userB]);

  useEffect(() => {
    setValsB(prev => {
      const nxt: Record<string, string> = {};
      [...phSysB, ...phUserB].forEach(ph => (nxt[ph] = prev[ph] ?? ''));
      return nxt;
    });
  }, [phSysB, phUserB]);

  useEffect(() => {
    if (!resp1) {
      setPreviewFirst('');
      return;
    }
    try {
      const obj = JSON.parse(resp1);
      const result = incluirFontes ? obj : removeSources(obj);
      setPreviewFirst(JSON.stringify(result, null, 2));
    } catch {
      setPreviewFirst(resp1);
    }
  }, [resp1, incluirFontes]);

  // live server-side validation (mirrors API)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!schemaText.trim()) {
        if (!cancelled) {
          setSchemaIssues([]);
          setSchemaIsValid(null);
        }
        return;
      }
      try {
        JSON.parse(schemaText);
      } catch (e) {
        if (!cancelled) {
          setSchemaIssues([{ title: 'JSON inválido', detail: e instanceof Error ? e.message : String(e) }]);
          setSchemaIsValid(false);
        }
        return;
      }

      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Validate-Schema-Only': '1' },
        body: JSON.stringify({ schemaText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSchemaIssues(data.issues ?? [{ title: 'Schema inválido', detail: data.error }]);
        setSchemaIsValid(false);
      } else {
        setSchemaIssues([]);
        setSchemaIsValid(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [schemaText]);

  function addAlert(a: { type: 'error' | 'warning' | 'info' | 'success'; title: string; description?: string }) {
    setAlerts(prev => [...prev, a]);
  }
  function clearAlerts() {
    setAlerts([]);
  }

  async function runChain() {
    if (!sysA.trim() && !userA.trim()) {
      return messageApi.error('Os prompts iniciais não podem ficar vazios');
    }
    setLoading(true);
    setResp1('');
    setResp2('');
    clearAlerts();

    try {
      let pSysA = sysA,
        pUserA = userA;
      Object.entries(valsA).forEach(([k, v]) => {
        const re = new RegExp(`\\$\\{${k}\\}`, 'g');
        pSysA = pSysA.replace(re, v);
        pUserA = pUserA.replace(re, v);
      });

      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelA,
          modelB,
          gpt5EffortA,
          gpt5EffortB,
          sysA: pSysA,
          userA: pUserA,
          sysB,
          userB,
          valsB,
          schemaName,
          schemaText,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API ${res.status} ${res.statusText}. Body (first 300): ${text.slice(0, 300)}`);
      }

      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        const text = await res.text();
        throw new Error(`API respondeu com ${ct}. Body (first 300): ${text.slice(0, 300)}`);
      }

      const data = (await res.json()) as RunResponse;

      if (data.error) {
        if (data.issues?.length) data.issues.forEach(i => addAlert({ type: 'error', title: i.title, description: i.detail }));
        if (data.requestId) addAlert({ type: 'info', title: 'Request ID', description: data.requestId });
        throw new Error(data.error);
      }

      setResp1(data.first);
      setResp2(data.second);

      const info = data.structured
        ? `Concluído — Structured Outputs (${data.schemaName}) habilitado; A:${phSysA.length + phUserA.length}, B:${phSysB.length + phUserB.length}`
        : `Concluído — A:${phSysA.length + phUserA.length}, B:${phSysB.length + phUserB.length}`;

      messageApi.success(info, 2);
      setActiveTab('results');
    } catch (e: unknown) {
      messageApi.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const configureTab = (
    <>
      <Card className="rounded-2xl shadow-sm mb-6" style={{ background: 'white' }}>
        <SettingRow bottomBorder label={<Text strong>Modelo – Primeira Chamada</Text>} description="Escolha o LLM para a primeira requisição">
          <div className="flex gap-2 items-center">
            <Select value={modelA} onChange={setModelA} className="w-56">
              {MODELS.map(m => (
                <Option key={m} value={m}>
                  {m}
                </Option>
              ))}
            </Select>
            {modelA === 'gpt-5' && (
              <Tooltip title="Controla o esforço de raciocínio do GPT-5. 'minimal' pode reduzir a latência.">
                <Select<Gpt5Effort> value={gpt5EffortA} onChange={setGpt5EffortA} className="w-48">
                  <Option value="minimal">minimal</Option>
                  <Option value="low">low</Option>
                  <Option value="medium">medium</Option>
                  <Option value="high">high</Option>
                </Select>
              </Tooltip>
            )}
          </div>
        </SettingRow>
      </Card>

      <Card title="Primeira Chamada" className="rounded-2xl shadow-sm mb-6" style={{ background: 'white' }}>
        <SettingRow bottomBorder label="Prompt de Sistema A">
          <TextArea rows={6} value={sysA} onChange={e => setSysA(e.target.value)} placeholder="Prompt de sistema A" />
        </SettingRow>
        <SettingRow label="Prompt de Usuário A">
          <TextArea rows={6} value={userA} onChange={e => setUserA(e.target.value)} placeholder="Prompt de usuário A" />
        </SettingRow>
      </Card>

      <Card title="Structured Outputs (opcional) – Primeira Chamada" className="rounded-2xl shadow-sm mb-6" style={{ background: 'white' }}>
        <SettingRow bottomBorder label="Nome do Schema" description="Apenas um rótulo para a chamada de API.">
          <Input value={schemaName} onChange={e => setSchemaName(e.target.value)} className="w-full sm:w-64" />
        </SettingRow>
        <SettingRow
          label="Schema JSON"
          description="Cole aqui um JSON Schema compatível (subconjunto suportado: objetos com additionalProperties:false; required para todos; profundidade ≤ 5; ≤100 props; root sem anyOf)."
        >
          <TextArea
            rows={10}
            value={schemaText}
            onChange={e => setSchemaText(e.target.value)}
            placeholder='Ex.: { "type":"object","properties":{...},"required":[...],"additionalProperties":false }'
          />
        </SettingRow>
        {schemaIsValid === true && (
          <Alert type="success" showIcon className="mt-3" message="Schema válido" description="A chamada A usará esse schema (strict=true)." />
        )}
        {schemaIsValid === false && (
          <div className="mt-3 space-y-2">
            {schemaIssues.map((it, idx) => (
              <Alert key={idx} type="error" showIcon message={it.title} description={it.detail} />
            ))}
          </div>
        )}
        {schemaIsValid === null && (
          <Alert type="info" showIcon className="mt-3" message="Dica" description="Cole um JSON Schema para testar Structured Outputs. Se em branco, a saída será texto livre." />
        )}
      </Card>

      {/* Placeholders A */}
      {(phSysA.length || phUserA.length) > 0 && (
        <Card title="Placeholders da Primeira Chamada" className="rounded-2xl shadow-sm mb-6" style={{ background: 'transparent' }}>
          {phSysA.length > 0 && (
            <>
              <Text strong className="text-teal-500">Sistema A</Text>
              {phSysA.map(ph => (
                <SettingRow key={ph} bottomBorder label={`Valor para \`${ph}\``}>
                  <TextArea rows={2} value={valsA[ph]} onChange={e => setValsA(p => ({ ...p, [ph]: e.target.value }))} placeholder={ph} className="border-none bg-transparent w-full sm:w-64" />
                </SettingRow>
              ))}
            </>
          )}
          {phUserA.length > 0 && (
            <>
              <Text strong className="text-teal-500 mt-4">Usuário A</Text>
              {phUserA.map(ph => (
                <SettingRow key={ph} bottomBorder label={`Valor para \`${ph}\``}>
                  <TextArea rows={2} value={valsA[ph]} onChange={e => setValsA(p => ({ ...p, [ph]: e.target.value }))} placeholder={ph} className="border-none bg-transparent w-full sm:w-64" />
                </SettingRow>
              ))}
            </>
          )}
        </Card>
      )}

      {/* sources + preview */}
      <Card className="rounded-2xl shadow-sm mb-6" style={{ background: 'white' }}>
        <SettingRow
          bottomBorder
          label={<Text strong>Incluir campos &quot;source&quot;</Text>}
          description="Desative para remover todos os campos &quot;source&quot; da Resposta 1"
        >
          <Switch checked={incluirFontes} onChange={setIncluirFontes} />
        </SettingRow>
        <Text strong>Pré-visualização Resposta 1:</Text>
        <TextArea rows={8} value={previewFirst} readOnly className="border border-gray-200 rounded-md bg-gray-50 mt-2" />
      </Card>

      {/* FIRST_RESPONSE hint */}
      <Alert
        message="Referenciando Primeira Resposta"
        description={<>Digite <Text code>FIRST_RESPONSE</Text> em qualquer prompt ou placeholder da <Text strong>Segunda Chamada</Text>. Campos com ele exibem um badge.</>}
        type="info"
        showIcon
        className="mb-4"
      />

      {/* Model B */}
      <Card className="rounded-2xl shadow-sm mb-6" style={{ background: 'white' }}>
        <SettingRow
          bottomBorder
          label={<Text strong>Modelo – Segunda Chamada</Text>}
          description="Escolha o LLM para a segunda requisição"
        >
          <div className="flex gap-2 items-center">
            <Select value={modelB} onChange={setModelB} className="w-56">
              {MODELS.map(m => <Option key={m} value={m}>{m}</Option>)}
            </Select>
            {modelB === 'gpt-5' && (
              <Tooltip title="Controla o esforço de raciocínio do GPT-5.">
                <Select<Gpt5Effort> value={gpt5EffortB} onChange={setGpt5EffortB} className="w-48">
                  <Option value="minimal">minimal</Option>
                  <Option value="low">low</Option>
                  <Option value="medium">medium</Option>
                  <Option value="high">high</Option>
                </Select>
              </Tooltip>
            )}
          </div>
        </SettingRow>
      </Card>

      {/* Second call */}
      <Card title="Segunda Chamada" className="rounded-2xl shadow-sm mb-6" style={{ background: 'white' }}>
        <SettingRow bottomBorder label={<>Prompt de Sistema B {sysB.includes('FIRST_RESPONSE') && (<Badge count="FIRST_RESPONSE" style={{ backgroundColor: '#33B9B1' }} />)}</>}>
          <TextArea rows={6} value={sysB} onChange={e => setSysB(e.target.value)} placeholder="Prompt de sistema B" />
        </SettingRow>
        <SettingRow label={<>Prompt de Usuário B {userB.includes('FIRST_RESPONSE') && (<Badge count="FIRST_RESPONSE" style={{ backgroundColor: '#33B9B1' }} />)}</>} description="Digite FIRST_RESPONSE ou ${var}">
          <TextArea rows={6} value={userB} onChange={e => setUserB(e.target.value)} placeholder="Prompt de usuário B" />
        </SettingRow>
      </Card>

      {/* Placeholders B */}
      {(phSysB.length || phUserB.length) > 0 && (
        <Card title="Placeholders da Segunda Chamada" className="rounded-2xl shadow-sm mb-6" style={{ background: 'transparent' }}>
          {phSysB.length > 0 && (
            <>
              <Text strong className="text-teal-500">Sistema B</Text>
              {phSysB.map(ph => (
                <SettingRow key={ph} bottomBorder label={`Valor para \`${ph}\``}>
                  <TextArea
                    rows={2}
                    value={valsB[ph]}
                    onChange={e => setValsB(p => ({ ...p, [ph]: e.target.value }))}
                    placeholder={ph}
                    className={`border-none bg-transparent w-full sm:w-64 ${(valsB[ph] ?? '').includes('FIRST_RESPONSE') ? 'ring-2 ring-teal-500' : ''}`}
                  />
                  {(valsB[ph] ?? '').includes('FIRST_RESPONSE') && <Badge count="FIRST_RESPONSE" style={{ backgroundColor: '#33B9B1' }} />}
                </SettingRow>
              ))}
            </>
          )}
          {phUserB.length > 0 && (
            <>
              <Text strong className="text-teal-500 mt-4">Usuário B</Text>
              {phUserB.map(ph => (
                <SettingRow key={ph} bottomBorder label={`Valor para \`${ph}\``}>
                  <TextArea
                    rows={2}
                    value={valsB[ph]}
                    onChange={e => setValsB(p => ({ ...p, [ph]: e.target.value }))}
                    placeholder={ph}
                    className={`border-none bg-transparent w-full sm:w-64 ${(valsB[ph] ?? '').includes('FIRST_RESPONSE') ? 'ring-2 ring-teal-500' : ''}`}
                  />
                  {(valsB[ph] ?? '').includes('FIRST_RESPONSE') && <Badge count="FIRST_RESPONSE" style={{ backgroundColor: '#33B9B1' }} />}
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
          Executar Fluxo
        </Button>
      </div>
    </>
  );

  const resultsTab = (
    <Card title="Resultados" className="rounded-2xl shadow-sm my-6" style={{ background: 'white' }}>
      {alerts.map((a, idx) => (
        <Alert key={idx} type={a.type} showIcon className="mb-3" message={<span className="font-semibold">{a.title}</span>} description={a.description} />
      ))}
      <Divider />
      <div className="flex gap-4">
        <TextArea rows={15} value={resp1} readOnly className="w-1/2 border-none bg-transparent" />
        <TextArea rows={15} value={resp2} readOnly className="w-1/2 border-none bg-transparent" />
      </div>
    </Card>
  );

  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#33B9B1' } }}>
      {contextHolder}
      <Layout className="min-h-screen bg-white">
        <Header className="bg-white shadow-sm px-6 flex items-center" style={{ backgroundColor: 'white' }}>
          <Title level={3} className="!m-0 text-[#33B9B1]">Anamnai - Ferramenta de Refinamento dos Prompts</Title>
        </Header>
        <Content className="py-6 px-4 md:px-0 max-w-4xl mx-auto">
          <Tabs
            activeKey={activeTab}
            onChange={k => setActiveTab(k as 'config' | 'results')}
            className="mb-6"
            items={[
              { key: 'config', label: 'Configurar', children: configureTab },
              { key: 'results', label: 'Resultados', children: resultsTab },
            ]}
          />
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
