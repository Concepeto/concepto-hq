// Concepto HQ — API de Leads (#43)
// Lee/actualiza la tabla `leads` de Supabase del lado del SERVIDOR con la service key
// (bypassa RLS sin exponer la tabla al público). Gated por ADMIN_TOKEN, igual que el resto.
export const config = { runtime: 'edge' };

const SB_URL = 'https://zngbeqbvmbxeweldmyaf.supabase.co';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

  if (!SERVICE_KEY) {
    return json({ error: 'Falta SUPABASE_SERVICE_KEY en Vercel → Settings → Environment Variables.' }, 500);
  }

  // Misma puerta que brief/chat: si hay ADMIN_TOKEN, exigir el Bearer correcto.
  if (ADMIN_TOKEN) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${ADMIN_TOKEN}`) {
      return json({ error: 'Unauthorized' }, 401);
    }
  }

  const sbHeaders = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const rubro = url.searchParams.get('rubro') || '';
      const status = url.searchParams.get('status') || '';
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '400', 10) || 400, 1000);
      let q = `${SB_URL}/rest/v1/leads?select=id,company_name,rubro,status,score,notes,created_at,place_id&order=created_at.desc&limit=${limit}`;
      if (rubro) q += `&rubro=eq.${encodeURIComponent(rubro)}`;
      if (status) q += `&status=eq.${encodeURIComponent(status)}`;
      const r = await fetch(q, { headers: sbHeaders });
      if (!r.ok) return json({ error: 'Supabase respondió ' + r.status }, 502);
      const rows = await r.json();
      return json({ leads: Array.isArray(rows) ? rows : [], count: Array.isArray(rows) ? rows.length : 0 });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const id = body && body.id;
      const status = body && body.status;
      if (!id || !status) return json({ error: 'Falta id o status' }, 400);
      if (!['nuevo', 'contactado', 'descartado'].includes(status)) return json({ error: 'status inválido' }, 400);
      const r = await fetch(`${SB_URL}/rest/v1/leads?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ status })
      });
      if (!r.ok) return json({ error: 'No se pudo actualizar (' + r.status + ')' }, 502);
      return json({ ok: true });
    }

    return json({ error: 'Método no soportado' }, 405);
  } catch (e) {
    return json({ error: String(e && e.message ? e.message : e) }, 500);
  }
}
