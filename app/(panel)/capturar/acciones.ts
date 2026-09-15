'use server';

import { updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { MAX_CAPTURA, componerCaptura, esTipoCaptura } from '@/lib/boveda/captura';
import { obtenerBoveda } from '@/lib/boveda/consultas';
import { ErrorEscritura, crearNotaInbox } from '@/lib/boveda/escritura';
import { verificarSesion } from '@/lib/sesion';
import type { EstadoCaptura } from './estado';

export async function guardarCaptura(_anterior: EstadoCaptura, datos: FormData): Promise<EstadoCaptura> {
  // Una Server Action es un endpoint POST propio: la sesión se comprueba aquí, no solo en el proxy
  await verificarSesion();

  const campo = (nombre: string) => {
    const valor = datos.get(nombre);
    return typeof valor === 'string' ? valor : '';
  };
  const texto = campo('texto').trim();
  const tipo = campo('tipo');
  const relacionada = campo('relacionada');
  const conservar = { texto, tipo, relacionada };

  if (!texto) return { ...conservar, error: 'Escribe algo antes de guardar.' };
  if (texto.length > MAX_CAPTURA) {
    return { ...conservar, error: `El texto es demasiado largo: máximo ${MAX_CAPTURA} caracteres.` };
  }
  if (!esTipoCaptura(tipo)) return { ...conservar, error: 'Elige si es una idea, una tarea o una nota.' };

  // Solo se enlaza a notas que existen, con nombres sin caracteres especiales
  const boveda = await obtenerBoveda();
  const destino = /^[\w.-]+$/.test(relacionada) && boveda.rutas[relacionada] ? relacionada : undefined;
  const captura = componerCaptura({ tipo, texto, relacionada: destino });

  try {
    await crearNotaInbox(captura.ruta, captura.contenido, `inbox: ${captura.titulo}`);
  } catch (error) {
    console.error('No se pudo guardar la captura', error);
    const mensaje = error instanceof ErrorEscritura ? error.message : 'No se ha podido guardar. Inténtalo de nuevo.';
    return { ...conservar, error: mensaje };
  }

  // Caduca el árbol de notas en caché para que el inbox muestre la captura al momento
  updateTag('boveda');
  redirect(`/inbox?guardada=${encodeURIComponent(captura.ruta)}`);
}
