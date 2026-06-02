import { getSystemPrompt } from './_lib/prompts.js';

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
    return new Response(JSON.stringify({ error: 'API key no configurada' }), {
      status: 503, headers: { 'Content-Type': 'application/json', ...CORS }
    });
  }

  if (ADMIN_TOKEN) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${ADMIN_TOKEN}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }
  }

  const { messages, role, data } = await req.json();
  const system = getSystemPrompt(role || 'general', data || {});

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      stream: true,
      system,
      messages
    })
  });

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      ...CORS
    }
  });
}
