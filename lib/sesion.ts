import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { COOKIE_SESION, tokenValido } from './firma';

/**
 * Comprobación fuerte de la sesión. `obtenerBoveda()` la llama antes de leer ninguna nota,
 * así que una página nueva no puede devolver notas sin sesión aunque el proxy no la cubra.
 */
export const verificarSesion = cache(async (): Promise<void> => {
  const token = (await cookies()).get(COOKIE_SESION)?.value;
  if (!(await tokenValido(token))) redirect('/login');
});
