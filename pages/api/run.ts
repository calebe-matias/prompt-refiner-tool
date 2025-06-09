// pages/api/run.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Define a union for success vs error
type Success = { first: string; second: string };
type Error   = { error: string };
type Data    = Success | Error;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== 'POST') {
    // Now valid against Data
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { model, sysA, userA, sysB, userB, valsB } = req.body as {
      model: string;
      sysA: string;
      userA: string;
      sysB: string;
      userB: string;
      valsB: Record<string, string>;
    };

    // 1️⃣ First call
    const firstRaw = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: sysA },
        { role: 'user',   content: userA },
      ],
    });
    const first = firstRaw.choices[0].message.content ?? '';

    // 2️⃣ Build second‐call prompts by replacing placeholders
    let bSys  = sysB;
    let bUser = userB;

    // Custom placeholders from valsB
    for (const [key, val] of Object.entries(valsB)) {
      const use = val === 'FIRST_RESPONSE' ? first : val;
      bSys  = bSys.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), use);
      bUser = bUser.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), use);
    }
    // Bare 'FIRST_RESPONSE' tokens
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

    // Return success shape
    return res.status(200).json({ first, second });
  } catch (err: any) {
    console.error(err);
    // Also valid against Data
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
