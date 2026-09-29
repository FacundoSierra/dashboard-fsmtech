'use server';

import { obtenerBoveda } from '@/lib/boveda/consultas';
import { economia, nombreMes } from '@/lib/economia';
import { hoyMadrid } from '@/lib/fechas';
import { portales } from '@/lib/portales';

/** Lo que busca la barra de órdenes (`Ctrl+K`): se pide al abrirla, así nunca está desfasado */
export interface DatosBarra {
  notas: { titulo: string; ruta: string; carpeta: string }[];
  /** Cobros de este mes y atrasados: los que se pueden marcar como cobrados */
  cobros: { ruta: string; linea: string; texto: string; busqueda: string }[];
  /** Los paneles propios de `dashboards/portales.md`, para abrirlos por su nombre */
  portales: { nombre: string; url: string; dominio: string }[];
}

export async function datosBarra(): Promise<DatosBarra> {
  // `obtenerBoveda()` comprueba la sesión antes de leer nada
  const boveda = await obtenerBoveda();
  const hoy = hoyMadrid();

  const cobros = economia(boveda, hoy).clientes.flatMap((cliente) =>
    cliente.planes.flatMap((plan) =>
      plan.cobros
        .filter((c) => c.estado === 'pendiente' || c.estado === 'atrasado')
        .map((c) => ({
          ruta: plan.nota.ruta,
          linea: c.linea,
          texto: `${cliente.nota.titulo} · ${nombreMes(c.mes)} · ${c.concepto} · ${c.importe} €`,
          busqueda: [cliente.nota.titulo, cliente.nota.nombre, nombreMes(c.mes), nombreMes(c.mes, true), c.mes, c.concepto].join(' '),
        })),
    ),
  );

  return {
    notas: boveda.notas.map((n) => ({ titulo: n.titulo, ruta: n.ruta, carpeta: n.carpeta })),
    cobros,
    portales: portales(boveda).map(({ nombre, url, dominio }) => ({ nombre, url, dominio })),
  };
}
