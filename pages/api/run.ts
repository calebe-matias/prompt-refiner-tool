import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type Data =
  | { first: string; second: string }
  | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { model, sysA, userA, sysB, userB } = req.body as {
      model: string;
      sysA: string;
      userA: string;
      sysB: string;
      userB: string;
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

    // 2️⃣ Inject FIRST_RESPONSE into B-prompts
    const injectFirst = (txt: string) =>
      txt.replace(/\$\{FIRST_RESPONSE\}/g, first);

    // 3️⃣ Second call
    const secondRaw = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: injectFirst(sysB) },
        { role: 'user',   content: injectFirst(userB) },
      ],
    });
    const second = secondRaw.choices[0].message.content ?? '';

    return res.status(200).json({ first, second });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
