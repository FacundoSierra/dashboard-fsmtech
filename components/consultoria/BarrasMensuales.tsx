'use client';

import { memo, useMemo, useState } from 'react';
import { euros, mesCorto } from '@/lib/consultoria/formato';

const EUROS_CORTO = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' });

/** Para el eje, donde los céntimos solo estorban: el `eurosCorto` de FSM-Finance */
const eurosCorto = (importe: number) => EUROS_CORTO.format(importe);

export interface BarraMes {
  mes: string;
  valor: number;
  /**
   * Lo que se espera y aún no ha llegado (la consultoría: lo pagado y lo previsto). Se pinta
   * encima de `valor`, en el mismo color más claro, y la escala cuenta la suma. Sin él, la
   * barra es la de siempre.
   */
  previsto?: number;
  /** Segunda línea del globo, cuando hace falta contar algo más. */
  detalle?: string;
}

/** Alto y márgenes del dibujo. El ancho se estira con la tarjeta. */
const ANCHO = 640;
const ALTO = 260;
const MARGEN = { arriba: 16, derecha: 8, abajo: 34, izquierda: 62 };
const GROSOR_MAXIMO = 56; // como en la maqueta: anchas, pero sin llenar la banda
const REDONDEO = 6; // solo la punta; la base va cuadrada sobre la línea
const OPACIDAD_PREVISTO = 0.35; // lo previsto, el mismo color más claro

/** Una columna con la punta redondeada y la base cuadrada, de `abajo` a `arriba` */
function columna(x: number, arriba: number, abajo: number, grosor: number, redondeo: number) {
  const r = Math.min(redondeo, abajo - arriba);
  return `M${x},${abajo} L${x},${arriba + r} Q${x},${arriba} ${x + r},${arriba} L${x + grosor - r},${arriba} Q${x + grosor},${arriba} ${x + grosor},${arriba + r} L${x + grosor},${abajo} Z`;
}

/**
 * Barras por mes, copiadas de FSM-Finance con los colores de datos del panel (`--serie`, la
 * rejilla y el eje de `globals.css`), que tienen su modo oscuro.
 *
 * Una sola serie, así que un solo color: el título dice qué es. Al pasar por encima (o al llegar
 * con el teclado) sale el valor exacto. Los cálculos van en un useMemo para que mover el ratón no
 * recalcule la geometría de todas las barras.
 *
 * Con `previsto` en algún punto (el Resumen), cada barra apila lo previsto encima de lo pagado y
 * el globo dice las dos cosas; la leyenda la pone quien la usa.
 */
