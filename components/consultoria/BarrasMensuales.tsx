'use client';

import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import { euros, mesCorto } from '@/lib/consultoria/formato';

const EUROS_CORTO = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' });

/** Para el eje, donde los céntimos solo estorban: el `eurosCorto` de FSM-Finance */
const eurosCorto = (importe: number) => EUROS_CORTO.format(importe);

export interface BarraMes {
  mes: string;
  valor: number;
  /**
   * Lo que se espera y aún no ha llegado (la consultoría: lo pagado y lo previsto). Se pinta
   * encima de `valor`, rayado como lo que falta en las barras de Hoy, y la escala cuenta la suma.
   * Sin él, la barra es la de siempre.
   */
  previsto?: number;
  /** Segunda línea del globo, cuando hace falta contar algo más. */
  detalle?: string;
}

/** Alto y márgenes del dibujo, en píxeles de verdad: el ancho es el de la tarjeta, medido */
const ALTO = 260;
const MARGEN = { arriba: 16, derecha: 8, abajo: 34, izquierda: 64 };
const GROSOR_MAXIMO = 44;
/** Una etiqueta del eje de meses cada tantos píxeles como mínimo, para que no se pisen */
const ANCHO_ETIQUETA = 64;

/**
 * Una columna con la punta en media luna, como las píldoras de Hoy, y la base recta sobre la línea.
 * `redondeo` 0, recta también arriba (lo pagado, cuando lleva lo previsto encima)
 */
function columna(x: number, arriba: number, abajo: number, grosor: number, redondeo: number) {
  const r = Math.min(redondeo, abajo - arriba, grosor / 2);
  if (r <= 0) return `M${x},${abajo} L${x},${arriba} L${x + grosor},${arriba} L${x + grosor},${abajo} Z`;
  return `M${x},${abajo} L${x},${arriba + r} A${r},${r} 0 0 1 ${x + grosor},${arriba + r} L${x + grosor},${abajo} Z`;
}

/**
 * Barras por mes, copiadas de FSM-Finance con el lenguaje de las barras de Hoy: lo pagado en el
 * azul de los datos (`--serie`) y lo previsto encima, rayado, con la punta redondeada.
 *
 * Se dibuja al ancho medido de su tarjeta (como el gráfico de Economía): con un ancho fijo
 * escalado, la letra salía de 20 px en el escritorio y de 6 en el móvil. Así va siempre a 13 px, y
 * en el móvil el eje de meses enseña uno de cada pocos para que no se pisen.
 *
 * Una sola serie, así que un solo color: el título dice qué es. Al pasar por encima (o al llegar
 * con el teclado) sale el valor exacto. Los cálculos van en un useMemo para que mover el ratón no
 * recalcule la geometría de todas las barras.
 *
 * Con `previsto` en algún punto (el Resumen), cada barra apila lo previsto encima de lo pagado y
 * el globo dice las dos cosas; la leyenda la pone quien la usa, con el mismo rayado (`rayado`).
 */
