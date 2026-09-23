import 'server-only';
import { headers } from 'next/headers';
import type { Passkey } from './tipos';

/** Los dispositivos registrados, de la variable `PASSKEYS`. Si está mal escrita, es como si no hubiera ninguno */
export function leerPasskeys(): Passkey[] {
  const valor = process.env.PASSKEYS?.trim();
  if (!valor) return [];
  try {
    const datos: unknown = JSON.parse(valor);
    if (!Array.isArray(datos)) return [];
    return datos.filter(esPasskey);
  } catch {
    console.error('PASSKEYS no es un JSON válido: se ignora y solo se puede entrar con la contraseña');
    return [];
  }
}

function esPasskey(valor: unknown): valor is Passkey {
  if (!valor || typeof valor !== 'object') return false;
  const { id, llave, nombre } = valor as Record<string, unknown>;
  return typeof id === 'string' && typeof llave === 'string' && typeof nombre === 'string' && Boolean(id && llave);
}

export function hayPasskeys(): boolean {
  return leerPasskeys().length > 0;
}

/**
 * El dominio y la dirección que espera WebAuthn. Salen de la petición: en producción,
 * `dashboard.facundosmtech.com`; en desarrollo, `localhost`.
 */
export async function datosRP(): Promise<{ rpID: string; origen: string }> {
  const cabeceras = await headers();
  const host = cabeceras.get('x-forwarded-host') ?? cabeceras.get('host') ?? 'localhost:3000';
  const protocolo = cabeceras.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return { rpID: host.split(':')[0], origen: `${protocolo}://${host}` };
}
