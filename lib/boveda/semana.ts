import 'server-only';
import { sumarDias } from '@/lib/fechas';
import { dailies, reuniones, type ResumenReunion } from './consultas';
import { contenidoSeccion, tareasDe } from './parser';
import type { Boveda, Nota, Tarea } from './tipos';

/** Tareas con fecha delante, como en "Próximos pasos": `2026-09-15 — Repo copiado…` */
const RE_TAREA_FECHADA = /^(\d{4}-\d{2}-\d{2})\s*[—–-]\s*(.*)$/;

export interface DiaSemana {
  fecha: string;
  daily?: Nota;
  objetivosHechos: number;
  objetivosTotales: number;
  /** Tareas marcadas en "Completado" de la daily */
  completado: Tarea[];
  /** Tareas marcadas con esta fecha en cualquier otra nota */
  enNotas: { texto: string; nota: Nota }[];
  reuniones: ResumenReunion[];
}

export interface ResumenSemana {
  lunes: string;
  domingo: string;
  dias: DiaSemana[];
  /** Días seguidos con daily hasta hoy; si hoy aún no hay, hasta ayer */
  racha: number;
  totales: {
    objetivosHechos: number;
    objetivosTotales: number;
    completado: number;
    enNotas: number;
    reuniones: number;
    dailies: number;
  };
}

export function resumenSemana(boveda: Boveda, lunes: string, hoy: string): ResumenSemana {
  const dailyPorFecha = new Map(dailies(boveda).map((nota) => [nota.nombre, nota]));
  const todasLasReuniones = reuniones(boveda);

  const hechasPorFecha = new Map<string, { texto: string; nota: Nota }[]>();
  for (const nota of boveda.notas) {
    if (nota.carpeta === 'daily-notes') continue;
    for (const tarea of tareasDe(nota.cuerpo)) {
      const fechada = tarea.hecha ? tarea.texto.match(RE_TAREA_FECHADA) : null;
      if (!fechada) continue;
      hechasPorFecha.set(fechada[1], [...(hechasPorFecha.get(fechada[1]) ?? []), { texto: fechada[2], nota }]);
    }
  }

  const dias: DiaSemana[] = Array.from({ length: 7 }, (_, i) => {
    const fecha = sumarDias(lunes, i);
    const daily = dailyPorFecha.get(fecha);
    const objetivos = daily ? tareasDe(contenidoSeccion(daily, 'objetivos') ?? '').filter((t) => t.nivel === 0) : [];
    return {
      fecha,
      daily,
      objetivosHechos: objetivos.filter((t) => t.hecha).length,
      objetivosTotales: objetivos.length,
      completado: daily
        ? tareasDe(contenidoSeccion(daily, 'completado') ?? '').filter((t) => t.nivel === 0 && t.hecha)
        : [],
      enNotas: hechasPorFecha.get(fecha) ?? [],
      reuniones: todasLasReuniones.filter((r) => r.fecha === fecha),
    };
  });

  const suma = (valor: (dia: DiaSemana) => number) => dias.reduce((total, dia) => total + valor(dia), 0);

  let racha = 0;
  for (let fecha = dailyPorFecha.has(hoy) ? hoy : sumarDias(hoy, -1); dailyPorFecha.has(fecha); fecha = sumarDias(fecha, -1)) {
    racha++;
  }

  return {
    lunes,
    domingo: sumarDias(lunes, 6),
    dias,
    racha,
    totales: {
      objetivosHechos: suma((d) => d.objetivosHechos),
      objetivosTotales: suma((d) => d.objetivosTotales),
      completado: suma((d) => d.completado.length),
      enNotas: suma((d) => d.enNotas.length),
      reuniones: suma((d) => d.reuniones.length),
      dailies: suma((d) => (d.daily ? 1 : 0)),
    },
  };
}
