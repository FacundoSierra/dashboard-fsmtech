'use server';

import { updateTag } from 'next/cache';
import { ErrorEscritura, marcarCobro } from '@/lib/boveda/escritura';
import { hoyMadrid } from '@/lib/fechas';
import { verificarSesion } from '@/lib/sesion';

export interface EstadoCobro {
  error?: string;
}

/** Marca un cobro como cobrado, o lo deshace. Llega de un botón de la página de Economía */
export async function cambiarCobro(_anterior: EstadoCobro, datos: FormData): Promise<EstadoCobro> {
  // Una Server Action es un endpoint POST propio: la sesión se comprueba aquí, no solo en el proxy
  await verificarSesion();

  const ruta = datos.get('ruta');
  const linea = datos.get('linea');
  if (typeof ruta !== 'string' || typeof linea !== 'string' || linea.length > 500) {
    return { error: 'Datos no válidos.' };
  }

  try {
    await marcarCobro(ruta, linea, datos.get('cobrado') === '1', hoyMadrid());
  } catch (error) {
    console.error('No se pudo marcar el cobro', error);
    return { error: error instanceof ErrorEscritura ? error.message : 'No se ha podido guardar. Inténtalo de nuevo.' };
  }

  updateTag('boveda');
  return {};
}
