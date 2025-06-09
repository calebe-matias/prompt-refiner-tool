import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Data = { first: string; second: string } | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { model, sysA, userA, sysB, userB, valsB } = req.body as any;

    // 1️⃣ First call
    const firstRaw = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: sysA },
        { role: 'user',   content: userA },
      ],
    });
    const first = firstRaw.choices[0].message.content ?? '';

    // 2️⃣ Replace placeholders for B
    //    - ${var}: custom placeholders from valsB
    //    - FIRST_RESPONSE: literal marker
    let bSys = sysB;
    let bUser = userB;
    for (const [key, val] of Object.entries(valsB)) {
      const use = val === 'FIRST_RESPONSE' ? first : val;
      const re = new RegExp(`\\$\\{${key}\\}`, 'g');
      bSys  = bSys.replace(re, use);
      bUser = bUser.replace(re, use);
    }
    // also handle bare FIRST_RESPONSE
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
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Unknown error' });
  }
}
