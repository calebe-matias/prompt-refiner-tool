// pages/api/run.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Success and error shapes
type Success = { first: string; second: string };
type Error   = { error: string };
type Data    = Success | Error;

// Define the exact shape of the incoming JSON
interface RunRequest {
  model: string;
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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Cast to our RunRequest interface
  const { model, sysA, userA, sysB, userB, valsB } = req.body as RunRequest;

  try {
    // 1️⃣ First call
    const firstRaw = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: sysA },
        { role: 'user',   content: userA },
      ],
    });
    const first = firstRaw.choices[0].message.content ?? '';

    // 2️⃣ Build second-call prompts
    let bSys  = sysB;
    let bUser = userB;

    // Replace custom placeholders (${key})
    for (const [key, val] of Object.entries(valsB)) {
      const replacement = val === 'FIRST_RESPONSE' ? first : val;
      const re = new RegExp(`\\$\\{${key}\\}`, 'g');
      bSys  = bSys.replace(re, replacement);
      bUser = bUser.replace(re, replacement);
    }

    // Replace bare FIRST_RESPONSE tokens
    bSys  = bSys.replace(/FIRST_RESPONSE/g, first);
    bUser = bUser.replace(/FIRST_RESPONSE/g, first);

    // 3️⃣ Second call
    const secondRaw = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: bSys },
        { role: 'user',   content: bUser },
      ],
    });
    const second = secondRaw.choices[0].message.content ?? '';

    return res.status(200).json({ first, second });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error
        ? err.message
        : 'An unknown error occurred while calling the API.';
    return res.status(500).json({ error: message });
  }
}
