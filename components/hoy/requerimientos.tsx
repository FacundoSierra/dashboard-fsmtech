import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ZONA_TOQUE } from '@/components/estilos';
import { Tarjeta, Vacio } from '@/components/ui';
import { destinoEnlace, requerimientosPendientes, texto } from '@/lib/boveda/consultas';
import type { Boveda } from '@/lib/boveda/tipos';
import { esFechaValida } from '@/lib/fechas';
import { hrefNota } from '@/lib/rutas';
import { Avatar } from './piezas';

const VISIBLES = 5;
const FECHA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** `REQ-013 — Dominios separados…` o `REQ-001 · Publicar…` → el número y lo que pide */
function partes(titulo: string): { id?: string; que: string } {
  const partido = titulo.match(/^(REQ-\d+)\s*[—–·:-]\s*(.+)$/i);
  return partido ? { id: partido[1].toUpperCase(), que: partido[2] } : { que: titulo };
}

/**
 * Lo que piden los clientes y sigue abierto, como la lista «Project» de la referencia: cada
 * petición con el círculo de su proyecto, lo que pide y, debajo, el proyecto, su número y desde
 * cuándo. Lo que lleva más tiempo esperando, arriba. El botón en píldora apunta una nueva
 */
export function Requerimientos({ boveda }: { boveda: Boveda }) {
  const abiertos = requerimientosPendientes(boveda)
    .map((nota) => {
      const proyecto = destinoEnlace(texto(nota.propiedades.proyecto) ?? '');
      const fecha = texto(nota.propiedades.fecha);
      return {
        nota,
        proyecto: (boveda.titulos[proyecto] ?? proyecto).split(' — ')[0],
        fecha: esFechaValida(fecha) ? fecha : undefined,
        ...partes(nota.titulo),
      };
    })
    .sort((a, b) => (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999'));

  return (
    <Tarjeta
      titulo="Peticiones"
      estirar
      accion={
        <Link
          href="/crear?tipo=requerimiento"
          className={`${ZONA_TOQUE} inline-flex h-8 items-center gap-1 rounded-full border border-acento px-3 text-[13px] font-semibold text-texto transition-colors hover:bg-acento-suave`}
        >
          <Plus className="size-3.5" aria-hidden />
          Nueva
        </Link>
      }
    >
      {abiertos.length === 0 ? (
        <Vacio>Ninguna petición abierta.</Vacio>
      ) : (
        <>
          <ul className="-my-1">
            {abiertos.slice(0, VISIBLES).map((r) => (
              <li key={r.nota.ruta}>
                <Link href={hrefNota(r.nota.ruta)} className="group flex min-h-14 items-center gap-3 py-1.5">
                  <Avatar nombre={r.proyecto} tamano="pequeno" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium group-hover:text-acento">{r.que}</span>
                    <span className="block truncate text-xs text-tenue">
                      {r.proyecto}
                      {r.id && ` · ${r.id}`}
                      {r.fecha && ` · desde el ${FECHA.format(new Date(`${r.fecha}T00:00:00Z`)).replace('.', '')}`}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {abiertos.length > VISIBLES && (
            <p className="mt-auto pt-2 text-[13px] text-tenue">
              Y {abiertos.length - VISIBLES} más, cada una en la nota de su proyecto ·{' '}
              <Link href="/proyectos" className={`${ZONA_TOQUE} font-semibold text-acento hover:underline`}>
                Proyectos
              </Link>
            </p>
          )}
        </>
      )}
    </Tarjeta>
  );
}
