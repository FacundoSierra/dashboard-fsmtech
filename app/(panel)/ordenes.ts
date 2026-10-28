'use server';

import { euros } from '@/components/ui';
import { obtenerBoveda } from '@/lib/boveda/consultas';
import type { Boveda, Nota } from '@/lib/boveda/tipos';
import { economia, nombreMes } from '@/lib/economia';
import { hoyMadrid } from '@/lib/fechas';
import { portales } from '@/lib/portales';

/** Lo que busca la barra de órdenes (`Ctrl+K`): se pide al abrirla, así nunca está desfasado */
export interface DatosBarra {
  /** `detalle`: de qué cliente o proyecto es la nota, o su carpeta si no es de ninguno */
  notas: { titulo: string; ruta: string; detalle: string }[];
  /** Cobros de este mes y atrasados: los que se pueden marcar como cobrados */
  cobros: { ruta: string; linea: string; texto: string; busqueda: string }[];
  /** Los paneles propios de `dashboards/portales.md`, para abrirlos por su nombre */
  portales: { nombre: string; url: string; dominio: string }[];
}

/**
 * `clientes/cni/reuniones/…` → «Centro de Negocios Inmobiliarios (CNI)»; `proyectos/cni-web-crm/…`
 * → «CNI», como en el resto del panel. Lo demás, con su carpeta
 */
function detalleDe(boveda: Boveda, nota: Nota): string {
  const [carpeta, grupo] = nota.ruta.split('/');
  if ((carpeta === 'clientes' || carpeta === 'proyectos') && grupo && nota.ruta !== `${carpeta}/${grupo}/${grupo}.md`) {
    const ficha = boveda.porRuta.get(`${carpeta}/${grupo}/${grupo}.md`);
    if (ficha) return ficha.titulo.split(' — ')[0];
  }
  return nota.carpeta || 'nota';
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
          texto: `${cliente.nota.titulo} · ${nombreMes(c.mes)} · ${c.concepto} · ${euros(c.importe, true)}`,
          busqueda: [cliente.nota.titulo, cliente.nota.nombre, nombreMes(c.mes), nombreMes(c.mes, true), c.mes, c.concepto].join(' '),
        })),
    ),
  );

  return {
    notas: boveda.notas.map((n) => ({ titulo: n.titulo, ruta: n.ruta, detalle: detalleDe(boveda, n) })),
    cobros,
    portales: portales(boveda).map(({ nombre, url, dominio }) => ({ nombre, url, dominio })),
  };
}
