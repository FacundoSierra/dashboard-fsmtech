import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { CalendarClock, PieChart, TrendingUp, Users } from 'lucide-react';
import { GraficoIngresos } from '@/components/grafico-ingresos';
import { BarrasHorizontales } from '@/components/graficos';
import {
  Encabezado,
  Estado,
  FILA,
  Kpi,
  Pendiente,
  TABLA,
  TD,
  TH,
  Tarjeta,
  Vacio,
  euros,
  porcentaje,
  type NivelEstado,
} from '@/components/ui';
import { obtenerBoveda } from '@/lib/boveda/consultas';
import { economia, nombreMes, type Renovacion } from '@/lib/economia';
import { cuandoEs, diasEntre, fechaCorta, hoyMadrid } from '@/lib/fechas';
import { hrefNota } from '@/lib/rutas';
import { estadoGeneral } from '@/lib/vigilancia/estado';

export const metadata: Metadata = { title: 'Economía' };

export default async function PaginaEconomia() {
  const boveda = await obtenerBoveda();
  const hoy = hoyMadrid();
  const datos = economia(boveda, hoy);
  const conCuotas = datos.clientes.filter((c) => c.cuotas.length > 0);

  return (
    <>
      <Encabezado
        titulo="Economía"
        subtitulo="Cuotas netas de mantenimiento: lo que queda después de lo que cada cliente paga por su cuenta"
      />

      {conCuotas.length === 0 ? (
        <Tarjeta>
          <Pendiente titulo="Todavía no hay cuotas en las fichas de cliente">
            <p>
              Añade a la ficha de cada cliente las propiedades <code>cuota_mensual</code> (euros netos al mes) y{' '}
              <code>cuota_desde</code> (fecha en que empezó a pagar). El formato completo, con cambios de cuota y
              renovaciones, está en <code>docs/economia.md</code>.
            </p>
          </Pendiente>
        </Tarjeta>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              etiqueta="Ingresos al mes"
              valor={euros(datos.mensual)}
              icono={TrendingUp}
              detalle={
                datos.variacion === 0
                  ? 'Igual que el mes pasado'
                  : `${datos.variacion > 0 ? '+' : '−'}${euros(Math.abs(datos.variacion))} respecto al mes pasado`
              }
            />
            <Kpi etiqueta="Al año, a este ritmo" valor={euros(datos.anual)} detalle="Cuotas vigentes × 12" />
            <Kpi
              etiqueta={`Facturado en ${hoy.slice(0, 4)}`}
              valor={euros(datos.esteAnio)}
              detalle="Según las cuotas, no según los cobros"
            />
            <Kpi
              etiqueta="Clientes que pagan"
              valor={datos.pagan}
              icono={Users}
              detalle={
                datos.principal
                  ? `${datos.principal.cliente.nota.titulo}: ${porcentaje(datos.principal.porcentaje)} del total`
                  : undefined
              }
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-5">
            <Tarjeta titulo="Ingresos mensuales" icono={TrendingUp} className="xl:col-span-3">
              {datos.serie.length < 2 ? (
                <Vacio>La evolución se dibuja a partir del segundo mes con cuotas.</Vacio>
              ) : (
                <>
                  <GraficoIngresos
                    titulo="Ingresos mensuales"
                    puntos={datos.serie.map((p) => ({
                      eje: nombreMes(p.mes).split(' ')[0],
                      anio: p.mes.slice(2, 4),
                      etiqueta: nombreMes(p.mes, true),
                      valor: p.importe,
                      texto: euros(p.importe),
                    }))}
                  />
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-tenue">Ver como tabla</summary>
                    <table className={`${TABLA} mt-2`}>
                      <thead>
                        <tr>
                          <th className={TH}>Mes</th>
                          <th className={`${TH} text-right`}>Ingresos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...datos.serie].reverse().map((p) => (
                          <tr key={p.mes} className={FILA}>
                            <td className={`${TD} first-letter:uppercase`}>{nombreMes(p.mes, true)}</td>
                            <td className={`${TD} cifras text-right`}>{euros(p.importe)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </>
              )}
            </Tarjeta>

            <Tarjeta titulo="Reparto por cliente" icono={PieChart} className="xl:col-span-2">
              <BarrasHorizontales
                titulo="Cuota mensual por cliente"
                barras={datos.clientes
                  .filter((c) => c.actual > 0)
                  .map((c) => ({
                    clave: c.nota.nombre,
                    etiqueta: c.nota.titulo,
                    valor: c.actual,
                    texto: euros(c.actual),
                    detalle: porcentaje((c.actual / datos.mensual) * 100),
                  }))}
              />
              {datos.principal && datos.principal.porcentaje >= 50 && (
                <p className="mt-4 text-xs text-tenue">
                  Más de la mitad de los ingresos depende de un solo cliente.
                </p>
              )}
            </Tarjeta>
          </div>

          <Tarjeta titulo="Clientes" icono={Users} sinRelleno>
            <div className="overflow-x-auto">
              <table className={TABLA}>
                <thead>
                  <tr>
                    <th className={TH}>Cliente</th>
                    <th className={`${TH} text-right`}>Cuota</th>
                    <th className={TH}>Desde</th>
                    <th className={`${TH} text-right`}>Acumulado</th>
                    <th className={`${TH} text-right`}>Peso</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.clientes.map((c) => (
                    <tr key={c.nota.ruta} className={FILA}>
                      <td className={TD}>
                        <Link href={hrefNota(c.nota.ruta)} className="font-medium hover:text-acento">
                          {c.nota.titulo}
                        </Link>
                      </td>
                      <td className={`${TD} cifras text-right`}>
                        {c.cuotas.length ? euros(c.actual) : <span className="text-apagado">sin cuota</span>}
                      </td>
                      <td className={`${TD} text-tenue`}>{c.desde ? nombreMes(c.desde.slice(0, 7)) : '—'}</td>
                      <td className={`${TD} cifras text-right text-tenue`}>{c.acumulado ? euros(c.acumulado) : '—'}</td>
                      <td className={`${TD} cifras text-right text-tenue`}>
                        {c.actual && datos.mensual ? porcentaje((c.actual / datos.mensual) * 100) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-borde px-4 py-2.5 text-xs text-apagado">
              El acumulado suma las cuotas desde el primer mes. Es lo facturado, no lo cobrado.
            </p>
          </Tarjeta>
        </div>
      )}

      <div className="mt-6">
        <Suspense
          fallback={<div className="h-48 animate-pulse rounded-xl border border-borde bg-superficie" aria-label="Cargando renovaciones" />}
        >
          <Renovaciones manuales={datos.renovaciones} hoy={hoy} />
        </Suspense>
      </div>
    </>
  );
}

/**
 * Renovaciones: las apuntadas en las fichas y las que se averiguan solas (dominios
 * `.com`/`.net` por RDAP y certificados SSL). Va aparte porque consulta la red.
 */
async function Renovaciones({ manuales, hoy }: { manuales: Renovacion[]; hoy: string }) {
  const estado = await estadoGeneral(await obtenerBoveda());

  const automaticas: Renovacion[] = estado.proyectos.flatMap(({ proyecto, dominio }) =>
    dominio?.caduca
      ? [
          {
            fecha: dominio.caduca.slice(0, 10),
            concepto: `Dominio ${dominio.nombre}`,
            origen: proyecto.nota.nombre,
            automatica: true,
          },
        ]
      : [],
  );
  const sinFecha = estado.proyectos.filter((p) => p.dominio && !p.dominio.caduca).map((p) => p.dominio!.nombre);

  // Un mismo dominio puede salir de dos proyectos
  const vistas = new Set<string>();
  const todas = [...manuales, ...automaticas]
    .filter((r) => {
      const clave = `${r.fecha}|${r.concepto}`;
      if (vistas.has(clave)) return false;
      vistas.add(clave);
      return true;
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  return (
    <Tarjeta titulo="Renovaciones" icono={CalendarClock} sinRelleno>
      <div id="renovaciones" className="scroll-mt-20" />
      {todas.length === 0 ? (
        <div className="p-4">
          <Vacio>No hay renovaciones apuntadas.</Vacio>
        </div>
      ) : (
        <ul className="divide-y divide-borde">
          {todas.map((r) => {
            const dias = diasEntre(hoy, r.fecha);
            const nivel: NivelEstado = dias < 0 ? 'critico' : dias < 30 ? 'grave' : dias < 60 ? 'aviso' : 'bien';
            return (
              <li key={`${r.fecha}-${r.concepto}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.concepto}</p>
                  <p className="text-xs text-tenue">
                    {fechaCorta(r.fecha)} {r.fecha.slice(0, 4)} · {r.automatica ? 'consultado en el registro' : 'apuntado en la ficha'}
                  </p>
                </div>
                <Estado nivel={nivel}>{cuandoEs(r.fecha, hoy)}</Estado>
              </li>
            );
          })}
        </ul>
      )}
      {sinFecha.length > 0 && (
        <p className="border-t border-borde px-4 py-2.5 text-xs text-tenue">
          {sinFecha.join(', ')}: su registro no publica la caducidad. Apúntala en la sección «Renovaciones» de la ficha
          del cliente, con el formato <code>- 2027-03-14 — Dominio {sinFecha[0]}</code>.
        </p>
      )}
    </Tarjeta>
  );
}
