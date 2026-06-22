-- ============================================================
-- SEGURIDAD HQ — Cerrar el acceso anónimo a hq_data y leads
-- Proyecto Supabase: zngbeqbvmbxeweldmyaf
-- SQL Editor: https://supabase.com/dashboard/project/zngbeqbvmbxeweldmyaf/sql/new
--
-- ⚠️  ORDEN OBLIGATORIO (si lo hacés al revés, te dejás afuera de HQ):
--     1. PRIMERO crear tu usuario en Authentication → Users (ver runbook).
--     2. PRIMERO desplegar la app nueva (rama feat/login-rls) y entrar con el login.
--     3. RECIÉN AHÍ correr este SQL.
--
-- Cada PASO se corre por separado. Leé el comentario antes de ejecutar.
-- ============================================================


-- ============================================================
-- PASO 0 — DIAGNÓSTICO (no cambia NADA, solo muestra el estado actual)
-- Corré esto solo y mirá el resultado antes de seguir.
-- ============================================================
select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public' and tablename in ('hq_data', 'leads')
order by tablename, policyname;


-- ============================================================
-- PASO 1 — hq_data: que SOLO tu usuario autenticado entre
-- Esta tabla la usa únicamente la app (vos). n8n NO la toca,
-- así que este paso es SEGURO de correr ya.
-- ============================================================

-- Borra cualquier policy vieja de hq_data (limpieza robusta, sin importar el nombre)
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'hq_data'
  loop execute format('drop policy %I on public.hq_data', pol.policyname); end loop;
end $$;

alter table public.hq_data enable row level security;

-- Permite leer/escribir SOLO a usuarios autenticados (= vos, el único que se puede loguear)
create policy "hq_data solo autenticado"
  on public.hq_data
  for all
  to authenticated
  using (true)
  with check (true);

-- (Al no crear ninguna policy para 'anon', el acceso anónimo queda BLOQUEADO.)


-- ============================================================
-- PASO 2 — leads: quitar la lectura pública, dejar solo autenticado
-- ⚠️  CORRER SOLO DESPUÉS de confirmar que los workflows de n8n que
--     ESCRIBEN leads usan la Service Role key (no la anónima).
--     Si n8n usa la anónima, este paso le corta la carga de leads.
--     (La Service Role IGNORA el RLS, así que si la usa, no se rompe nada.)
-- ============================================================

-- VERSIÓN REAL APLICADA (22-jun): el diagnóstico mostró que leads ya tenía RLS
-- con UNA sola policy `hq_lee_leads` (SELECT para {anon, authenticated}) y NINGUNA
-- de escritura → n8n carga leads con Service Role (ignora el RLS). Así que el fix
-- es quirúrgico: solo sacarle `anon` a la lectura. La app SOLO lee leads (el
-- "contactado" se guarda en hq_data, ya protegido), por eso no hace falta UPDATE.

alter table public.leads enable row level security;  -- idempotente

drop policy "hq_lee_leads" on public.leads;

create policy "hq_lee_leads"
  on public.leads
  for select
  to authenticated
  using (true);

-- (n8n inserta leads con Service Role → no necesita policy, ignora el RLS.)


-- ============================================================
-- VERIFICACIÓN — después de los pasos, confirmá que el anónimo NO puede leer
-- Corré esto en una terminal (NO en el SQL editor):
--
--   curl -s -o /dev/null -w "%{http_code}\n" \
--     "https://zngbeqbvmbxeweldmyaf.supabase.co/rest/v1/hq_data?select=id" \
--     -H "apikey: sb_publishable_nNQhjFQGR4n8FuSLCjOA0Q_2FsgmXUA"
--
--   Antes daba 200 (con datos). Después del PASO 1 tiene que dar 200 con []  (lista vacía)
--   o 401/403. Si todavía devuelve la fila "bruno", el RLS no quedó activo.
-- ============================================================


-- ============================================================
-- 🔙 ROLLBACK DE EMERGENCIA — si quedaste afuera o algo se rompió
-- Corré esto y volvés al estado de antes (acceso abierto otra vez).
-- OJO: esto REABRE el agujero temporalmente, es solo para destrabarte.
-- ============================================================
-- alter table public.hq_data disable row level security;
-- alter table public.leads   disable row level security;
