// /app/api/run/route.ts
import { NextResponse } from 'next/server';
import OpenAI, { APIError } from 'openai';
import { validateSchema, type Issue } from '../../../lib/so-validate';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // set in Vercel project settings
});

type Success = {
  first: string;
  second: string;
  structured?: boolean;
  schemaName?: string;
  requestId?: string;
};

type ErrorJson = {
  error: string;
  issues?: Array<{ title: string; detail?: string }>;
  requestId?: string;
};

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

type Resp = OpenAI.Responses.Response;
type CreateParams = OpenAI.Responses.ResponseCreateParamsNonStreaming;

function extractOutputText(resp: Resp): string {
  return typeof resp.output_text === 'string' ? resp.output_text : JSON.stringify(resp, null, 2);
}

export async function POST(req: Request) {
  const validateOnly = req.headers.get('X-Validate-Schema-Only') === '1';
  const body = (await req.json()) as Partial<RunRequest>;

  // Live validation mode for the client
  if (validateOnly) {
    try {
      const schemaText = body.schemaText ?? '';
      if (!schemaText.trim()) return NextResponse.json({ ok: true }, { status: 200 });

      let parsed: unknown;
      try {
        parsed = JSON.parse(schemaText);
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        return NextResponse.json(
          { error: 'Schema JSON inválido', issues: [{ title: 'Falha ao analisar JSON', detail }] } satisfies ErrorJson,
          { status: 400 }
        );
      }

      const problems = validateSchema(parsed);
      if (problems.length) {
        return NextResponse.json(
          { error: 'Schema inválido', issues: problems } satisfies ErrorJson,
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: true }, { status: 200 });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : String(e) } satisfies ErrorJson,
        { status: 400 }
      );
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
  } = body;

  try {
    // Parse & validate schema if provided
    let useStructured = false;
    let parsedSchema: unknown;
    if (schemaText.trim()) {
      try {
        parsedSchema = JSON.parse(schemaText);
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        return NextResponse.json(
          { error: 'Schema JSON inválido', issues: [{ title: 'Falha ao analisar JSON', detail }] } satisfies ErrorJson,
          { status: 400 }
        );
      }
      const problems = validateSchema(parsedSchema);
      if (problems.length) {
        return NextResponse.json(
          { error: 'Schema inválido para Structured Outputs', issues: problems } satisfies ErrorJson,
          { status: 400 }
        );
      }
      useStructured = true;
    }

    // 1) First call — Responses API (non-streaming)
    const reqA: CreateParams = {
      model: modelA,
      input: userA,
      instructions: sysA,
      ...(modelA === 'gpt-5' ? { reasoning: { effort: gpt5EffortA } } : {}),
      ...(useStructured
        ? {
            text: {
              format: {
                type: 'json_schema',
                name: schemaName || 'ClinicalJSON',
                schema: parsedSchema as Record<string, unknown>,
                strict: true,
              },
            },
          }
        : {}),
    };

    const firstRaw = await openai.responses.create(reqA);
    const requestId = (firstRaw as unknown as { _request_id?: string })._request_id;
    const first = extractOutputText(firstRaw);

    // Prepare a JSON-friendly injected block (don’t wrap in code fences)
    const injectedFirst = first;

    // 2) Substitute into B (both placeholders and literal FIRST_RESPONSE)
    let bSys = sysB;
    let bUser = userB;

    for (const [key, val] of Object.entries(valsB)) {
      const use = val === 'FIRST_RESPONSE' ? injectedFirst : val;
      const re = new RegExp(`\\$\\{${key}\\}`, 'g');
      bSys = bSys.replace(re, use);
      bUser = bUser.replace(re, use);
    }
    bSys = bSys.replace(/FIRST_RESPONSE/g, injectedFirst);
    bUser = bUser.replace(/FIRST_RESPONSE/g, injectedFirst);

    // 3) Second call — free text
    const reqB: CreateParams = {
      model: modelB,
      input: bUser,
      instructions: bSys,
      ...(modelB === 'gpt-5' ? { reasoning: { effort: gpt5EffortB } } : {}),
    };

    const secondRaw = await openai.responses.create(reqB);
    const second = extractOutputText(secondRaw);

    const ok: Success = {
      first,
      second,
      structured: useStructured,
      schemaName: useStructured ? schemaName || 'ClinicalJSON' : undefined,
      requestId,
    };
    return NextResponse.json(ok, { status: 200 });
  } catch (err) {
    const issues: Issue[] = [];
    let requestId: string | undefined;

    if (err instanceof APIError) {
      requestId = (err as unknown as { response?: { headers?: Map<string, string> | { get(k: string): string } } }).response?.headers?.get?.('x-request-id');
      const msg = (err as unknown as { error?: { message?: string } }).error?.message || err.message || 'Erro desconhecido';

      if (/response_format/i.test(msg)) {
        issues.push({ title: 'Parâmetro migrado', detail: "No Responses API, 'response_format' foi movido para 'text.format'." });
      }
      if (/json_schema|text\.format/i.test(msg)) {
        issues.push({
          title: 'Erro de Structured Outputs',
          detail:
            'Confirme que o schema usa apenas o subconjunto suportado (objetos com additionalProperties:false; todos em "required"; profundidade ≤ 5; ≤ 100 propriedades; root sem anyOf).',
        });
      }

      return NextResponse.json({ error: msg, requestId, issues: issues.length ? issues : undefined } satisfies ErrorJson, {
        status: err.status ?? 500,
      });
    }

    return NextResponse.json({ error: (err as Error)?.message ?? 'Erro desconhecido' } satisfies ErrorJson, { status: 500 });
  }
}
