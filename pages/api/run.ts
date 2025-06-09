import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';
import { config } from 'dotenv';
config({ path: '.env.local' }); // ou '.env'
console.log('DEBUG KEY:', process.env.OPENAI_API_KEY);


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
console.log('Loaded API key:', process.env.OPENAI_API_KEY);


  try {
    const { model, sysA, userA, sysB, userB } = req.body as {
      model: string;
      sysA: string; userA: string;
      sysB: string; userB: string;
    };

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const firstRaw = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: sysA },
        { role: 'user', content: userA },
      ],
    });

    const first = firstRaw.choices[0]?.message?.content ?? '';

    const inject = (text: string) => text?.replace(/{{\s*FIRST_RESPONSE\s*}}/gi, first);

    const secondRaw = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: inject(sysB) },
        { role: 'user', content: inject(userB) },
      ],
    });

    const second = secondRaw.choices[0]?.message?.content ?? '';

    res.status(200).json({ first, second });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message ?? 'Unknown error' });
  }
}
