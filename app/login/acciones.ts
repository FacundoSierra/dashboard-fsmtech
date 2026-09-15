'use server';

import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE_SESION, DURACION_SESION_S, crearToken } from '@/lib/firma';
import type { EstadoLogin } from './estado';

function huella(valor: string): Buffer {
  return createHash('sha256').update(valor).digest();
}

/** Solo rutas internas: evita redirigir a otra web con `?desde=//otra.com` */
function destinoSeguro(valor: FormDataEntryValue | null): string {
  const destino = typeof valor === 'string' ? valor : '';
  return destino.startsWith('/') && !destino.startsWith('//') && !destino.includes('\\') ? destino : '/';
}

export async function iniciarSesion(_anterior: EstadoLogin, datos: FormData): Promise<EstadoLogin> {
  const esperada = process.env.DASHBOARD_PASSWORD;
  const token = esperada ? await crearToken() : null;
  if (!esperada || !token) {
    return { error: 'El panel no está configurado: faltan DASHBOARD_PASSWORD o DASHBOARD_SECRET.' };
  }

  const recibida = datos.get('password');
  if (typeof recibida !== 'string' || !timingSafeEqual(huella(recibida), huella(esperada))) {
    // Frena los intentos por fuerza bruta
    await new Promise((resolver) => setTimeout(resolver, 1000));
    return { error: 'Contraseña incorrecta.' };
  }

  (await cookies()).set(COOKIE_SESION, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DURACION_SESION_S,
  });
  redirect(destinoSeguro(datos.get('desde')));
}

export async function cerrarSesion(): Promise<void> {
  (await cookies()).delete(COOKIE_SESION);
  redirect('/login');
}
