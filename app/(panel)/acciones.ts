'use server';

import { obtenerBoveda } from '@/lib/boveda/consultas';
import { montarDiaria } from '@/lib/boveda/diaria';
import {
  ErrorYaExiste,
  anadirObjetivo,
  crearDiaria,
  guardar,
  leerPlantilla,
  marcarTarea,
  moverTarea,
  type ResultadoEscritura,
} from '@/lib/boveda/escritura';
import { hoyMadrid } from '@/lib/fechas';
import { verificarSesion } from '@/lib/sesion';

// Lo que se hace con la diaria desde la página de Hoy. Cada Server Action es un endpoint POST
// propio: comprueba la sesión al empezar y no da por bueno nada de lo que llega, porque los
// tipos de TypeScript no viajan con la petición.

const NO_VALIDOS: ResultadoEscritura = { error: 'Datos no válidos.' };
const esTexto = (valor: unknown, maximo: number): valor is string => typeof valor === 'string' && valor.length <= maximo;

/** Marca o desmarca una tarea de «Objetivos» o «A la espera» */
export async function cambiarTarea(ruta: string, linea: string, hecha: boolean): Promise<ResultadoEscritura> {
  await verificarSesion();
  if (!esTexto(ruta, 200) || !esTexto(linea, 1000) || typeof hecha !== 'boolean') return NO_VALIDOS;
  return guardar('marcar la tarea', () => marcarTarea(ruta, linea, hecha));
}

/** Pasa un objetivo a «A la espera», con quién lo tiene y desde hoy */
export async function pasarAEspera(ruta: string, linea: string, quien: string): Promise<ResultadoEscritura> {
  await verificarSesion();
  if (!esTexto(ruta, 200) || !esTexto(linea, 1000) || !esTexto(quien, 200)) return NO_VALIDOS;
  return guardar('pasar la tarea a la espera', () => moverTarea(ruta, linea, { a: 'espera', quien, desde: hoyMadrid() }));
}

/** El otro ha contestado: la tarea vuelve a «Objetivos» */
export async function devolverAObjetivos(ruta: string, linea: string): Promise<ResultadoEscritura> {
  await verificarSesion();
  if (!esTexto(ruta, 200) || !esTexto(linea, 1000)) return NO_VALIDOS;
  return guardar('devolver la tarea a objetivos', () => moverTarea(ruta, linea, { a: 'objetivos' }));
}

/** Apunta un objetivo en la diaria de hoy. Si aún no existe, la crea como la crearía el PC */
export async function apuntarObjetivo(texto: string): Promise<ResultadoEscritura> {
  await verificarSesion();
  if (!esTexto(texto, 1000)) return NO_VALIDOS;

  const hoy = hoyMadrid();
  const ruta = `daily-notes/${hoy}.md`;
  return guardar('apuntar el objetivo', async () => {
    const boveda = await obtenerBoveda();
    if (boveda.porRuta.has(ruta)) return anadirObjetivo(ruta, texto);
    try {
      await crearDiaria(ruta, montarDiaria(boveda, hoy, await leerPlantilla('daily-note')), texto);
    } catch (error) {
      // El PC la ha subido hace nada y la bóveda en caché aún no la tenía: se añade a esa
      if (!(error instanceof ErrorYaExiste)) throw error;
      await anadirObjetivo(ruta, texto);
    }
  });
}
