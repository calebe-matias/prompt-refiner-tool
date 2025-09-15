import { NextResponse } from 'next/server';
import OpenAI, { APIError } from 'openai';
import { validateSchema } from '../../../lib/so-validate';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // set on Vercel
});

type Success = {
  first: string;
  second: string;
  structured?: boolean;
  schemaName?: string;
  requestId?: string;
};
type ErrorData = { error: string; issues?: Array<{ title: string; detail?: string }>; requestId?: string };

interface RunRequest {
  modelA?: string;
  modelB?: string;
  gpt5EffortA?: 'minimal' | 'low' | 'medium' | 'high';
  gpt5EffortB?: 'minimal' | 'low' | 'medium' | 'high';
  sysA?: string;
  userA?: string;
  sysB?: string;
  userB?: string;
  valsB?: Record<string, string>;
  schemaName?: string;
  schemaText?: string;
}

/** Robust extractor for Responses API */
function extractOutputText(resp: any): string {
  if (typeof resp?.output_text === 'string' && resp.output_text.length) return resp.output_text;
  // Fallback: concatenate any text parts under output -> content
  try {
    const parts: string[] = [];
    const output = resp?.output ?? [];
    for (const item of output) {
      const content = item?.content ?? [];
      for (const c of content) {
        if (typeof c?.text?.value === 'string') parts.push(c.text.value);
        else if (typeof c?.text === 'string') parts.push(c.text);
        else if (typeof c?.content === 'string') parts.push(c.content);
      }
    }
    if (parts.length) return parts.join('');
  } catch {}
  return JSON.stringify(resp ?? {}, null, 2);
}

function looksLikeJSON(s: string) {
  const t = s.trim();
  if (!t) return false;
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try { JSON.parse(t); return true; } catch { return false; }
  }
  return false;
}

export async function POST(req: Request) {
  const headerValidateOnly = req.headers.get('X-Validate-Schema-Only') === '1';
  const body = (await req.json()) as Partial<RunRequest>;

  // 0) live schema validation (no API call)
  if (headerValidateOnly) {
    try {
      const schemaText = body.schemaText ?? '';
      if (!schemaText.trim()) return NextResponse.json({ ok: true }, { status: 200 });
      let parsed: any;
      try {
        parsed = JSON.parse(schemaText);
      } catch (e) {
        return NextResponse.json(
          { error: 'Schema JSON inválido', issues: [{ title: 'Falha ao analisar JSON', detail: e instanceof Error ? e.message : String(e) }] },
          { status: 400 }
        );
      }
      const problems = validateSchema(parsed);
      if (problems.length) return NextResponse.json({ error: 'Schema inválido', issues: problems }, { status: 400 });
      return NextResponse.json({ ok: true }, { status: 200 });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
    }
  }

  const {
    modelA = 'gpt-4.1-mini',
    modelB = 'gpt-4.1-mini',
    gpt5EffortA = 'medium',
    gpt5EffortB = 'medium',
    sysA = '',
    userA = '',
    sysB = '',
    userB = '',
    valsB = {},
    schemaName = 'ClinicalJSON',
    schemaText = '',
  } = body as RunRequest;

  try {
    // 1) parse/validate schema if provided
    let useStructured = false;
    let parsedSchema: any | undefined;
    if (schemaText.trim()) {
      try {
        parsedSchema = JSON.parse(schemaText);
      } catch (e) {
        return NextResponse.json(
          { error: 'Schema JSON inválido', issues: [{ title: 'Falha ao analisar JSON', detail: e instanceof Error ? e.message : String(e) }] },
          { status: 400 }
        );
      }
      const problems = validateSchema(parsedSchema);
      if (problems.length) {
        return NextResponse.json({ error: 'Schema inválido para Structured Outputs', issues: problems }, { status: 400 });
      }
      useStructured = true;
    }

    // 2) First call — Responses API (with optional structured outputs)
    const reqA: any = {
      model: modelA,
      instructions: sysA,
      input: userA,
    };

    if (modelA === 'gpt-5') {
      reqA.reasoning = { effort: gpt5EffortA };
    }

    if (useStructured) {
      // Per Responses API, text formatting lives under text.format
      reqA.text = {
        format: {
          type: 'json_schema',
          name: schemaName || 'ClinicalJSON',
          schema: parsedSchema,
          strict: true,
        },
      };
    }

    const firstRaw = await openai.responses.create(reqA);
    const first = extractOutputText(firstRaw);

    // Prepare a JSON-friendly injected block
    const injected = looksLikeJSON(first) ? `\n\n\`\`\`json\n${first}\n\`\`\`\n` : first;

    // 3) Build second call prompts, replacing placeholders (including FIRST_RESPONSE)
    let bSys = sysB;
    let bUser = userB;

    for (const [key, val] of Object.entries(valsB)) {
      const use = val === 'FIRST_RESPONSE' ? injected : val;
      const re = new RegExp(`\\$\\{${key}\\}`, 'g');
      bSys = bSys.replace(re, use);
      bUser = bUser.replace(re, use);
    }
    bSys = bSys.replace(/FIRST_RESPONSE/g, injected);
    bUser = bUser.replace(/FIRST_RESPONSE/g, injected);

    // ✅ Safety net: if dev forgot to place FIRST_RESPONSE anywhere, still deliver the JSON
    const stillMissing = !/\bFIRST_RESPONSE\b/.test(sysB + userB) &&
                         Object.values(valsB).every(v => v !== 'FIRST_RESPONSE');
    if (stillMissing) {
      bUser += `\n\n# DADOS CLÍNICOS (JSON)\n${injected}`;
    }

    // 4) Second call — free text
    const reqB: any = {
      model: modelB,
      instructions: bSys,
      input: bUser,
    };
    if (modelB === 'gpt-5') {
      reqB.reasoning = { effort: gpt5EffortB };
    }
    console.log('reqB bUser', bUser);
    const secondRaw = await openai.responses.create(reqB);
    const second = extractOutputText(secondRaw);

    const payload: Success = {
      first,
      second,
      structured: useStructured,
      schemaName: useStructured ? (schemaName || 'ClinicalJSON') : undefined,
      requestId: (firstRaw as any)?._request_id,
    };
    return NextResponse.json(payload, { status: 200 });
  } catch (err: any) {
    let requestId: string | undefined;
    const issues: Array<{ title: string; detail?: string }> = [];

    if (err instanceof APIError) {
      requestId = (err as any).response?.headers?.get?.('x-request-id');
      const msg = (err as any).error?.message || err.message || 'Erro desconhecido';

      if (/response_format/i.test(msg)) {
        issues.push({
          title: 'Parâmetro migrado',
          detail: "No Responses API, 'response_format' foi movido para 'text.format'.",
        });
      }
      if (/json_schema|text\.format/i.test(msg)) {
        issues.push({
          title: 'Erro de Structured Outputs',
          detail:
            'Confirme que o schema usa apenas o subconjunto suportado (objetos com additionalProperties:false; todos em "required"; profundidade ≤ 5; ≤ 100 propriedades; root sem anyOf).',
        });
      }
      return NextResponse.json({ error: msg, requestId, issues: issues.length ? issues : undefined }, { status: err.status ?? 500 });
    }

    return NextResponse.json({ error: err?.message || 'Erro desconhecido' }, { status: 500 });
  }
}
