import 'server-only';
import { unstable_cache } from 'next/cache';
import { AGENTE, ESPERA_REINTENTO_MS, TIEMPO_LIMITE_MS, esperar, explicarError } from './red';

export interface EstadoSupabase {
  activa: boolean;
  /** El subdominio del proyecto no resuelve, ni al reintentar */
  sinDominio?: boolean;
  codigo?: number;
  ms?: number;
  error?: string;
}

/**
 * Comprueba que la base responde sin usar ninguna clave.
 *
 * Una base activa contesta en su endpoint de salud con un 401 «No API key found»: es la
 * pasarela de Supabase diciendo que el proyecto existe y está encendido, pero que falta
 * la clave. Así no hay que guardar en el panel la clave de ningún proyecto. Cualquier
 * otra respuesta (un 5xx, un error de red) es que la base no está disponible: pausada,
 * borrada o caída.
 */
async function comprobar(url: string): Promise<EstadoSupabase> {
  const primera = await pedir(url);
  if (primera.activa) return primera;
  // Un fallo puntual de DNS o de red no puede acabar en alerta: se reintenta una vez
  await esperar(ESPERA_REINTENTO_MS);
  return pedir(url);
}

async function pedir(url: string): Promise<EstadoSupabase> {
  const inicio = performance.now();
  try {
    const respuesta = await fetch(`${url}/auth/v1/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
      headers: { 'user-agent': AGENTE },
    });
    const ms = Math.round(performance.now() - inicio);
    const cuerpo = (await respuesta.text()).slice(0, 500);
    const activa = respuesta.status === 200 || (respuesta.status === 401 && /api key/i.test(cuerpo));
    return {
      activa,
      codigo: respuesta.status,
      ms,
      error: activa ? undefined : `La base responde ${respuesta.status}`,
    };
  } catch (error) {
    const motivo = explicarError(error);
    // No se afirma que esté borrada: un DNS doméstico puede dar por inexistente un
    // proyecto vivo. Si el fallo se repite hora tras hora, la incidencia lo dirá
    return { activa: false, sinDominio: motivo === 'El dominio no resuelve', error: motivo };
  }
}

export const comprobarSupabase = unstable_cache(comprobar, ['vigilancia-supabase'], {
  revalidate: 120,
  tags: ['vigilancia'],
});