function BarrasMensuales({
  serie,
  etiqueta,
  color,
}: {
  serie: BarraMes[];
  /** Lo que se lee en el globo antes del importe: «Gastos», «Saldo»… */
  etiqueta: string;
  /** Por defecto, el de las series del panel */
  color?: string;
}) {
  const [activo, setActivo] = useState<number | null>(null);

  const dibujo = useMemo(() => {
    const valores = serie.map((punto) => punto.valor + (punto.previsto ?? 0));
    const maximo = Math.max(...valores, 1);
    const escala = redondearArriba(maximo);
    const areaAncho = ANCHO - MARGEN.izquierda - MARGEN.derecha;
    const areaAlto = ALTO - MARGEN.arriba - MARGEN.abajo;
    const banda = areaAncho / Math.max(serie.length, 1);
    const grosor = Math.min(GROSOR_MAXIMO, banda * 0.5);
    const base = MARGEN.arriba + areaAlto;

    return {
      escala,
      areaAlto,
      banda,
      grosor,
      base,
      lineas: [0, 0.25, 0.5, 0.75, 1].map((parte) => ({
        valor: escala * parte,
        y: base - areaAlto * parte,
      })),
      barras: serie.map((punto, i) => {
        const alto = (punto.valor / escala) * areaAlto;
        const altoPrevisto = ((punto.previsto ?? 0) / escala) * areaAlto;
        return {
          x: MARGEN.izquierda + banda * i + (banda - grosor) / 2,
          y: base - alto - altoPrevisto,
          /** Donde acaba lo pagado y empieza lo previsto */
          yValor: base - alto,
          alto,
          altoPrevisto,
          centro: MARGEN.izquierda + banda * i + banda / 2,
          inicioBanda: MARGEN.izquierda + banda * i,
        };
      }),
    };
  }, [serie]);

  if (serie.length === 0) return null;

  return (
    <div className="relative mt-4">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="h-auto w-full"
        role="img"
        aria-describedby={undefined}
        aria-label={`${etiqueta} por mes, de ${mesCorto(serie[0].mes)} a ${mesCorto(serie[serie.length - 1].mes)}`}
      >
        {/* Rejilla: fina, sólida y discreta */}
        {dibujo.lineas.map((linea) => (
          <g key={linea.valor}>
            <line
              x1={MARGEN.izquierda}
              x2={ANCHO - MARGEN.derecha}
              y1={linea.y}
              y2={linea.y}
              stroke="var(--rejilla)"
              strokeWidth={1}
            />
            <text
              x={MARGEN.izquierda - 10}
              y={linea.y + 4}
              textAnchor="end"
              className="fill-[var(--apagado)] text-[11px]"
            >
              {eurosCorto(linea.valor)}
            </text>
          </g>
        ))}

        {serie.map((punto, i) => {
          const barra = dibujo.barras[i];
          const opacidad = activo === null || activo === i ? 1 : 0.45;

          return (
            <g
              key={punto.mes}
              onMouseEnter={() => setActivo(i)}
              onMouseLeave={() => setActivo(null)}
              onFocus={() => setActivo(i)}
              onBlur={() => setActivo(null)}
              tabIndex={0}
              className="group outline-none"
            >
              {/* Zona de acierto: más ancha que la barra, para que sea fácil apuntar. Con el
                  teclado lleva el anillo de foco: el globo no siempre cabe, y sin él no se sabía
                  en qué mes estaba */}
              <rect
                x={barra.inicioBanda + 1}
                y={MARGEN.arriba}
                width={Math.max(0, dibujo.banda - 2)}
                height={dibujo.areaAlto}
                rx={6}
                fill="transparent"
                strokeWidth={2}
                className="stroke-transparent group-focus-visible:stroke-acento"
              />
              {/* Con algo previsto encima, lo pagado va recto: la punta redondeada es la de lo previsto */}
              <path
                d={columna(barra.x, barra.yValor, dibujo.base, dibujo.grosor, barra.altoPrevisto > 0 ? 0 : REDONDEO)}
                fill={color ?? 'var(--serie)'}
                opacity={opacidad}
              />
              {barra.altoPrevisto > 0 && (
                <path
                  d={columna(barra.x, barra.y, barra.yValor, dibujo.grosor, REDONDEO)}
                  fill={color ?? 'var(--serie)'}
                  opacity={opacidad * OPACIDAD_PREVISTO}
                />
              )}
              <text
                x={barra.centro}
                y={ALTO - 12}
                textAnchor="middle"
                className="fill-[var(--tenue)] text-[12px] font-medium"
              >
                {mesCorto(punto.mes)}
              </text>
            </g>
          );
        })}

        {/* Línea de base, un punto más marcada que la rejilla */}
        <line
          x1={MARGEN.izquierda}
          x2={ANCHO - MARGEN.derecha}
          y1={dibujo.base}
          y2={dibujo.base}
          stroke="var(--eje)"
          strokeWidth={1}
        />
      </svg>

      {activo !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-texto px-3 py-2 text-center text-xs text-fondo shadow-lg"
          style={{
            left: `${(dibujo.barras[activo].centro / ANCHO) * 100}%`,
            top: `${((dibujo.barras[activo].y - 8) / ALTO) * 100}%`,
          }}
        >
          <p className="font-semibold">{mesCorto(serie[activo].mes)}</p>
          {(serie[activo].previsto === undefined || serie[activo].valor !== 0) && (
            <p className="cifras mt-0.5">
              {etiqueta} {euros(serie[activo].valor)}
            </p>
          )}
          {serie[activo].previsto !== undefined && (
            <p className="cifras mt-0.5">Previsto {euros(serie[activo].previsto ?? 0)}</p>
          )}
          {serie[activo].detalle && <p className="cifras text-fondo/70">{serie[activo].detalle}</p>}
        </div>
      )}
    </div>
  );
}

/** Techo redondo para el eje: 2.874 → 3.000, 12.100 → 13.000. */
function redondearArriba(valor: number) {
  const magnitud = 10 ** Math.floor(Math.log10(valor));
  return Math.ceil(valor / (magnitud / 2)) * (magnitud / 2);
}

export default memo(BarrasMensuales);
