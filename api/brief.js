import { buildBriefPrompt } from './_lib/prompts.js';
import { isAuthed } from './_lib/auth.js';

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });

  const API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!API_KEY) {
    return new Response(JSON.stringify({ brief: 'Configurá ANTHROPIC_API_KEY en Vercel para activar el brief.' }), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  }

  if (!(await isAuthed(req))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json', ...CORS }
    });
  }

  const { data } = await req.json();
  const userMsg = buildBriefPrompt(data || {});
  const system = 'Sos el socio estratégico de Bruno en Concepto Development. Escribís briefs directos y útiles, de co-dueño a co-dueño.';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: userMsg }]
    })
  });

  const json = await res.json();
  const brief = json.content?.[0]?.text || 'No se pudo generar el brief.';
  return new Response(JSON.stringify({ brief }), {
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}
