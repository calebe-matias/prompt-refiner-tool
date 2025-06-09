import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? 'undefined',
  });
}
