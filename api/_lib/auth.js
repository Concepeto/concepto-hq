// Autoriza un request a los endpoints de IA de HQ.
// Acepta dos formas (en este orden):
//   1. El ADMIN_TOKEN viejo — red de seguridad, por si el login nuevo fallara.
//   2. Una sesión real de Supabase (el login nuevo: email + contraseña).
// Mientras alguna de las dos sea válida, el request pasa. Si ninguna, se rechaza.
//
// Nota: como en HQ no hay registro público (los usuarios se crean a mano en
// Supabase), cualquier sesión válida es la de Bruno. Si algún día hubiera más
// de un usuario, acá habría que chequear el email/uid específico.

const SB_URL = 'https://zngbeqbvmbxeweldmyaf.supabase.co';
const SB_KEY = 'sb_publishable_nNQhjFQGR4n8FuSLCjOA0Q_2FsgmXUA';

export async function isAuthed(req) {
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return false;

  // 1) Token viejo (compatibilidad / red de seguridad)
  if (process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN) return true;

  // 2) Sesión de Supabase: preguntarle a Supabase si el token es de un usuario válido
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + token }
    });
    return r.ok; // 200 = sesión válida
  } catch {
    return false;
  }
}
