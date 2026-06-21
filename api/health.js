export const config = { runtime: 'edge' };

export default function handler() {
  return new Response(JSON.stringify({ ok: true, time: Date.now(), apiKey: !!process.env.ANTHROPIC_API_KEY }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
