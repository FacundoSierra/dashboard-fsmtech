import Link from 'next/link';
import Bloque from '@/components/consultoria/Bloque';
import type { DatosCompania } from '@/lib/consultoria/reglas';
import type { FichaCliente } from '@/lib/consultoria/tipos';
import { euros, fechaCorta } from '@/lib/consultoria/formato';
import DatosClienteConsultoria from './DatosClienteConsultoria';
import { BOTON_PRINCIPAL, ENLACE_VOLVER } from './estilos';
import { aportacionDe, cuantas, nombreDeCompania, productoConApex } from './formato';
import TarjetaHerramienta from './TarjetaHerramienta';

/**
 * La ficha de un cliente de la consultoría: sus datos (editables), lo que ha generado, sus
 * herramientas con su estado y cuándo quedan libres de extorno (cada una con sus APEX dentro), sus
 * extornos y «Nueva firma».
 */
export default function FichaClienteConsultoria({ ficha, companias, hoy }: { ficha: FichaCliente; companias: DatosCompania[]; hoy: string }) {
  const { cliente, herramientas } = ficha;
  // Las APEX van dentro de su herramienta: un extorno de una APEX también tiene que salir aquí
  const conExtorno = herramientas.flatMap((h) => [h, ...h.aportaciones]).filter((h) => h.extorno);
  const sinDato = cliente.herramientas > 0 && cliente.aportacionMensual === 0 && cliente.aportacionUnica === 0;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/consultoria/clientes" className={`${ENLACE_VOLVER} self-start px-1`}>
        Todos los clientes
      </Link>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:items-start">
        <section className="min-w-0 rounded-xl border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5">
          <h2 className="text-xl leading-tight font-semibold tracking-tight break-words text-texto">{cliente.nombre}</h2>
          <DatosClienteConsultoria cliente={cliente} sePuedeBorrar={herramientas.length === 0} />
        </section>

        <Bloque titulo="Lo que ha generado" periodo="Comisión bruta, menos sus extornos">
          <p className="cifras mt-4 text-3xl leading-none font-semibold text-texto">{euros(cliente.generadoBruto)}</p>
          <dl className="mt-4 flex flex-col gap-1.5 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-tenue">Herramientas</dt>
              <dd className="font-medium text-texto">
                {cliente.herramientas}
                {cliente.previstas > 0 && ` (${cuantas(cliente.previstas, 'prevista', 'previstas')})`}
              </dd>
            </div>
            {sinDato ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-tenue">Aportación</dt>
                <dd className="text-apagado">sin dato</dd>
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-tenue">Aportación mensual</dt>
                  <dd className="cifras font-medium text-texto">{euros(cliente.aportacionMensual)}/mes</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-tenue">Aportaciones únicas</dt>
                  <dd className="cifras font-medium text-texto">{euros(cliente.aportacionUnica)}</dd>
                </div>
              </>
            )}
          </dl>
          <Link
            href={`/consultoria/produccion/nueva?cliente=${cliente.id}`}
            className={`${BOTON_PRINCIPAL} mt-5 flex items-center justify-center`}
          >
            Nueva firma para este cliente
          </Link>
        </Bloque>
      </div>

      <Bloque titulo="Sus herramientas" periodo={herramientas.length ? 'De la más nueva a la más antigua' : undefined}>
        {herramientas.length > 0 ? (
          <ul className="mt-4 grid grid-cols-1 gap-2 xl:grid-cols-2">
            {herramientas.map((h) => (
              <li key={h.id} className="min-w-0">
                <TarjetaHerramienta herramienta={h} compania={nombreDeCompania(h.compania, companias)} hoy={hoy} aportaciones={h.aportaciones} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-tenue">Aún no tiene ninguna herramienta.</p>
        )}
      </Bloque>

      {conExtorno.length > 0 && (
        <Bloque titulo="Extornos" periodo="Lo devuelto por herramientas anuladas ya cobradas">
          <ul className="mt-4 flex flex-col gap-2">
            {conExtorno.map((h) => {
              const e = h.extorno;
              if (!e) return null;
              return (
                <li key={e.id} className="rounded-lg bg-fondo/70 px-4 py-3.5 text-sm">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="min-w-0 font-medium text-texto">
                      {productoConApex(h)} · {aportacionDe(h)}
                    </span>
                    <span className="cifras font-semibold text-critico-texto">−{euros(e.importe)}</span>
                  </p>
                  <p className="mt-1 text-sm text-tenue">
                    El {fechaCorta(e.fecha)}: la hucha cubre {euros(e.deHucha)}
                    {e.resto > 0 &&
                      ` y ${euros(e.resto)} son un cargo en la cuenta de comisiones${e.aplicado ? ', ya aplicado' : e.restoCobro ? ` (previsto para ${fechaCorta(e.restoCobro)})` : ''}`}
                    .
                  </p>
                </li>
              );
            })}
          </ul>
        </Bloque>
      )}
    </div>
  );
}
