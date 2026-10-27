import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { verificarSesion } from '@/lib/sesion';

/**
 * La única puerta del panel a su base de datos (Supabase, proyecto `fsmtech`; ADR-001 y ADR-002).
 *
 * - **Es el único archivo que lee la clave secreta.** Ninguna página, acción ni ruta crea otro
 *   cliente ni lee las variables: todo pasa por `baseDeDatos()`
 * - La clave secreta entra como `service_role`, que se salta el RLS: lo que protege los datos es
 *   `verificarSesion()`, que se llama **antes** de devolver el cliente, como `obtenerBoveda()` con
 *   las notas. Sin sesión, a `/login`
 * - `/api/vigilancia` no tiene sesión y **nunca** importa este archivo
 * - Sin sesión de Supabase Auth (nadie entra en Supabase: el acceso es el del panel) y sin caché de
 *   `fetch`: cada lectura va a la base, para que ni Next ni Vercel guarden filas con nombres
 */

/** Faltan las variables de la base (o la URL no es `https`): la sección dice que falta configurarla */
export class BaseSinConfigurar extends Error {
  constructor() {
    super('Falta configurar la base de datos del panel.');
    this.name = 'BaseSinConfigurar';
  }
}

let avisadoSinHttps = false;

/** La URL y la clave, o null si falta alguna. La clave solo viaja cifrada: una URL que no sea `https` no vale */
function leerConfiguracion(): { url: string; clave: string } | null {
  const url = process.env.SUPABASE_URL?.trim();
  const clave = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !clave) return null;
  let segura = false;
  try {
    segura = new URL(url).protocol === 'https:';
  } catch {
    segura = false;
  }
  if (!segura) {
    if (!avisadoSinHttps) console.error('[base] SUPABASE_URL tiene que ser https://<ref>.supabase.co: se trata como sin configurar.');
    avisadoSinHttps = true;
    return null;
  }
  return { url, clave };
}

/** ¿Están SUPABASE_URL y la clave secreta? Sin ellas, la sección dice que falta configurar la base */
export function hayBase(): boolean {
  return leerConfiguracion() !== null;
}

/** Uno por proceso: el cliente no guarda nada de nadie (no hay sesión de Auth), así que se reutiliza */
let cliente: SupabaseClient | null = null;

/**
 * Comprueba la sesión (`verificarSesion`) y devuelve el cliente, uno por proceso, sin sesión de Auth.
 * Lanza `BaseSinConfigurar` si faltan las variables
 */
export async function baseDeDatos(): Promise<SupabaseClient> {
  await verificarSesion();
  const configuracion = leerConfiguracion();
  if (!configuracion) throw new BaseSinConfigurar();
  cliente ??= createClient(configuracion.url, configuracion.clave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    // Sin la caché de datos de Next, también si algún día cambia lo que hace por defecto
    global: { fetch: (entrada, opciones) => fetch(entrada, { ...opciones, cache: 'no-store' }) },
  });
  return cliente;
}
