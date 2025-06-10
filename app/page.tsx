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
} from 'antd';
import {
  LoadingOutlined,
  PlayCircleFilled,
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

interface RunResponse {
  first: string;
  second: string;
  error?: string;
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
        {description && (
          <div className="text-xs text-gray-500">{description}</div>
        )}
      </div>
      <div className="flex justify-start md:justify-end items-center gap-2">
        {children}
      </div>
    </div>
  );
}

// Remover recursivamente todas as chaves "source"
function removeSources(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(item => removeSources(item));
  }
  if (obj !== null && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'source') continue;
      out[k] = removeSources(v);
    }
    return out;
  }
  return obj;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'config' | 'results'>('config');
  const [messageApi, contextHolder] = message.useMessage();

  // Prompts
  const [model, setModel] = useState<ModelType>(MODELS[0]);
  const [sysA, setSysA] = useState('');
  const [userA, setUserA] = useState('');
  const [sysB, setSysB] = useState('');
  const [userB, setUserB] = useState('');

  // Outputs
  const [resp1, setResp1] = useState('');
  const [resp2, setResp2] = useState('');
  const [loading, setLoading] = useState(false);

  // Switch para incluir fontes
  const [incluirFontes, setIncluirFontes] = useState(true);

  // Resposta 1 processada (com ou sem fontes)
  const [previewFirst, setPreviewFirst] = useState('');

  // Placeholders A
  const [phSysA, setPhSysA] = useState<string[]>([]);
  const [phUserA, setPhUserA] = useState<string[]>([]);
  const [valsA, setValsA] = useState<Record<string, string>>({});

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
      const nxt: Record<string, string> = {};
      [...phSysA, ...phUserA].forEach(ph => (nxt[ph] = prev[ph] ?? ''));
      return nxt;
    });
  }, [phSysA, phUserA]);

  // Placeholders B
  const [phSysB, setPhSysB] = useState<string[]>([]);
  const [phUserB, setPhUserB] = useState<string[]>([]);
  const [valsB, setValsB] = useState<Record<string, string>>({});

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
      const nxt: Record<string, string> = {};
      [...phSysB, ...phUserB].forEach(ph => (nxt[ph] = prev[ph] ?? ''));
      return nxt;
    });
  }, [phSysB, phUserB]);

  // Atualiza previewFirst sempre que mudar resp1 ou incluirFontes
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
      // se não for JSON válido, apenas mostra raw
      setPreviewFirst(resp1);
    }
  }, [resp1, incluirFontes]);

  async function runChain() {
    if (!sysA.trim() && !userA.trim()) {
      return messageApi.error('Os prompts iniciais não podem ficar vazios');
    }
    setLoading(true);
    setResp1('');
    setResp2('');

    try {
      // 1) Substituir placeholders A localmente
      let pSysA = sysA, pUserA = userA;
      Object.entries(valsA).forEach(([k, v]) => {
        const re = new RegExp(`\\$\\{${k}\\}`, 'g');
        pSysA = pSysA.replace(re, v);
        pUserA = pUserA.replace(re, v);
      });

      // 2) Enviar para API (sysB, userB e valsB)
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, sysA: pSysA, userA: pUserA, sysB, userB, valsB }),
      });
      const data = (await res.json()) as RunResponse;
      if (data.error) throw new Error(data.error);

      setResp1(data.first);
      setResp2(data.second);
      messageApi.success(
        `Concluído — A:${phSysA.length + phUserA.length}, B:${phSysB.length + phUserB.length}`,
        2
      );
      setActiveTab('results');
    } catch (e: unknown) {
      messageApi.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const configureTab = (
    <>
      {/* Modelo */}
      <Card className="rounded-2xl shadow-sm mb-6" style={{ background: 'white' }}>
        <SettingRow
          bottomBorder
          label={<Text strong>Modelo</Text>}
          description="Escolha seu LLM"
        >
          <Select value={model} onChange={setModel} className="w-full sm:w-64">
            {MODELS.map(m => (
              <Option key={m} value={m}>{m}</Option>
            ))}
          </Select>
        </SettingRow>
      </Card>

      {/* Primeira Chamada */}
      <Card title="Primeira Chamada" className="rounded-2xl shadow-sm mb-6" style={{ background: 'white' }}>
        <SettingRow bottomBorder label="Prompt de Sistema A">
          <TextArea rows={6} value={sysA} onChange={e => setSysA(e.target.value)} placeholder="Prompt de sistema A" />
        </SettingRow>
        <SettingRow label="Prompt de Usuário A">
          <TextArea rows={6} value={userA} onChange={e => setUserA(e.target.value)} placeholder="Prompt de usuário A" />
        </SettingRow>
      </Card>

      {/* Placeholders da 1ª Chamada */}
      {(phSysA.length || phUserA.length) > 0 && (
        <Card title="Placeholders da Primeira Chamada" className="rounded-2xl shadow-sm mb-6" style={{ background: 'transparent' }}>
          {phSysA.length > 0 && (
            <>
              <Text strong className="text-teal-500">Sistema A</Text>
              {phSysA.map(ph => (
                <SettingRow key={ph} bottomBorder label={`Valor para \`${ph}\``}>
                  <TextArea
                    rows={2}
                    value={valsA[ph]}
                    onChange={e => setValsA(p => ({ ...p, [ph]: e.target.value }))}
                    placeholder={ph}
                    className="border-none bg-transparent w-full sm:w-64"
                  />
                </SettingRow>
              ))}
            </>
          )}
          {phUserA.length > 0 && (
            <>
              <Text strong className="text-teal-500 mt-4">Usuário A</Text>
              {phUserA.map(ph => (
                <SettingRow key={ph} bottomBorder label={`Valor para \`${ph}\``}>
                  <TextArea
                    rows={2}
                    value={valsA[ph]}
                    onChange={e => setValsA(p => ({ ...p, [ph]: e.target.value }))}
                    placeholder={ph}
                    className="border-none bg-transparent w-full sm:w-64"
                  />
                </SettingRow>
              ))}
            </>
          )}
        </Card>
      )}

      {/* Switch Incluir Fontes */}
      <Card className="rounded-2xl shadow-sm mb-6" style={{ background: 'white' }}>
        <SettingRow
          bottomBorder
          label={<Text strong>Incluir campos &quot;source&quot;</Text>}
          description="Quando desativado, remove todos os campos 'source' da Resposta 1"
        >
          <Switch
            checked={incluirFontes}
            onChange={setIncluirFontes}
          />
        </SettingRow>

        {/* Preview Dinâmico */}
        <Text strong>Pré-visualização Resposta 1:</Text>
        <TextArea
          rows={8}
          value={previewFirst}
          readOnly
          className="border border-gray-200 rounded-md bg-gray-50 mt-2"
        />
      </Card>

      {/* Instruções FIRST_RESPONSE */}
      <Alert
        message="Referenciando Primeira Resposta"
        description={
          <>
            Digite <Text code>FIRST_RESPONSE</Text> em qualquer prompt ou
            placeholder da <Text strong>Segunda Chamada</Text>. Campos que
            contêm esse texto exibem um badge.
          </>
        }
        type="info"
        showIcon
        className="mb-4"
      />

      {/* Segunda Chamada */}
      <Card title="Segunda Chamada" className="rounded-2xl shadow-sm mb-6" style={{ background: 'white' }}>
        <SettingRow bottomBorder label={
          <>
            Prompt de Sistema B{' '}
            {sysB.includes('FIRST_RESPONSE') && (
              <Badge count="FIRST_RESPONSE" style={{ backgroundColor: '#33B9B1' }} />
            )}
          </>
        }>
          <TextArea rows={6} value={sysB} onChange={e => setSysB(e.target.value)} placeholder="Prompt de sistema B" />
        </SettingRow>
        <SettingRow label={
          <>
            Prompt de Usuário B{' '}
            {userB.includes('FIRST_RESPONSE') && (
              <Badge count="FIRST_RESPONSE" style={{ backgroundColor: '#33B9B1' }} />
            )}
          </>
        } description="Digite FIRST_RESPONSE ou ${var}">
          <TextArea rows={6} value={userB} onChange={e => setUserB(e.target.value)} placeholder="Prompt de usuário B" />
        </SettingRow>
      </Card>

      {/* Placeholders da 2ª Chamada */}
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
                    className={`border-none bg-transparent w-full sm:w-64 ${
                      (valsB[ph] ?? '').includes('FIRST_RESPONSE') ? 'ring-2 ring-teal-500' : ''
                    }`}
                  />
                  {(valsB[ph] ?? '').includes('FIRST_RESPONSE') && (
                    <Badge count="FIRST_RESPONSE" style={{ backgroundColor: '#33B9B1' }} />
                  )}
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
                    className={`border-none bg-transparent w-full sm:w-64 ${
                      (valsB[ph] ?? '').includes('FIRST_RESPONSE') ? 'ring-2 ring-teal-500' : ''
                    }`}
                  />
                  {(valsB[ph] ?? '').includes('FIRST_RESPONSE') && (
                    <Badge count="FIRST_RESPONSE" style={{ backgroundColor: '#33B9B1' }} />
                  )}
                </SettingRow>
              ))}
            </>
          )}
        </Card>
      )}

      {/* Botão Executar */}
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
          <Title level={3} className="!m-0 text-[#33B9B1]">
            Anamnai - Ferramenta de Refinamento dos Prompts
          </Title>
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
