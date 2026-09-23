import 'server-only';
import { cookies } from 'next/headers';

/**
 * El reto que el dispositivo tiene que firmar. Viaja en una cookie `httpOnly` de cinco minutos:
 * el panel no tiene dónde guardarlo en el servidor, y una cookie así no la puede poner otra web.
 */

const COOKIE_RETO = 'reto_passkey';
const DURACION_S = 5 * 60;

export async function guardarReto(reto: string): Promise<void> {
  (await cookies()).set(COOKIE_RETO, reto, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/passkeys',
    maxAge: DURACION_S,
  });
}

export async function leerReto(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE_RETO)?.value || undefined;
}

export async function borrarReto(): Promise<void> {
  (await cookies()).delete({ name: COOKIE_RETO, path: '/api/passkeys' });
}
