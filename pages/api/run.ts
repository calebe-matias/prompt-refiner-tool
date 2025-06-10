import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// formatos de retorno
type Success = { first: string; second: string };
type Error   = { error: string };
type Data    = Success | Error;

// shape da requisição
interface RunRequest {
  modelA: string;
  modelB: string;
  sysA: string;
  userA: string;
  sysB: string;
  userB: string;
  valsB: Record<string, string>;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { modelA, modelB, sysA, userA, sysB, userB, valsB } = req.body as RunRequest;

  try {
    // 1️⃣ Primeira chamada com modelA
    const firstRaw = await openai.chat.completions.create({
      model: modelA,
      messages: [
        { role:'system', content:sysA },
        { role:'user',   content:userA },
      ],
    });
    const first = firstRaw.choices[0].message.content ?? '';

    // 2️⃣ Substituir placeholders para B
    let bSys  = sysB;
    let bUser = userB;

    for (const [key,val] of Object.entries(valsB)) {
      const use = val === 'FIRST_RESPONSE' ? first : val;
      const re = new RegExp(`\\$\\{${key}\\}`,'g');
      bSys  = bSys.replace(re,use);
      bUser = bUser.replace(re,use);
    }
    bSys  = bSys.replace(/FIRST_RESPONSE/g, first);
    bUser = bUser.replace(/FIRST_RESPONSE/g, first);

    // 3️⃣ Segunda chamada com modelB
    const secondRaw = await openai.chat.completions.create({
      model: modelB,
      messages: [
        { role:'system', content:bSys },
        { role:'user',   content:bUser },
      ],
    });
    const second = secondRaw.choices[0].message.content ?? '';

    return res.status(200).json({ first, second });
  } catch (err: unknown) {
    console.error(err);
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    return res.status(500).json({ error: msg });
  }
}
