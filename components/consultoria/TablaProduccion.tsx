import Link from 'next/link';
import { esApex, type DatosCompania } from '@/lib/consultoria/reglas';
import type { Produccion } from '@/lib/consultoria/tipos';
import { euros, fechaCorta, mesCorto } from '@/lib/consultoria/formato';
import EstadoHerramienta from './EstadoHerramienta';
import { aportacionDe, cobraPocoAPoco, cuantas, dosDecimales, nombreDeCompania, pct, unidades } from './formato';
import InsigniaApex from './InsigniaApex';
import TarjetaHerramienta from './TarjetaHerramienta';

/**
 * Las herramientas: los totales arriba y, en pantalla ancha, la tabla entera; por debajo de `2xl`
 * (en el panel, la barra lateral se come 240 px y a `xl` no caben las doce columnas), una tarjeta
 * por herramienta: en el móvil no hay tabla con desplazamiento. Cada una lleva a su página. Las
 * previstas, con fondo ámbar; las anuladas, tachadas y fuera de los totales. Una
 * APEX sigue en su fila, con la insignia «APEX de TopPlan», y en los totales va aparte de las
 * herramientas («2 y 1 APEX»); sus unidades sí suman.
 */
export default function TablaProduccion({ produccion, companias }: { produccion: Produccion; companias: DatosCompania[] }) {
  const { filas, totales } = produccion;

  return (
    <>
      <dl className="mt-5 grid grid-cols-2 gap-3 rounded-lg bg-superficie-2 p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-apagado">Herramientas</dt>
          <dd className="cifras mt-0.5 text-lg font-semibold text-texto">
            {totales.herramientas}
            {totales.apex > 0 && <span className="text-sm font-medium text-tenue"> y {totales.apex} APEX</span>}
          </dd>
        </div>
        <div>
          <dt className="text-apagado">Unidades</dt>
          <dd className="cifras mt-0.5 text-lg font-semibold text-texto">{unidades(totales.unidades)}</dd>
        </div>
        <div>
          <dt className="text-apagado">Comisión</dt>
          <dd className="cifras mt-0.5 text-lg font-semibold text-texto">{euros(totales.comision)}</dd>
        </div>
        <div>
          <dt className="text-apagado">RC (a la hucha)</dt>
          <dd className="cifras mt-0.5 text-lg font-semibold text-texto">{euros(totales.rc)}</dd>
        </div>
      </dl>
      {totales.anuladas > 0 && (
        <p className="mt-2 px-1 text-sm text-apagado">
          {cuantas(totales.anuladas, 'anulada, que no cuenta', 'anuladas, que no cuentan')} en los totales.
        </p>
      )}

      {filas.length === 0 ? (
        <p className="mt-5 text-sm text-tenue">No hay ninguna herramienta con estos filtros.</p>
      ) : (
        <>
          <ul className="mt-5 grid grid-cols-1 gap-2 md:grid-cols-2 2xl:hidden">
            {filas.map((h) => (
              <li key={h.id} className="min-w-0">
                <TarjetaHerramienta herramienta={h} compania={nombreDeCompania(h.compania, companias)} conCliente />
              </li>
            ))}
          </ul>

          <div className="mt-5 hidden 2xl:block">
            <table className="w-full table-fixed text-left text-sm">
              <caption className="sr-only">Herramientas de producción</caption>
              <thead className="text-[13px] text-apagado">
                <tr className="border-b border-borde">
                  <th scope="col" className="w-[14%] py-2 pr-3 font-medium">Cliente</th>
                  <th scope="col" className="w-[13%] py-2 pr-3 font-medium">Compañía y producto</th>
                  <th scope="col" className="w-[7%] py-2 pr-3 font-medium">Pago</th>
                  <th scope="col" className="w-[9%] py-2 pr-3 text-right font-medium">Aportación</th>
                  <th scope="col" className="w-[7%] py-2 pr-3 text-right font-medium">Unidades</th>
                  <th scope="col" className="w-[5%] py-2 pr-3 text-right font-medium">€/u</th>
                  <th scope="col" className="w-[8%] py-2 pr-3 text-right font-medium">Comisión</th>
                  <th scope="col" className="w-[7%] py-2 pr-3 text-right font-medium">RC</th>
                  <th scope="col" className="w-[6%] py-2 pr-3 font-medium">Producción</th>
                  <th scope="col" className="w-[8%] py-2 pr-3 font-medium">Efecto</th>
                  <th scope="col" className="w-[6%] py-2 pr-3 font-medium">Cobro</th>
                  <th scope="col" className="w-[10%] py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((h) => {
                  const anulada = h.estado === 'anulada';
                  const pocoAPoco = cobraPocoAPoco(h.tipoComision) && h.unidades === 0;
                  return (
                    <tr
                      key={h.id}
                      className={`border-b border-borde align-top ${h.estado === 'prevista' ? 'bg-superficie-2/60' : ''} ${anulada ? 'text-apagado' : 'text-texto'}`}
                    >
                      <td className="py-2.5 pr-3">
                        <Link
                          href={`/consultoria/produccion/${h.id}`}
                          className={`block truncate font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-acento ${anulada ? 'line-through' : ''}`}
                        >
                          {h.cliente}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="block truncate">{h.producto}</span>
                        <span className="block truncate text-[13px] text-apagado">{nombreDeCompania(h.compania, companias)}</span>
                        {esApex(h) && (
                          <span className="mt-1 flex">
                            <InsigniaApex de={h.de} />
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">{h.pago === 'transferencia' ? 'Transf.' : 'Domic.'}</td>
                      <td className="cifras py-2.5 pr-3 text-right">{aportacionDe(h)}</td>
                      <td className="cifras py-2.5 pr-3 text-right">
                        {pocoAPoco ? (
                          <span title="Para el nivel: esta comisión no se cobra de una vez">{dosDecimales(h.unidadesNivel ?? 0)}*</span>
                        ) : (
                          dosDecimales(h.unidades)
                        )}
                      </td>
                      <td className="cifras py-2.5 pr-3 text-right">{dosDecimales(h.valorUnidad)}</td>
                      <td className="cifras py-2.5 pr-3 text-right font-semibold">{euros(h.bruto)}</td>
                      <td className="cifras py-2.5 pr-3 text-right" title={`Reserva del ${pct(h.pctHucha)}`}>
                        {euros(h.hucha)}
                      </td>
                      <td className="py-2.5 pr-3">{mesCorto(h.mesProduccion)}</td>
                      <td className="cifras py-2.5 pr-3">{fechaCorta(h.fechaEfecto)}</td>
                      <td className="py-2.5 pr-3">
                        {mesCorto(h.fechaCobro)}
                        {h.fechasProvisionales && (
                          <span className="block text-[13px] text-apagado" title="Las fechas salen de una regla sin confirmar">
                            sin confirmar
                          </span>
                        )}
                      </td>
                      <td className="py-2.5">
                        <EstadoHerramienta estado={h.estado} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filas.some((h) => cobraPocoAPoco(h.tipoComision) && h.unidades === 0) && (
              <p className="mt-2 text-[13px] text-apagado">* Unidades para el nivel: esa comisión no se cobra de una vez, llega recibo a recibo.</p>
            )}
          </div>
        </>
      )}
    </>
  );
}
