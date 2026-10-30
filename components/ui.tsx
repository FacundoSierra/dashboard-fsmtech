import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { AlertTriangle, ArrowUpRight, CheckCircle2, CircleDashed, CircleMinus, OctagonAlert, XCircle } from 'lucide-react';
import { BOTON_PRINCIPAL, BOTON_REDONDO, BOTON_SECUNDARIO, ZONA_TOQUE } from './estilos';

export type Icono = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

// ── Página ───────────────────────────────────────────────────────────────────

/**
 * El título de cada pantalla, como el «Dashboard» de la referencia: grande, en seminegrita y
 * apretado. La misma letra que todo lo demás
 */
export const TITULO_PANTALLA = 'text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[36px]';

export function Encabezado({
  titulo,
  subtitulo,
  acciones,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-7">
      <div className="min-w-0">
        <h1 className={TITULO_PANTALLA}>{titulo}</h1>
        {subtitulo && <p className="mt-1.5 text-[15px] text-tenue first-letter:uppercase">{subtitulo}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </header>
  );
}

export function Seccion({ titulo, extra, children }: { titulo: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

// ── Tarjetas ─────────────────────────────────────────────────────────────────

/** El título de una tarjeta, como «Project Analytics» en la referencia: 17 px en seminegrita */
export const TITULO_TARJETA = 'text-[17px] font-semibold tracking-[-0.01em]';

/**
 * Una tarjeta: blanca, muy redondeada (20 px), sin borde ni sombra; se separa del gris por el tono.
 * El título arriba y, a su derecha, su acción (un enlace o un botón en píldora)
 */
export function Tarjeta({
  children,
  titulo,
  icono: IconoTitulo,
  accion,
  className = '',
  sinRelleno = false,
  estirar = false,
}: {
  children: ReactNode;
  titulo?: ReactNode;
  icono?: Icono;
  accion?: ReactNode;
  className?: string;
  /** Para tablas y listas que llegan hasta el borde */
  sinRelleno?: boolean;
  /** Que la tarjeta llene el alto de su fila y su contenido, el de la tarjeta (para llevar algo al pie) */
  estirar?: boolean;
}) {
  return (
    <section className={`imprimir-plano rounded-xl bg-superficie ${estirar ? 'flex h-full flex-col' : ''} ${className}`}>
      {titulo && (
        <div className={`flex min-h-11 items-center justify-between gap-3 px-5 pt-4 sm:px-6 sm:pt-5 ${sinRelleno ? 'pb-2' : ''}`}>
          <h2 className={`flex min-w-0 items-center gap-2 ${TITULO_TARJETA}`}>
            {IconoTitulo && <IconoTitulo className="size-[18px] shrink-0 text-apagado" aria-hidden />}
            <span className="truncate">{titulo}</span>
          </h2>
          {accion && <div className="shrink-0 text-sm">{accion}</div>}
        </div>
      )}
      <div className={`${sinRelleno ? '' : titulo ? 'px-5 pb-5 pt-3 sm:px-6 sm:pb-6' : 'p-5 sm:p-6'} ${estirar ? 'flex flex-1 flex-col' : ''}`}>
        {children}
      </div>
    </section>
  );
}

/** «Abrir la daily», «Todas»: el enlace de una tarjeta, con su zona de 44 px sin agrandar la cabecera */
export function EnlaceAccion({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={`${ZONA_TOQUE} font-medium text-acento hover:underline`}>
      {children}
    </Link>
  );
}

/**
 * Un enlace con forma de botón: «Apuntar», «Cliente», «Reunión»… Con `icono`, delante del texto
 * (el «+» va como icono, nunca escrito)
 */
export function EnlaceBoton({
  href,
  icono: IconoBoton,
  principal = false,
  children,
}: {
  href: string;
  icono?: Icono;
  principal?: boolean;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={principal ? BOTON_PRINCIPAL : BOTON_SECUNDARIO}>
      {IconoBoton && <IconoBoton className="size-4" aria-hidden />}
      {children}
    </Link>
  );
}

/**
 * Un filtro de una lista, que es un enlace a la misma página con otro parámetro. En píldora: el
 * activo, relleno del azul oscuro; los demás, blancos con borde. Se ve de 36 px y se toca en 44:
 * entre una fila y la siguiente, `gap-2` como mínimo para que no se pisen
 */
export function Filtro({ href, activo, children }: { href: string; activo: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={activo ? 'true' : undefined}
      className={`${ZONA_TOQUE} inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm transition-colors ${
        activo
          ? 'border-acento-fuerte bg-acento-fuerte font-semibold text-white'
          : 'border-borde-fuerte bg-superficie font-medium text-tenue hover:border-borde-control hover:text-texto'
      }`}
    >
      {children}
    </Link>
  );
}

// ── Cifras ───────────────────────────────────────────────────────────────────

/**
 * Una cifra en su tarjeta, como las de arriba de la referencia: el nombre, la cifra grande y un
 * detalle. Con `href`, en la esquina, el botón redondo con la flecha en diagonal que lleva a su
 * sección (la tarjeta entera no es enlace: así no hay enlaces dentro de enlaces). `destacada`: la
 * primera de la pantalla, rellena del azul oscuro de la marca con el texto en blanco.
 *
 * El valor va en cifras proporcionales (las tabulares dejan los números grandes con huecos).
 */
export function Kpi({
  etiqueta,
  valor,
  detalle,
  icono: IconoKpi,
  href,
  textoEnlace,
  estado,
  destacada = false,
  children,
}: {
  etiqueta: string;
  valor: ReactNode;
  detalle?: ReactNode;
  icono?: Icono;
  href?: string;
  /** El nombre del botón de la flecha, para quien no la ve: «Ver Estado» */
  textoEnlace?: string;
  /** Un indicador que tiene estado lo enseña con icono, no coloreando la cifra */
  estado?: NivelEstado;
  destacada?: boolean;
  children?: ReactNode;
}) {
  const esquina = href ? (
    <FlechaTarjeta href={href} texto={textoEnlace ?? `Ver ${etiqueta.toLowerCase()}`} destacada={destacada} />
  ) : estado ? (
    <IconoEstado nivel={estado} className="size-5" />
  ) : (
    IconoKpi && <IconoKpi className="size-5 text-apagado" aria-hidden />
  );

  return (
    <div className={`imprimir-plano flex min-w-0 flex-col rounded-xl p-5 sm:p-6 ${destacada ? 'tema-marca' : 'bg-superficie'}`}>
      <div className="flex min-h-9 items-start justify-between gap-2">
        <span className="pt-1.5 text-[15px] font-semibold leading-snug tracking-[-0.01em] sm:text-base">{etiqueta}</span>
        {esquina}
      </div>
      <div className="mt-3 text-[30px] font-semibold leading-none tracking-[-0.03em] sm:text-[36px] xl:text-[44px]">{valor}</div>
      {detalle && (
        <div className="mt-3 flex items-center gap-1.5 text-[13px] text-tenue">
          {href && estado && <IconoEstado nivel={estado} />}
          <span className="min-w-0">{detalle}</span>
        </div>
      )}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

/**
 * La flecha en diagonal de la esquina de una tarjeta, en un círculo con borde (blanco y relleno en
 * la tarjeta azul, como en la referencia). Se ve de 36 px y se toca en 44
 */
export function FlechaTarjeta({ href, texto, destacada = false }: { href: string; texto: string; destacada?: boolean }) {
  return (
    <Link
      href={href}
      className={`${ZONA_TOQUE} ${
        destacada
          ? 'inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-acento-fuerte transition-colors hover:bg-white/85'
          : BOTON_REDONDO
      }`}
    >
      <ArrowUpRight className="size-[18px]" aria-hidden />
      <span className="sr-only">{texto}</span>
    </Link>
  );
}

/** Barra de progreso: el resto de la pista es un paso más claro del mismo color */
export function Medidor({ valor, max = 100, etiqueta }: { valor: number; max?: number; etiqueta: string }) {
  const porcentaje = max > 0 ? Math.min(100, Math.max(0, (valor / max) * 100)) : 0;
  return (
    <div
      role="meter"
      aria-label={etiqueta}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={valor}
      className="h-1.5 overflow-hidden rounded-full bg-serie-suave"
    >
      <div className="h-full rounded-full bg-serie" style={{ width: `${porcentaje}%` }} />
    </div>
  );
}

// ── Estados ──────────────────────────────────────────────────────────────────

export type NivelEstado = 'bien' | 'aviso' | 'grave' | 'critico' | 'neutro' | 'sin-datos';

// El icono de aviso y el de grave, en su tono `-icono`: el de relleno no llega a 3:1 sobre blanco
const ESTADOS: Record<NivelEstado, { icono: Icono; color: string }> = {
  bien: { icono: CheckCircle2, color: 'text-bien' },
  aviso: { icono: AlertTriangle, color: 'text-aviso-icono' },
  grave: { icono: OctagonAlert, color: 'text-grave-icono' },
  critico: { icono: XCircle, color: 'text-critico' },
  neutro: { icono: CircleMinus, color: 'text-apagado' },
  'sin-datos': { icono: CircleDashed, color: 'text-apagado' },
};

export function IconoEstado({ nivel, className = 'size-4' }: { nivel: NivelEstado; className?: string }) {
  const { icono: IconoNivel, color } = ESTADOS[nivel];
  return <IconoNivel className={`shrink-0 ${color} ${className}`} aria-hidden />;
}

/**
 * Un estado siempre lleva icono y texto. El color va en el icono; el texto, en tinta
 * normal: el verde y el rojo de estado no se distinguen con deuteranopía.
 */
export function Estado({ nivel, children }: { nivel: NivelEstado; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
      <IconoEstado nivel={nivel} />
      <span>{children}</span>
    </span>
  );
}

/**
 * Un estado en píldora, como las etiquetas de la referencia («Completed», «Pending»): el icono del
 * nivel y el texto en tinta, sobre un gris claro con borde. El color sigue yendo solo en el icono
 */
export function EstadoPildora({ nivel, children }: { nivel: NivelEstado; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-borde bg-superficie-2 py-0.5 pl-1.5 pr-2.5 text-xs font-semibold">
      <IconoEstado nivel={nivel} className="size-3.5" />
      <span>{children}</span>
    </span>
  );
}

// ── Etiquetas ────────────────────────────────────────────────────────────────

export type Tono = 'neutro' | 'acento';

export function Chip({ children, tono = 'neutro' }: { children: ReactNode; tono?: Tono }) {
  const clase = tono === 'acento' ? 'bg-acento-suave text-acento' : 'bg-superficie-2 text-tenue';
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${clase}`}>
      {children}
    </span>
  );
}

/** Estado de un proyecto de la bóveda (`activo`, `pausado`, `completado`) */
export function nivelEstadoProyecto(estado: string): NivelEstado {
  if (estado === 'activo') return 'bien';
  if (estado === 'pausado') return 'neutro';
  return 'sin-datos';
}

// ── Vacíos ───────────────────────────────────────────────────────────────────

export function Vacio({ children, icono: IconoVacio }: { children: ReactNode; icono?: Icono }) {
  return (
    <div className="flex items-center gap-2 text-sm text-tenue">
      {IconoVacio && <IconoVacio className="size-4 shrink-0 text-apagado" aria-hidden />}
      <span>{children}</span>
    </div>
  );
}

/** Aviso de algo que falta configurar: dice qué y dónde, sin romper la página */
export function Pendiente({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-borde-control bg-superficie p-5 text-sm">
      <p className="font-medium">{titulo}</p>
      <div className="mt-1 text-tenue">{children}</div>
    </div>
  );
}

// ── Tablas ───────────────────────────────────────────────────────────────────

export const TABLA = 'w-full text-sm';
export const TH = 'px-5 py-2.5 text-left text-xs font-semibold text-apagado whitespace-nowrap sm:px-6';
export const TD = 'px-5 py-3 align-middle sm:px-6';
export const FILA = 'border-t border-borde';

export function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2">
      <span className="text-tenue">{etiqueta}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">{children}</div>
    </div>
  );
}

// ── Formato ──────────────────────────────────────────────────────────────────

const EUROS = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const EUROS_EXACTOS = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

/** Con `exactos`, céntimos solo si los hay: `58 €`, pero `9,25 €` */
export function euros(valor: number, exactos = false): string {
  return (exactos && !Number.isInteger(valor) ? EUROS_EXACTOS : EUROS).format(valor);
}

export function porcentaje(valor: number, decimales = 0): string {
  return `${valor.toLocaleString('es-ES', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} %`;
}
