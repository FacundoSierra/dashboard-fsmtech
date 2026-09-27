'use server';

import { anadirCobroExtra, anadirRenovacion, guardar, marcarCobro, type ResultadoEscritura } from '@/lib/boveda/escritura';
import { numero } from '@/lib/economia';
import { esFechaValida, hoyMadrid } from '@/lib/fechas';
import { verificarSesion } from '@/lib/sesion';

// Cada Server Action es un endpoint POST propio: la sesión se comprueba aquí, no solo en el
// proxy, y nada de lo que llega se da por bueno

export type EstadoCobro = ResultadoEscritura;

const NO_VALIDOS: ResultadoEscritura = { error: 'Datos no válidos.' };
const esTexto = (valor: unknown, maximo: number): valor is string => typeof valor === 'string' && valor.length <= maximo;

/** Marca un cobro como cobrado, o lo deshace. Llega de un botón de la página de Economía */
export async function cambiarCobro(_anterior: EstadoCobro, datos: FormData): Promise<EstadoCobro> {
  await verificarSesion();
  const ruta = datos.get('ruta');
  const linea = datos.get('linea');
  if (!esTexto(ruta, 200) || !esTexto(linea, 500)) return NO_VALIDOS;
  return guardar('marcar el cobro', () => marcarCobro(ruta, linea, datos.get('cobrado') === '1', hoyMadrid()));
}

/** Un cobro que no estaba en el plan (un trabajo suelto, un extra): se apunta ya cobrado */
export async function apuntarCobroExtra(ruta: string, concepto: string, importe: string, fecha: string): Promise<ResultadoEscritura> {
  await verificarSesion();
  if (!esTexto(ruta, 200) || !esTexto(concepto, 500) || !esTexto(importe, 20) || !esTexto(fecha, 10)) return NO_VALIDOS;

  const cantidad = numero(importe);
  if (cantidad === undefined) return { error: 'El importe tiene que ser un número, como 150 o 49,90.' };
  // Se apunta lo cobrado, no lo que se va a cobrar: eso va en el plan
  if (!esFechaValida(fecha) || fecha > hoyMadrid()) return { error: 'La fecha tiene que ser la de hoy o una anterior.' };

  return guardar('apuntar el cobro extra', () =>
    anadirCobroExtra(ruta, { concepto, importe: Math.round(cantidad * 100) / 100, fecha }),
  );
}

/** Algo que caduca y el panel no averigua solo, en la ficha del cliente */
export async function apuntarRenovacion(ruta: string, fecha: string, concepto: string): Promise<ResultadoEscritura> {
  await verificarSesion();
  if (!esTexto(ruta, 200) || !esTexto(fecha, 10) || !esTexto(concepto, 500)) return NO_VALIDOS;
  if (!esFechaValida(fecha)) return { error: 'La fecha no es válida.' };
  return guardar('apuntar la renovación', () => anadirRenovacion(ruta, fecha, concepto));
}
