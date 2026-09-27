import 'server-only';
import { reposLocales } from '@/lib/vigilancia/repos-locales';
import { dailies, texto } from './consultas';
import { contenidoSeccion } from './parser';
import type { Boveda } from './tipos';

/**
 * La diaria de un día montada igual que la monta `.scripts/nota-diaria.ps1` en el PC: la
 * plantilla con lo que quedó sin marcar en «Objetivos» y «A la espera» de la última diaria, los
 * repos con commits sin subir, las reuniones de ese día y el enlace a la diaria anterior.
 *
 * El panel la usa cuando se apunta un objetivo y la diaria de hoy aún no existe, que es lo que
 * pasa si el PC está apagado. Si cambia cómo se monta, hay que cambiarlo en los dos sitios.
 */
export function montarDiaria(boveda: Boveda, fecha: string, plantilla: string): string {
  const anterior = dailies(boveda).find((nota) => nota.nombre < fecha);
  const pendientes = (clave: string): string[] =>
    anterior ? (contenidoSeccion(anterior, clave) ?? '').split(/\r?\n/).filter((linea) => /^- \[ \]\s+\S/.test(linea)) : [];

  const objetivos = pendientes('objetivos');
  const espera = pendientes('a la espera');

  for (const repo of reposLocales(boveda)?.repos ?? []) {
    if (!repo.sinSubir) continue;
    if (objetivos.some((linea) => linea.includes(`[[${repo.nombre}]]`) && linea.includes('subir'))) continue;
    const cuales = repo.sinSubir === 1 ? 'el commit que espera' : `los ${repo.sinSubir} commits que esperan`;
    objetivos.push(`- [ ] [[${repo.nombre}]]: subir ${cuales} en el PC`);
  }

  const reuniones = boveda.notas
    .filter((nota) => /^clientes\/.+\/reuniones\//.test(nota.ruta) && texto(nota.propiedades.fecha) === fecha)
    .map((nota) => ({ nombre: nota.nombre, hora: texto(nota.propiedades.hora)?.match(/^\d{1,2}[:.]\d{2}$/)?.[0] }))
    .sort((a, b) => (a.hora ?? '').localeCompare(b.hora ?? ''))
    .map(({ nombre, hora }) => `- [ ] 📅 **Reunión hoy${hora ? ` a las ${hora}` : ''}**: [[${nombre}]]`);

  const contenido: Record<string, string[]> = {
    objetivos: [...reuniones, ...objetivos],
    'a la espera': espera,
    referencias: anterior ? [`- [[${anterior.nombre}]]`] : [],
  };

  // Cada lista va en el primer hueco de su sección (`- [ ]` o `-` vacíos); si no hay nada que
  // poner, el hueco se queda como en la plantilla
  const puestas = new Set<string>();
  let seccion: string | undefined;
  const salida: string[] = [];
  for (const linea of plantilla.replace(/^﻿/, '').replace(/\{\{title\}\}/g, fecha).split(/\r?\n/)) {
    if (/^##\s/.test(linea)) {
      seccion = Object.keys(contenido).find((clave) => linea.toLowerCase().includes(clave));
      salida.push(linea);
      continue;
    }
    const lineas = seccion ? contenido[seccion] : [];
    const hueco = linea.trim() === '- [ ]' || linea.trim() === '-';
    if (seccion && hueco && lineas.length && !puestas.has(seccion)) {
      salida.push(...lineas);
      puestas.add(seccion);
      continue;
    }
    salida.push(linea);
  }
  // Como el script: saltos de Windows
  return salida.join('\r\n');
}