function BarrasMensuales({
  serie,
  etiqueta,
  color,
  rayado,
}: {
  serie: BarraMes[];
  /** Lo que se lee en el globo antes del importe: «Gastos», «Saldo»… */
  etiqueta: string;
  /** Por defecto, el de las series del panel */
  color?: string;
  /** El `id` de un `PatronRayado` de la página para lo previsto; sin él, uno propio */
  rayado?: string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const propio = `rayado-barras-${useId().replace(/:/g, '')}`;
  const patron = rayado ?? propio;
  // Sin medir (en el servidor y hasta la primera medida) no se dibuja: solo el hueco, del alto que tendrá
  const [ancho, setAncho] = useState<number | null>(null);
  const [activo, setActivo] = useState<number | null>(null);

  useEffect(() => {
    const elemento = contenedor.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([entrada]) => setAncho(Math.max(260, Math.round(entrada.contentRect.width))));
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  const dibujo = useMemo(() => {
    const medida = ancho ?? 640;
    const valores = serie.map((punto) => punto.valor + (punto.previsto ?? 0));
    const maximo = Math.max(...valores, 1);
    const escala = redondearArriba(maximo);
    const areaAncho = medida - MARGEN.izquierda - MARGEN.derecha;
    const areaAlto = ALTO - MARGEN.arriba - MARGEN.abajo;
    const banda = areaAncho / Math.max(serie.length, 1);
    const grosor = Math.min(GROSOR_MAXIMO, banda * 0.62);
    const base = MARGEN.arriba + areaAlto;
    const cada = Math.max(1, Math.ceil(ANCHO_ETIQUETA / banda));

    return {
      medida,
      escala,
      areaAlto,
      banda,
      grosor,
      base,
      cada,
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
  }, [serie, ancho]);

  if (serie.length === 0) return null;

  if (ancho === null) {
    return <div ref={contenedor} className="mt-4 w-full min-w-0" style={{ height: ALTO }} aria-hidden />;
  }

  const ultimo = serie.length - 1;

  return (
    <div ref={contenedor} className="relative mt-4 w-full min-w-0">
      <svg
        viewBox={`0 0 ${dibujo.medida} ${ALTO}`}
        style={{ width: '100%', height: 'auto' }}
        className="block"
        role="img"
        aria-describedby={undefined}
        aria-label={`${etiqueta} por mes, de ${mesCorto(serie[0].mes)} a ${mesCorto(serie[ultimo].mes)}`}
      >
        {!rayado && (
          <defs>
            <pattern id={propio} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="2.5" height="7" className="fill-rayado" />
            </pattern>
          </defs>
        )}

        {/* Rejilla: fina, sólida y discreta */}
        {dibujo.lineas.map((linea) => (
          <g key={linea.valor}>
            <line x1={MARGEN.izquierda} x2={dibujo.medida - MARGEN.derecha} y1={linea.y} y2={linea.y} stroke="var(--rejilla)" strokeWidth={1} />
            <text x={MARGEN.izquierda - 10} y={linea.y + 4} textAnchor="end" className="cifras fill-[var(--apagado)] text-[13px]">
              {eurosCorto(linea.valor)}
            </text>
          </g>
        ))}

        {serie.map((punto, i) => {
          const barra = dibujo.barras[i];
          const opacidad = activo === null || activo === i ? 1 : 0.45;
          const conEtiqueta = i % dibujo.cada === 0 || i === ultimo;

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
                rx={12}
                fill="transparent"
                strokeWidth={2}
                className="stroke-transparent group-focus-visible:stroke-acento"
              />
              {/* Con algo previsto encima, lo pagado va recto: la punta redondeada es la de lo previsto */}
              {barra.alto > 0 && (
                <path
                  d={columna(barra.x, barra.yValor, dibujo.base, dibujo.grosor, barra.altoPrevisto > 0 ? 0 : dibujo.grosor / 2)}
                  fill={color ?? 'var(--serie)'}
                  opacity={opacidad}
                />
              )}
              {barra.altoPrevisto > 0 && (
                <path
                  d={columna(barra.x, barra.y, barra.yValor, dibujo.grosor, dibujo.grosor / 2)}
                  fill={`url(#${patron})`}
                  opacity={opacidad}
                />
              )}
              {conEtiqueta && (
                <text x={barra.centro} y={ALTO - 12} textAnchor="middle" className="fill-[var(--tenue)] text-[13px] font-medium">
                  {mesCorto(punto.mes)}
                </text>
              )}
            </g>
          );
        })}

        {/* Línea de base, un punto más marcada que la rejilla */}
        <line x1={MARGEN.izquierda} x2={dibujo.medida - MARGEN.derecha} y1={dibujo.base} y2={dibujo.base} stroke="var(--eje)" strokeWidth={1} />
      </svg>

      {activo !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-texto px-3 py-2 text-center text-[13px] text-fondo shadow-flotante"
          style={{
            left: `${(dibujo.barras[activo].centro / dibujo.medida) * 100}%`,
            top: `${((dibujo.barras[activo].y - 8) / ALTO) * 100}%`,
          }}
        >
          <p className="font-semibold">{mesCorto(serie[activo].mes)}</p>
          {(serie[activo].previsto === undefined || serie[activo].valor !== 0) && (
            <p className="cifras mt-0.5">
              {etiqueta} {euros(serie[activo].valor)}
            </p>
          )}
          {serie[activo].previsto !== undefined && <p className="cifras mt-0.5">Previsto {euros(serie[activo].previsto ?? 0)}</p>}
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
