import Link from 'next/link';
import { ExternalLink, Plus } from 'lucide-react';
import { Chip, Contador, EnlaceAccion, Tarjeta, Vacio } from '@/components/ui';
import type { Captura } from '@/lib/boveda/inbox';
import type { Portal } from '@/lib/portales';
import { hrefNota } from '@/lib/rutas';

// Lo de Hoy que se mira de vez en cuando: el inbox y tus paneles, abajo a la derecha en el
// escritorio y al final en el móvil

const CAPTURAS_VISIBLES = 3;

export function InboxDeHoy({ capturas }: { capturas: Captura[] }) {
  return (
    <Tarjeta
      titulo={
        <>
          Inbox
          <Contador>{capturas.length}</Contador>
        </>
      }
      accion={
        <EnlaceAccion href="/capturar">
          <span className="inline-flex items-center gap-1">
            <Plus className="size-3.5" aria-hidden />
            Apuntar
          </span>
        </EnlaceAccion>
      }
    >
      {capturas.length === 0 ? (
        <Vacio>Nada pendiente de procesar.</Vacio>
      ) : (
        <>
          <ul className="-my-1.5">
            {capturas.slice(0, CAPTURAS_VISIBLES).map((captura) => (
              <li key={captura.nota.ruta}>
                <Link href={hrefNota(captura.nota.ruta)} className="group flex min-h-11 items-center justify-between gap-2 text-[15px]">
                  <span className="min-w-0 truncate group-hover:text-acento">{captura.nota.titulo}</span>
                  {captura.categoria && <Chip>{captura.categoria}</Chip>}
                </Link>
              </li>
            ))}
          </ul>
          {capturas.length > CAPTURAS_VISIBLES && (
            <div className="mt-2 text-sm">
              <EnlaceAccion href="/inbox">Ver las {capturas.length}</EnlaceAccion>
            </div>
          )}
        </>
      )}
    </Tarjeta>
  );
}

/**
 * Tus paneles (FSM-Finance, el de DF…), de `dashboards/portales.md`: se abren en otra pestaña.
 * Abajo, porque se abren de vez en cuando; también están en la barra de órdenes («Abrir …»)
 */
export function Paneles({ lista }: { lista: Portal[] }) {
  if (lista.length === 0) return null;
  return (
    <Tarjeta titulo="Tus paneles" sinRelleno>
      <ul className="pb-2">
        {lista.map((portal) => (
          <li key={portal.url}>
            <a
              href={portal.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex min-h-11 items-center gap-3 px-5 py-2.5 hover:bg-superficie-2 sm:px-6"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium group-hover:text-acento">{portal.nombre}</span>
                <span className="block truncate text-[13px] text-tenue">{portal.descripcion ?? portal.dominio}</span>
              </span>
              <ExternalLink className="size-4 shrink-0 text-tenue" aria-hidden />
              <span className="sr-only">(se abre en otra pestaña)</span>
            </a>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}
