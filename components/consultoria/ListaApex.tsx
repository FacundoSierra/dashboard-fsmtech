import Link from 'next/link';
import type { Herramienta } from '@/lib/consultoria/tipos';
import { euros, fechaCorta, mesCorto } from '@/lib/consultoria/formato';
import EstadoHerramienta from './EstadoHerramienta';
import { unidades } from './formato';

/**
 * Las aportaciones extraordinarias (APEX) de una herramienta, una fila por cada una que lleva a su
 * página: «+ APEX 5.000,00 € · 15,00 u», sus meses y su estado. `dentroDeUnaTarjeta`, sin fondo
 * propio (van sobre el de la tarjeta de su herramienta); si no, como las líneas de un mes.
 */
export default function ListaApex({
  aportaciones,
  producto,
  dentroDeUnaTarjeta = false,
  className = '',
}: {
  aportaciones: Herramienta[];
  /** El de la herramienta de la que cuelgan, para quien usa un lector de pantalla */
  producto: string;
  dentroDeUnaTarjeta?: boolean;
  className?: string;
}) {
  return (
    <ul aria-label={`Aportaciones extraordinarias de ${producto}`} className={`flex flex-col gap-1.5 ${className}`}>
      {aportaciones.map((a) => {
        const anulada = a.estado === 'anulada';
        const fondo = dentroDeUnaTarjeta
          ? 'hover:bg-superficie/80'
          : a.estado === 'prevista'
            ? 'bg-aviso/10 hover:bg-aviso/20'
            : 'bg-fondo/60 hover:bg-fondo';
        return (
          <li key={a.id}>
            <Link
              href={`/consultoria/produccion/${a.id}`}
              className={`flex min-h-11 items-start justify-between gap-3 rounded-lg px-3 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-acento ${fondo}`}
            >
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${anulada ? 'text-apagado line-through' : 'text-texto'}`}>
                  + APEX{a.aportacion !== null && ` ${euros(a.aportacion)}`} · <span className="cifras">{unidades(a.unidades)}</span>
                </span>
                <span className="block text-sm text-apagado">
                  Producción {mesCorto(a.mesProduccion)} · cobro {mesCorto(a.fechaCobro)}
                  {a.fechasProvisionales && ' (sin confirmar)'}
                </span>
                {a.extorno && (
                  <span className="block text-sm text-critico-texto">
                    Extorno de {euros(a.extorno.importe)} el {fechaCorta(a.extorno.fecha)}
                  </span>
                )}
              </span>
              <EstadoHerramienta estado={a.estado} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
