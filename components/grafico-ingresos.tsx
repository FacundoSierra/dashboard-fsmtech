'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

export interface PuntoGrafico {
  /** Texto del eje: `sep` */
  eje: string;
  /** `26`: se añade a la primera etiqueta visible de cada año */
  anio: string;
  /** Texto completo para la consulta: `septiembre de 2026` */
  etiqueta: string;
  valor: number;
  /** Valor ya formateado: `320 €` */
  texto: string;
}

const ALTO_GRAFICO = 180;
const ALTO_EJE_X = 26;
// Hueco para la etiqueta del último valor cuando está arriba del todo
const MARGEN_SUPERIOR = 24;
const ANCHO_EJE_Y = 52;
const MARGEN_DERECHO = 16;

/** Divisiones limpias para el eje: 0, 100, 200… */
function divisiones(maximo: number): number[] {
  if (maximo <= 0) return [0];
  const bruto = maximo / 4;
  const magnitud = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * magnitud).find((p) => p >= bruto) ?? bruto;
  const lista: number[] = [];
  for (let v = 0; v <= maximo + paso * 0.001; v += paso) lista.push(Math.round(v));
  if (lista[lista.length - 1] < maximo) lista.push(Math.round(lista[lista.length - 1] + paso));
  return lista;
}

const formatoEje = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

/**
 * Evolución de los ingresos mensuales. Una sola serie: no lleva leyenda, el título de la
 * tarjeta dice qué es. Línea de 2 px, relleno al 10 % y el último valor rotulado; el resto
 * se consulta con el puntero o con las flechas, y está también en la tabla de debajo.
 */
export function GraficoIngresos({ puntos, titulo }: { puntos: PuntoGrafico[]; titulo: string }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(640);
  const [activo, setActivo] = useState<number | null>(null);

  useEffect(() => {
    const elemento = contenedor.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([entrada]) => setAncho(Math.max(280, Math.round(entrada.contentRect.width))));
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  if (puntos.length === 0) return null;

  const ticks = divisiones(Math.max(...puntos.map((p) => p.valor)));
  const maximo = ticks[ticks.length - 1] || 1;
  const anchoPlot = ancho - ANCHO_EJE_Y - MARGEN_DERECHO;
  const x = (i: number) => ANCHO_EJE_Y + (puntos.length === 1 ? anchoPlot / 2 : (i / (puntos.length - 1)) * anchoPlot);
  const y = (v: number) => MARGEN_SUPERIOR + ALTO_GRAFICO - (v / maximo) * ALTO_GRAFICO;
  const base = y(0);

  const linea = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ');
  const area = `${linea} L${x(puntos.length - 1).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z`;

  // Etiquetas del eje X sin que se pisen: como mucho una cada ~56 px
  const cada = Math.max(1, Math.ceil(puntos.length / Math.max(1, Math.floor(anchoPlot / 56))));
  const ultimo = puntos.length - 1;

  function alMover(evento: PointerEvent<SVGSVGElement>) {
    const caja = evento.currentTarget.getBoundingClientRect();
    const px = ((evento.clientX - caja.left) / caja.width) * ancho;
    const i = puntos.length === 1 ? 0 : Math.round(((px - ANCHO_EJE_Y) / anchoPlot) * (puntos.length - 1));
    setActivo(Math.min(ultimo, Math.max(0, i)));
  }

  function alTeclear(evento: KeyboardEvent<SVGSVGElement>) {
    if (evento.key === 'ArrowLeft') setActivo((a) => Math.max(0, (a ?? ultimo) - 1));
    else if (evento.key === 'ArrowRight') setActivo((a) => Math.min(ultimo, (a ?? ultimo) + 1));
    else if (evento.key === 'Escape') setActivo(null);
    else return;
    evento.preventDefault();
  }

  const seleccionado = activo !== null ? puntos[activo] : null;
  const altoTotal = MARGEN_SUPERIOR + ALTO_GRAFICO + ALTO_EJE_X;

  return (
    // min-w-0 y el SVG al 100 %: el gráfico se adapta al hueco y nunca lo ensancha. Si impusiera
    // su ancho, la columna crecería para que cupiera y el medidor ya no volvería a encoger
    <div ref={contenedor} className="relative w-full min-w-0">
      <svg
        viewBox={`0 0 ${ancho} ${altoTotal}`}
        style={{ width: '100%', height: 'auto' }}
        role="img"
        aria-label={`${titulo}. Último valor: ${puntos[ultimo].texto} en ${puntos[ultimo].etiqueta}. Usa las flechas para recorrer los meses.`}
        tabIndex={0}
        onPointerMove={alMover}
        onPointerLeave={() => setActivo(null)}
        onKeyDown={alTeclear}
        onBlur={() => setActivo(null)}
        className="block touch-pan-y outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-acento/40"
      >
        {/* Rejilla y eje Y: líneas finas, continuas y discretas */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={ANCHO_EJE_Y} x2={ancho - MARGEN_DERECHO} y1={y(tick)} y2={y(tick)} stroke="var(--rejilla)" strokeWidth={1} />
            <text x={ANCHO_EJE_Y - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="cifras fill-apagado text-[11px]">
              {formatoEje.format(tick)} €
            </text>
          </g>
        ))}
        <line x1={ANCHO_EJE_Y} x2={ancho - MARGEN_DERECHO} y1={base} y2={base} stroke="var(--eje)" strokeWidth={1} />

        {/* Eje X: el año va en la primera etiqueta visible de cada año, para no confundir dos «jun» */}
        {puntos
          .map((p, i) => ({ p, i }))
          .filter(({ i }) => i % cada === 0 || i === ultimo)
          .map(({ p, i }, k, visibles) => (
            <text key={p.etiqueta} x={x(i)} y={base + 18} textAnchor="middle" className="fill-apagado text-[11px]">
              {k === 0 || visibles[k - 1].p.anio !== p.anio ? `${p.eje} ${p.anio}` : p.eje}
            </text>
          ))}

        <path d={area} fill="var(--serie-suave)" />
        <path d={linea} fill="none" stroke="var(--serie)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* Cruz de consulta */}
        {activo !== null && (
          <line x1={x(activo)} x2={x(activo)} y1={MARGEN_SUPERIOR} y2={base} stroke="var(--eje)" strokeWidth={1} />
        )}

        {/* Punto final, con anillo del color de la superficie para que se lea sobre la línea */}
        <circle
          cx={x(activo ?? ultimo)}
          cy={y(puntos[activo ?? ultimo].valor)}
          r={4.5}
          fill="var(--serie)"
          stroke="var(--superficie)"
          strokeWidth={2}
        />
        {activo === null && (
          <text
            x={x(ultimo) - 8}
            // Encima del punto; si no cabe, debajo, para que nunca se corte
            y={y(puntos[ultimo].valor) - 12 < 12 ? y(puntos[ultimo].valor) + 20 : y(puntos[ultimo].valor) - 12}
            textAnchor="end"
            className="fill-texto text-[12px] font-semibold"
          >
            {puntos[ultimo].texto}
          </text>
        )}
      </svg>

      {seleccionado && activo !== null && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 rounded-lg border border-borde bg-superficie px-2.5 py-1.5 text-xs shadow-tarjeta"
          style={{
            left: Math.min(Math.max(x(activo) - 60, 0), ancho - 130),
          }}
        >
          <div className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-3 rounded-full bg-serie" />
            <span className="text-sm font-semibold">{seleccionado.texto}</span>
          </div>
          <div className="text-tenue first-letter:uppercase">{seleccionado.etiqueta}</div>
        </div>
      )}
    </div>
  );
}
