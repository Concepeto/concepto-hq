# 🔒 Pendientes de seguridad — Concepto HQ (sesión dedicada)

> Estado al 2026-06-22: lo CRÍTICO está cerrado y verificado en producción.
> `hq_data` y `leads` (datos personales + de clientes) → RLS activo, un anónimo recibe `[]`.
> Login real con email+contraseña en vivo. La IA va por el mismo login (chau token).
>
> Quedan estos 2 pendientes. Ninguno expone datos de clientes — pero hay que cerrarlos.

---

## PENDIENTE 1 — Cerrar las tablas de marketing (requiere migrar n8n primero)

**Qué está mal:** `videos`, `video_metrics`, `learning_insights` tienen una policy
`public_all` ({public}, cmd ALL) → cualquiera con la key publishable (está en el HTML)
lee/escribe/BORRA. `estado_sistema` tiene lectura pública. Expone marketing interno
(spend de Meta Ads, estrategia de contenido) y permite ensuciar/borrar esas tablas.

**Por qué no se cerró aún:** los workflows de n8n escriben esas tablas con la **misma
key publishable** (hardcodeada en code nodes), no con `service_role`. Si se cierra el RLS
sin migrar n8n, se rompen métricas, cerebro de insights, healthchecks y publicación.
Verificado leyendo el workflow `A8ugMIVdU8SByhJg`: `const KEY='sb_publishable_...'`.

**Workflows de n8n a migrar** (instancia: MCP `n8n-elestio`, ES la de HQ):
- `A8ugMIVdU8SByhJg` — Métricas Diarias + Cerebro IA → escribe `video_metrics`, `learning_insights`
- `R7O5Het0abm6yhZ8` — MAX Generación Automática de Contenido v2 → escribe `videos`
- `rKNQgznKnqegMznX` — Publicar Reel desde HQ → toca `videos`
- `cEOjQKFCjcLe1vqm`, `oOvaVlajSBdG0xTe`, `mbQ0gqhT0So7r5EI` — Healthchecks → escriben `estado_sistema`
- (revisar también `mOSJQ5mFknyxRIQR` Marcar contactado, y backups de leads — usan leads/hq_data)

**Plan (en orden, NO saltear):**
1. Conseguir la **service_role key** de Supabase (Dashboard → Project Settings → API).
   Es un SECRETO: bypassa todo el RLS. NUNCA hardcodearla en un code node.
2. Cargarla como **variable de entorno en n8n/Elestio** (ej. `SB_SERVICE_KEY`) o como credencial.
3. En cada workflow de arriba, cambiar `const KEY='sb_publishable_...'` por leer la env var
   (`$env.SB_SERVICE_KEY` o equivalente). Probar cada workflow (ejecución manual) y ver que
   sigue escribiendo OK.
4. Desplegar el front (rama `feat/cerrar-videos`, ya tiene la app leyendo/escribiendo estas
   tablas con la sesión vía `sbVideoHeaders()` + `estado_sistema` con `sbHeaders()`).
5. Recién ahí, cerrar el RLS en Supabase:
   - `videos`: la app ESCRIBE (aprobar/corregir) → `for all to authenticated using(true) with check(true)`.
   - `video_metrics`, `learning_insights`, `estado_sistema`: la app solo LEE → `for select to authenticated`.
   - Quitar la policy `public_all` / `lectura publica estado` en las 4.
   - n8n con service_role bypassa el RLS → no necesita policy.
6. Verificar con la prueba del atacante (curl anónimo): lectura Y escritura → 401/403/[].

**Rollback:** `alter table public.<tabla> disable row level security;` por tabla.

---

## PENDIENTE 2 — Reforzar la Bóveda (guarda contraseñas de clientes/producción)

**Qué está flojo** (`index.html`, funciones `deriveKey`/`encStr`/`unlockVault`):
- PIN mínimo de **4 dígitos** (10.000 combos) + **salt fijo** (`'concepto-hq-vault'`) →
  un atacante precomputa todas las claves una vez. Con el dispositivo robado (o acceso al
  `localStorage` / a la fila `hq_data`), descifra todo offline en segundos.
- Hay un oráculo de known-plaintext (`vault.check` = `'concepto-ok'` cifrado) que confirma
  cuándo se acertó el PIN.

**El cifrado en sí está bien** (AES-GCM 256, IV aleatorio, PBKDF2 120k). El problema es la
LLAVE (keyspace chico + salt fijo), no el algoritmo.

**Plan (CON MIGRACIÓN — clave para no perder acceso a las contraseñas):**
1. **Salt aleatorio por instalación:** generar un salt random la 1ª vez, guardarlo junto a
   `vault.check`. Mata la precomputación.
2. **PIN más largo o passphrase:** subir mínimo a 6 dígitos, o permitir frase.
3. **Migración:** cuando Bruno desbloquea con el PIN viejo, descifrar todos los ítems con el
   método viejo y re-cifrar con el nuevo (salt random + PIN nuevo) EN EL MOMENTO. Probar que
   los ítems existentes se siguen leyendo antes de declarar hecho. NO cambiar el esquema sin
   migración o se pierde el acceso a las contraseñas guardadas.
4. (Opcional) sacar el oráculo: verificar el PIN por el tag de AES-GCM de un ítem real.

---

## Pendientes menores (rápidos, cualquier sesión)
- **Rotar el `ADMIN_TOKEN`** viejo en Vercel (ahora es solo respaldo de `isAuthed`) — o borrarlo.
- **`isAuthed`** (`api/_lib/auth.js`): agregar timeout (~5s) al fetch a Supabase y validar que
  la respuesta trae un `id`/`email`, no solo `r.ok`.
- **CORS** en los 3 endpoints de IA: cambiar `*` por el dominio propio + rate limiting.
- **Limpieza:** el `auth-modal` viejo del token quedó inerte en el HTML (código muerto).
- **Remote git:** actualizar a `Concepeto/concepto-hq` (hoy usa la URL vieja que redirige).
- **`hq_data` policy `using(true)`:** OK para 1 usuario; el día que haya un 2º usuario, anclar
  con columna `owner` y `using(owner = auth.uid())`.
