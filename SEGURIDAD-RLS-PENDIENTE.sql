-- ═══════════════════════════════════════════════════════════════
-- CONCEPTO HQ — CRÍTICO 1: cerrar el acceso público a hq_data
-- ═══════════════════════════════════════════════════════════════
-- PROBLEMA (revisor-portón, 2026-06-09):
--   El sync de nube (syncToSupabase/loadFromSupabase en index.html) habla DIRECTO
--   con Supabase REST usando la clave PÚBLICA (sb_publishable_...) visible en el
--   código. Sin login de Supabase. => Cualquiera con tu URL + esa clave puede
--   bajarse o borrar TODA tu data (clientes, finanzas, MRR, pipeline, Bóveda).
--   (server.js NO es esto: guarda a un archivo local data/hq-data.json, es opcional.)
--
-- SOLUCIÓN: el cliente deja de tocar Supabase directo. Pasa por /api/cloud
--   (ya creado), que usa la service_role key (secreta, en env) y exige ADMIN_TOKEN.
--   Y se deniega TODO acceso anónimo a hq_data con RLS.
--
-- ⚠️ ROMPE el sync actual si no se hace en el orden correcto. STAGING/preview primero.
-- ═══════════════════════════════════════════════════════════════


-- ── PASO 1 — ENV en Vercel (Settings → Environment Variables) ──
--   SUPABASE_SERVICE_ROLE_KEY = <service_role key del proyecto Supabase>  (SECRETA)
--   ADMIN_TOKEN               = <un token largo aleatorio que solo vos sepas>
--   (opcional) SB_URL         = https://zngbeqbvmbxeweldmyaf.supabase.co
--   Después, en la app: ⚙️ → Admin Token = el mismo ADMIN_TOKEN.


-- ── PASO 2 — CAMBIO DE CLIENTE en index.html (reemplazar las 2 funciones) ──
--   Reemplazar el cuerpo de syncToSupabase() y loadFromSupabase() por:
--
--   async function syncToSupabase() {
--     setSyncStatus('syncing');
--     try {
--       const r = await apiFetch('/api/cloud', {
--         method:'POST',
--         headers:{'Content-Type':'application/json'},
--         body:JSON.stringify(D)
--       });
--       setSyncStatus(r && r.ok ? 'ok' : 'error');
--     } catch { setSyncStatus('error'); }
--   }
--   async function loadFromSupabase() {
--     try {
--       const r = await apiFetch('/api/cloud');
--       if (!r) return;                       // 401 -> apiFetch muestra el modal de token
--       const out = await r.json();
--       const remote = out && out.payload;
--       if (remote) {
--         const proxy = D.settings?.proxy || '';
--         D = Object.assign({}, D, remote);
--         if (proxy) D.settings.proxy = proxy;
--         /* ...mantener el resto de la lógica de merge/defaults igual que hoy... */
--         localStorage.setItem(KEY, JSON.stringify(D));
--       }
--     } catch {}
--   }
--
--   Y BORRAR del cliente las constantes que ya no se usan para datos:
--     SB_KEY  (la clave publishable) — sacarla del código.
--     SB_URL/SB_ROW solo si no se usan en otro lado.


-- ── PASO 3 — SQL (correr como rol postgres en el SQL editor de Supabase) ──
alter table public.hq_data enable row level security;
revoke all on public.hq_data from anon, authenticated;
-- Sin policies para anon/authenticated => deny por defecto.
-- El service_role (que usa /api/cloud) ignora RLS y sí entra.


-- ── ORDEN DE ROLLOUT (atómico, para no quedarte sin app) ──
-- A. STAGING primero: proyecto Supabase de staging (datos demo) + preview de Vercel
--    con las env del PASO 1.
-- B. Deploy del PASO 2 (cliente nuevo) en el preview. Verificar que la app guarda y
--    carga bien vía /api/cloud.
-- C. Recién ahí, correr el PASO 3 en staging. Verificar que la app sigue andando Y que:
--      curl "https://<staging>.supabase.co/rest/v1/hq_data?id=eq.bruno&select=payload" \
--           -H "apikey: <PUBLISHABLE_KEY>"
--    YA NO devuelve data (debe dar vacío/permiso denegado).
-- D. En PRODUCCIÓN: primero deploy del cliente nuevo + env, verificar sync por /api/cloud,
--    y en el mismo momento correr el PASO 3 en la BD de producción.
--
-- Bruno: cuando tengas las 2 env vars puestas y quieras activarlo, te aplico el PASO 2
-- en el cliente y te acompaño el rollout. No lo toco antes para no romper tu sync en vivo.
