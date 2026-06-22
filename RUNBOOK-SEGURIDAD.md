# 🔒 Runbook — Cerrar el acceso a HQ (login + RLS)

**Qué resuelve:** hoy cualquiera que abra el sitio de HQ puede leer tu base de datos
(incluidos los datos de prospectos en `leads`). Esto agrega un **login real** y un
**candado en la base** (RLS) para que solo vos, logueado, puedas entrar.

**Quién hace qué:**
- El **código** ya está hecho (rama `feat/login-rls`): pantalla de login + sesión.
- Vos hacés **2 cosas dentro de Supabase** (crear tu usuario y correr un SQL), porque
  son acciones de producción. Están en pasos de copiar/pegar acá abajo.

---

## ⚠️ El orden importa (si lo hacés al revés, te quedás afuera de HQ)

```
1. Crear tu usuario  →  2. Desplegar la app nueva  →  3. Entrar y probar el login
                                                         →  4. Recién ahí correr el SQL
```

El motivo: el SQL pone el candado. Si lo ponés **antes** de que la app nueva (con login)
esté arriba, la app vieja deja de poder leer la base y HQ se ve vacío hasta desplegar.

---

## Paso 1 — Crear tu usuario en Supabase (2 minutos)

1. Entrá a: https://supabase.com/dashboard/project/zngbeqbvmbxeweldmyaf/auth/users
2. Botón **"Add user"** → **"Create new user"**.
3. Poné tu **email** y una **contraseña fuerte** (guardala en tu Bóveda de HQ después).
4. Dejá tildado **"Auto Confirm User"** (así no tenés que confirmar por mail).
5. **Create user.**

Ese email + contraseña es con el que vas a entrar a HQ de ahora en más.

---

## Paso 2 — Verificar n8n (importante, antes del candado de `leads`)

El candado de la tabla `leads` puede cortarle a n8n la carga de leads **si** n8n escribe
con la llave anónima. Hay que confirmar que usa la **Service Role** (la llave de servidor,
que ignora el candado).

- Abrí el workflow de n8n que carga leads (el que mete prospectos en la tabla `leads`).
- Mirá el nodo de Supabase / HTTP que hace el INSERT: la llave que usa tiene que ser la
  **`service_role`** (empieza distinto a la `sb_publishable_...` que está en el HTML).
- Si ya usa `service_role` → perfecto, no se rompe nada.
- Si usa la anónima (`sb_publishable_...` o la `anon`) → **avisame antes de correr el PASO 2
  del SQL**, lo cambiamos primero.

> 💡 Pista: como `leads` **ya** tenía un candado de solo-lectura y n8n igual venía cargando
> leads, lo más probable es que ya use `service_role`. Pero confirmalo, no lo asumas.

---

## Paso 3 — Desplegar la app nueva

La app nueva está en la rama `feat/login-rls`. Para que llegue a producción
(`concepto-hq.vercel.app`) hay que llevarla a `main`.

**Esto lo podemos hacer juntos cuando me digas** (no lo hice solo: tocar producción lo
confirmás vos en la sesión). Cuando quieras, te lo hago en un comando.

Después del deploy, abrí `concepto-hq.vercel.app`: tiene que aparecer la **pantalla de
login** (candado). Entrá con el email/contraseña del Paso 1.

✅ Si entrás y ves tu HQ normal → el login anda. Seguí al Paso 4.
❌ Si algo falla → no corras el SQL todavía, avisame.

---

## Paso 4 — Poner el candado en la base (correr el SQL)

Abrí el SQL Editor: https://supabase.com/dashboard/project/zngbeqbvmbxeweldmyaf/sql/new

Abrí el archivo **`SEGURIDAD-RLS.sql`** (está en la carpeta de HQ) y seguí los pasos
que tiene adentro, en orden:

1. **PASO 0** (diagnóstico) → corré y mirá qué candados hay hoy.
2. **PASO 1** (`hq_data`) → corré. Cierra tu base personal. **Seguro de correr ya.**
   - Volvé a HQ y refrescá. Tenés que seguir entrando y viendo tus datos.
3. **PASO 2** (`leads`) → corré **solo si** el Paso 2 (n8n) dio que usa `service_role`.

---

## Paso 5 — Confirmar que el agujero quedó cerrado

En una terminal, pegá esto (es el mismo test con el que confirmamos que estaba abierto):

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://zngbeqbvmbxeweldmyaf.supabase.co/rest/v1/hq_data?select=id" \
  -H "apikey: sb_publishable_nNQhjFQGR4n8FuSLCjOA0Q_2FsgmXUA"
```

- **Antes:** devolvía la fila `bruno`.
- **Después:** tiene que dar `200` con lista vacía `[]`, o `401`/`403`.
- Si todavía devuelve datos → el RLS no quedó activo, avisame.

---

## 🔙 Si algo sale mal (rollback de 1 minuto)

En el SQL Editor, corré las dos últimas líneas del archivo `SEGURIDAD-RLS.sql`:

```sql
alter table public.hq_data disable row level security;
alter table public.leads   disable row level security;
```

Eso **destraba todo** y volvés al estado de antes. (Ojo: reabre el agujero temporalmente,
es solo para destrabarte si quedaste afuera. Después lo reintentamos con calma.)

---

## ⚠️ Riesgos y pendientes (honesto)

- **No se probó el login en un navegador real** todavía (el preview está bloqueado por el
  entorno). Se verificó: sintaxis del código OK, el SDK carga del CDN, y el Auth de Supabase
  responde. La prueba visual final es el Paso 3.
- **`estado_sistema` y `videos` siguen abiertos** (lectura anónima). Son datos menos sensibles
  (salud de sistemas y métricas de marketing, no datos de clientes). Quedan para una 2ª fase.
- **Bóveda de contraseñas:** ya estaba bien cifrada, no cambia. Mejora menor pendiente: subir
  el PIN de 4 a 6 dígitos.
- **Dependencia nueva:** el login usa el SDK oficial de Supabase desde jsDelivr (CDN). Si ese
  CDN se cayera, el login no cargaría. Es el mismo CDN que ya usás para los videos.
- **Dos accesos conviven:** el login nuevo (protege los datos) y el `ADMIN_TOKEN` viejo
  (protege los endpoints de IA `/api/*`). Funcionan en paralelo. Unificarlos es mejora futura.
