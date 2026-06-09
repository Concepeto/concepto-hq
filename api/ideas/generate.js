import { buildIdeasPrompt } from '../_lib/prompts.js';

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

  if (!API_KEY) {
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  }

  // FAIL-CLOSED: sin ADMIN_TOKEN configurado el endpoint NO atiende a nadie.
  if (!ADMIN_TOKEN) {
    return new Response(JSON.stringify({ error: 'Endpoint no configurado (falta ADMIN_TOKEN)' }), {
      status: 503, headers: { 'Content-Type': 'application/json', ...CORS }
    });
  }
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${ADMIN_TOKEN}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json', ...CORS }
    });
  }

  const { data } = await req.json();
  const system = 'Sos un estratega de negocios especializado en agencias de IA. Generás ideas accionables en formato JSON estricto.';
  const userMsg = buildIdeasPrompt(data || {});

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
  const text = json.content?.[0]?.text || '[]';
  try {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const ideas = JSON.parse(clean);
    return new Response(JSON.stringify(ideas), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  } catch {
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  }
}
