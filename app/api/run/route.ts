// app/api/run/route.ts
import { NextResponse } from 'next/server';
import OpenAI, { APIError } from 'openai';
import { validateSchema } from '@/lib/so-validate';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type Success = {
  first: string;
  second: string;
  structured?: boolean;
  schemaName?: string;
  requestId?: string;
};
type ErrorItem = { title: string; detail?: string };

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

/** Prefer parsed JSON from Responses API, fall back to output_text */
function pickOutput(resp: any): { text: string; json?: unknown } {
  try {
    // Prefer parsed value if Structured Outputs was used
    const outputs: any[] = Array.isArray(resp?.output) ? resp.output : [];
    for (const item of outputs) {
      const content: any[] = Array.isArray(item?.content) ? item.content : [];
      for (const c of content) {
        if (c && typeof c === 'object' && 'parsed' in c) {
          return { text: JSON.stringify(c.parsed, null, 2), json: c.parsed };
        }
        if (c?.type === 'output_text' && typeof c.text === 'string') {
          // keep going in case a later entry has parsed, but remember text
          const txt = c.text as string;
          // If it also looks like raw JSON, try to parse to be safe
          try {
            const maybe = JSON.parse(txt);
            return { text: JSON.stringify(maybe, null, 2), json: maybe };
          } catch {
            return { text: txt };
          }
        }
      }
    }
    if (typeof resp?.output_text === 'string') {
      const txt = resp.output_text as string;
      try {
        const maybe = JSON.parse(txt);
        return { text: JSON.stringify(maybe, null, 2), json: maybe };
      } catch {
        return { text: txt };
      }
    }
  } catch {
    /* ignore and fall through */
  }
  return { text: '' };
}

export async function POST(req: Request) {
  const validateOnly = req.headers.get('X-Validate-Schema-Only') === '1';
  const body = (await req.json()) as Partial<RunRequest>;

  // Live schema validation route (no model calls)
  if (validateOnly) {
    try {
      const schemaText = body.schemaText ?? '';
      if (!schemaText.trim()) {
        return NextResponse.json({ ok: true }, { status: 200 });
      }
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(schemaText);
      } catch (e) {
        return NextResponse.json(
          {
            error: 'Schema JSON inválido',
            issues: [{ title: 'Falha ao analisar JSON', detail: e instanceof Error ? e.message : String(e) }],
          },
          { status: 400 }
        );
      }
      const problems = validateSchema(parsed);
      if (problems.length) {
        return NextResponse.json({ error: 'Schema inválido', issues: problems }, { status: 400 });
      }
      return NextResponse.json({ ok: true }, { status: 200 });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : String(e) },
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
    let parsedSchema: Record<string, unknown> | undefined;
    if (schemaText.trim()) {
      try {
        parsedSchema = JSON.parse(schemaText);
      } catch (e) {
        return NextResponse.json(
          {
            error: 'Schema JSON inválido',
            issues: [{ title: 'Falha ao analisar JSON', detail: e instanceof Error ? e.message : String(e) }],
          },
          { status: 400 }
        );
      }
      const problems = validateSchema(parsedSchema);
      if (problems.length) {
        return NextResponse.json(
          { error: 'Schema inválido para Structured Outputs', issues: problems },
          { status: 400 }
        );
      }
      useStructured = true;
    }

    // -------- First call (Responses API) --------
    // Build param object loosely; cast only at call site to dodge SDK type skew (e.g. 'minimal')
    const reqA: Record<string, unknown> = {
      model: modelA,
      input: userA,
      instructions: sysA,
      ...(modelA === 'gpt-5'
        ? { reasoning: { effort: gpt5EffortA as unknown as string } }
        : {}),
      ...(useStructured
        ? {
            text: {
              format: {
                type: 'json_schema',
                name: schemaName || 'ClinicalJSON',
                schema: parsedSchema!,
                strict: true,
              },
            },
          }
        : {}),
    };

    // Cast to any to satisfy older SDK TypeScript defs while still sending correct runtime shape
    const firstRaw = await openai.responses.create(reqA as any);
    const { text: firstText, json: firstJSON } = pickOutput(firstRaw);
    const first = firstJSON ? JSON.stringify(firstJSON, null, 2) : firstText;

    // -------- Inject FIRST_RESPONSE as explicit JSON block for your template --------
    // If we have a parsed object, that’s guaranteed JSON; else try to parse text.
    const parsedFromText = (() => {
      if (firstJSON) return firstJSON;
      try {
        return JSON.parse(firstText);
      } catch {
        return null;
      }
    })();

    const injectedJSONBlock =
      parsedFromText != null
        ? `\n\n# DADOS CLÍNICOS (JSON)\n${JSON.stringify(parsedFromText, null, 2)}\n`
        : firstText || '\n\n# DADOS CLÍNICOS (JSON)\n{}\n';

    // -------- Prepare second prompts with placeholders + FIRST_RESPONSE --------
    let bSys = sysB;
    let bUser = userB;

    // Replace ${var} placeholder values (including ones set to FIRST_RESPONSE)
    for (const [key, val] of Object.entries(valsB)) {
      const re = new RegExp(`\\$\\{${key}\\}`, 'g');
      const replacement = val === 'FIRST_RESPONSE' ? injectedJSONBlock : val;
      bSys = bSys.replace(re, replacement);
      bUser = bUser.replace(re, replacement);
    }
    // Replace raw FIRST_RESPONSE tokens
    bSys = bSys.replace(/FIRST_RESPONSE/g, injectedJSONBlock);
    bUser = bUser.replace(/FIRST_RESPONSE/g, injectedJSONBlock);

    // -------- Second call (free text) --------
    const reqB: Record<string, unknown> = {
      model: modelB,
      input: bUser,
      instructions: bSys,
      ...(modelB === 'gpt-5'
        ? { reasoning: { effort: gpt5EffortB as unknown as string } }
        : {}),
    };

    const secondRaw = await openai.responses.create(reqB as any);
    const { text: second } = pickOutput(secondRaw);

    const payload: Success = {
      first,
      second,
      structured: useStructured,
      schemaName: useStructured ? schemaName || 'ClinicalJSON' : undefined,
      requestId: (firstRaw as any)?._request_id,
    };
    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    const issues: ErrorItem[] = [];
    let requestId: string | undefined;

    if (err instanceof APIError) {
      requestId = (err as any).response?.headers?.get?.('x-request-id');
      const msg = (err as any).error?.message || err.message || 'Erro desconhecido';

      if (/response_format/i.test(msg)) {
        issues.push({
          title: 'Parâmetro migrado',
          detail: "No Responses API, 'response_format' virou 'text.format'.",
        });
      }
      if (/json_schema|text\.format/i.test(msg)) {
        issues.push({
          title: 'Erro de Structured Outputs',
          detail:
            'Use apenas o subconjunto suportado: objetos com "additionalProperties": false; todos os campos listados em "required"; profundidade ≤ 5; ≤ 100 propriedades; sem anyOf na raiz.',
        });
      }
      return NextResponse.json({ error: msg, requestId, issues: issues.length ? issues : undefined }, { status: err.status ?? 500 });
    }

    return NextResponse.json({ error: (err as Error)?.message ?? 'Erro desconhecido' }, { status: 500 });
  }
}
