'use server';

import { guardar, responderReflexion, type ResultadoEscritura } from '@/lib/boveda/escritura';
import { verificarSesion } from '@/lib/sesion';

/** Las respuestas a la reflexión de una revisión semanal. Comprueba la sesión y lo que llega */
export async function responderSemana(ruta: string, respuestas: { pregunta: string; respuesta: string }[]): Promise<ResultadoEscritura> {
  await verificarSesion();
  const validas =
    typeof ruta === 'string' &&
    ruta.length <= 200 &&
    Array.isArray(respuestas) &&
    respuestas.length <= 10 &&
    respuestas.every((r) => typeof r?.pregunta === 'string' && r.pregunta.length <= 300 && typeof r.respuesta === 'string' && r.respuesta.length <= 3000);
  if (!validas) return { error: 'Datos no válidos.' };
  return guardar('responder la reflexión', () => responderReflexion(ruta, respuestas));
}
