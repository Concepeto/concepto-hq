// ═══════════════════════════════════════════════════════════════
// /api/cloud — acceso SEGURO a hq_data en Supabase (Crítico 1)
// ═══════════════════════════════════════════════════════════════
// Reemplaza el acceso directo del cliente a Supabase REST con la clave
// PÚBLICA (que dejaba toda la data leíble/borrable por cualquiera).
// Acá la data se toca SOLO con la service_role key (secreta, en env de Vercel)
// y SOLO si el request trae el ADMIN_TOKEN correcto (fail-closed).
//
// ACTIVACIÓN (ver SEGURIDAD-RLS-PENDIENTE.sql para el rollout completo):
//   1. En Vercel, setear: SUPABASE_SERVICE_ROLE_KEY, ADMIN_TOKEN, (opcional SB_URL).
//   2. Apuntar el cliente (syncToSupabase/loadFromSupabase) a /api/cloud.
//   3. Correr el SQL que deniega acceso anónimo a hq_data.
//   Hacer 1+2 (deploy) ANTES de 3, y probar en preview.

export const config = { runtime: 'edge' };

const SB_URL = process.env.SB_URL || 'https://zngbeqbvmbxeweldmyaf.supabase.co';
const ROW = process.env.HQ_ROW || 'bruno';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json', ...CORS }
});

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

  // FAIL-CLOSED: sin secretos configurados, no atiende.
  if (!SERVICE_KEY || !ADMIN_TOKEN) {
    return json({ error: 'Cloud no configurado (faltan SUPABASE_SERVICE_ROLE_KEY o ADMIN_TOKEN)' }, 503);
  }
  // Auth: solo Bruno con su token.
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${ADMIN_TOKEN}`) return json({ error: 'Unauthorized' }, 401);

  const sbHeaders = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    if (req.method === 'GET') {
      const r = await fetch(`${SB_URL}/rest/v1/hq_data?id=eq.${ROW}&select=payload`, { headers: sbHeaders });
      const rows = await r.json();
      return json({ payload: (rows && rows[0] && rows[0].payload) || null });
    }

    if (req.method === 'POST') {
      const payload = await req.json();
      const r = await fetch(`${SB_URL}/rest/v1/hq_data`, {
        method: 'POST',
        headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ id: ROW, payload, updated_at: new Date().toISOString() })
      });
      return json({ ok: r.ok }, r.ok ? 200 : 502);
    }

    return json({ error: 'Método no permitido' }, 405);
  } catch (e) {
    return json({ error: 'Error de servidor' }, 500);
  }
}
