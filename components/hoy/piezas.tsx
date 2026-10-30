/**
 * Las piezas pequeñas que repiten las tarjetas de Hoy: el rayado de lo que falta (barras y
 * medidor), su muestra para las leyendas y el avatar de una persona.
 */

/**
 * El patrón del rayado, una vez por gráfico: las barras y el arco lo usan con `url(#id)`. En SVG
 * y no con un degradado de CSS: es un dibujo, y así se imprime y se mide igual que lo demás
 */
export function PatronRayado({ id }: { id: string }) {
  return (
    <svg aria-hidden width="0" height="0" className="absolute">
      <defs>
        <pattern id={id} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="2.5" height="7" className="fill-rayado" />
        </pattern>
      </defs>
    </svg>
  );
}

/** Un trozo rayado que llena su caja (la parte que falta de una barra) */
export function Rayado({ id }: { id: string }) {
  return (
    <svg aria-hidden className="block size-full">
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/** La muestra de una leyenda: un círculo relleno o rayado, del mismo dibujo que el gráfico */
export function Muestra({ clase, rayado }: { clase?: string; rayado?: string }) {
  return (
    <span aria-hidden className={`inline-block shrink-0 overflow-hidden rounded-full ${rayado ? 'size-3.5' : 'size-3'} ${clase ?? ''}`}>
      {rayado && <Rayado id={rayado} />}
    </span>
  );
}

/**
 * Seis tintes claros para las personas, como los círculos de la referencia: cada nombre cae
 * siempre en el mismo. Son identidad, no datos: no van en ningún gráfico
 */
const TINTES = 6;

function tinteDe(nombre: string): number {
  let suma = 0;
  for (const letra of nombre.toLowerCase()) suma = (suma * 31 + letra.charCodeAt(0)) % 997;
  return (suma % TINTES) + 1;
}

/** `[[fernanda-cni|Fernanda]]` → `Fernanda`; `**Pablo**` → `Pablo` */
export function nombreLimpio(texto: string): string {
  return texto
    .replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_, nombre: string, alias?: string) => alias ?? nombre)
    .replace(/[*_`]/g, '')
    .trim();
}

/** El círculo de una persona (o de un proyecto): su inicial sobre su tinte. Sin fotos: no las hay */
export function Avatar({ nombre, tamano = 'grande' }: { nombre: string; tamano?: 'grande' | 'pequeno' }) {
  const limpio = nombreLimpio(nombre);
  const inicial = limpio.match(/\p{L}|\p{N}/u)?.[0]?.toUpperCase() ?? '·';
  return (
    <span
      aria-hidden
      className={`tinte-${tinteDe(limpio)} flex shrink-0 items-center justify-center rounded-full bg-[var(--tinte-fondo)] font-semibold text-[var(--tinte-texto)] ${
        tamano === 'grande' ? 'size-10 text-[15px]' : 'size-8 text-[13px]'
      }`}
    >
      {inicial}
    </span>
  );
}
