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
    const { model, sysA, userA, sysB, userB } = req.body as any;

    // First call
    const firstRaw = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: sysA },
        { role: 'user', content: userA },
      ],
    });
    const first = firstRaw.choices[0].message.content ?? '';

    // Inject FIRST_RESPONSE
    const injectFirst = (txt: string) =>
      txt.replace(/\$\{FIRST_RESPONSE\}/g, first);

    // Second call
    const secondRaw = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: injectFirst(sysB) },
        { role: 'user', content: injectFirst(userB) },
      ],
    });
    const second = secondRaw.choices[0].message.content ?? '';

    res.status(200).json({ first, second });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Unknown error' });
  }
}
