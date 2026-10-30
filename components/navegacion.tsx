'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState, type RefObject } from 'react';
import {
  Activity,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarDays,
  FileText,
  FolderKanban,
  FolderLock,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Search,
  Wallet,
  X,
} from 'lucide-react';
import { cerrarSesion } from '@/app/login/acciones';
import { useDialogo } from './dialogo';

type Seccion = { href: string; texto: string; icono: typeof LayoutDashboard };

const GRUPOS: { titulo: string; secciones: Seccion[] }[] = [
  {
    titulo: 'Día a día',
    secciones: [
      { href: '/', texto: 'Hoy', icono: LayoutDashboard },
      { href: '/semana', texto: 'Semana', icono: CalendarDays },
      { href: '/inbox', texto: 'Inbox', icono: Inbox },
    ],
  },
  {
    titulo: 'Trabajo',
    secciones: [
      { href: '/clientes', texto: 'Clientes', icono: Building2 },
      { href: '/proyectos', texto: 'Proyectos', icono: FolderKanban },
      { href: '/reuniones', texto: 'Reuniones', icono: CalendarClock },
    ],
  },
  {
    titulo: 'Negocio',
    secciones: [
      { href: '/estado', texto: 'Estado', icono: Activity },
      { href: '/economia', texto: 'Economía', icono: Wallet },
      { href: '/consultoria', texto: 'Consultoría', icono: Briefcase },
      { href: '/documentos', texto: 'Documentos', icono: FolderLock },
      { href: '/informes', texto: 'Informes', icono: FileText },
    ],
  },
];

/** Las cuatro que más se usan desde el móvil; el resto, en «Más» */
const EN_BARRA_INFERIOR = ['/', '/proyectos', '/estado', '/economia'];

const TODAS = GRUPOS.flatMap((grupo) => grupo.secciones);

/**
 * Marca del panel: las iniciales en blanco sobre el azul oscuro, en círculo como el logotipo de la
 * referencia. Las mismas que el icono instalado
 */
export function Marca() {
  return (
    <span
      aria-hidden
      className="flex size-9 items-center justify-center rounded-full bg-acento-fuerte text-[12px] font-bold tracking-tight text-white"
    >
      FS
    </span>
  );
}

function esActiva(href: string, ruta: string): boolean {
  return href === '/' ? ruta === '/' : ruta === href || ruta.startsWith(`${href}/`);
}

/**
 * Una fila del menú, de 44 px. La sección en la que estás lleva, como en la referencia, una barra
 * vertical del azul de la marca pegada al borde izquierdo de la isla, el icono en azul y el texto
 * en tinta y seminegrita: no va solo por color. Las demás, en gris; al pasar, un trozo de tarjeta
 */
function claseFila(activa: boolean): string {
  const estado = activa ? 'font-semibold text-texto [&_svg]:text-acento' : 'font-medium text-tenue hover:bg-superficie hover:text-texto';
  return `relative flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-[15px] transition-colors ${estado}`;
}

/** La barra de la sección activa. `-left-3`: el margen de la isla, para que toque su borde */
function BarraActiva() {
  return <span aria-hidden className="absolute -left-3 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-acento" />;
}

function EnlaceSeccion({ seccion, ruta, alPulsar }: { seccion: Seccion; ruta: string; alPulsar?: () => void }) {
  const activa = esActiva(seccion.href, ruta);
  const IconoSeccion = seccion.icono;
  return (
    <Link href={seccion.href} onClick={alPulsar} aria-current={activa ? 'page' : undefined} className={claseFila(activa)}>
      {activa && <BarraActiva />}
      <IconoSeccion className="size-5 shrink-0" aria-hidden />
      {seccion.texto}
    </Link>
  );
}

function ListaGrupos({ ruta, alPulsar }: { ruta: string; alPulsar?: () => void }) {
  return (
    <div className="space-y-5">
      {GRUPOS.map((grupo) => (
        <div key={grupo.titulo}>
          <p className="mb-1 px-3 text-[13px] font-medium text-apagado">{grupo.titulo}</p>
          <div>
            {grupo.secciones.map((seccion) => (
              <EnlaceSeccion key={seccion.href} seccion={seccion} ruta={ruta} alPulsar={alPulsar} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EnlaceAjustes({ ruta, alPulsar }: { ruta: string; alPulsar?: () => void }) {
  const activa = esActiva('/ajustes', ruta);
  return (
    <Link href="/ajustes" onClick={alPulsar} aria-current={activa ? 'page' : undefined} className={claseFila(activa)}>
      {activa && <BarraActiva />}
      <Settings className="size-5 shrink-0" aria-hidden />
      Ajustes
    </Link>
  );
}

function BotonSalir() {
  return (
    <form action={cerrarSesion}>
      <button type="submit" className={claseFila(false)}>
        <LogOut className="size-5 shrink-0" aria-hidden />
        Salir
      </button>
    </form>
  );
}

/** Menú lateral de escritorio: una isla gris, separada 12 px de los bordes de la ventana */
export function BarraLateral() {
  const ruta = usePathname();
  return (
    <aside className="no-imprimir fixed inset-y-3 left-3 hidden w-60 flex-col rounded-2xl bg-fondo lg:flex">
      <Link href="/" className="flex h-[4.5rem] shrink-0 items-center gap-3 px-6">
        <Marca />
        <span className="text-lg font-bold tracking-[-0.02em]">FSMTECH</span>
      </Link>
      <nav aria-label="Secciones" className="flex-1 overflow-y-auto px-3 pt-3">
        <ListaGrupos ruta={ruta} />
      </nav>
      <div className="px-3 pb-4 pt-3">
        <p className="mb-1 px-3 text-[13px] font-medium text-apagado">General</p>
        <EnlaceAjustes ruta={ruta} />
        <BotonSalir />
      </div>
    </aside>
  );
}

/**
 * La hoja «Más» del móvil, con todas las secciones. Al abrirse se lleva el foco, Esc la cierra, el
 * Tab no se sale de ella y, al cerrarse, el foco vuelve a «Más»
 */
function HojaSecciones({ ruta, alCerrar, vuelta }: { ruta: string; alCerrar: () => void; vuelta: RefObject<HTMLButtonElement | null> }) {
  const hoja = useRef<HTMLDivElement>(null);
  useDialogo({ abierto: true, caja: hoja, alCerrar, vuelta });

  return (
    <div className="no-imprimir fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-labelledby="hoja-secciones">
      {/* Solo para el dedo y el ratón: con el teclado está la X y Esc */}
      <button type="button" tabIndex={-1} aria-label="Cerrar" className="absolute inset-0 bg-black/40" onClick={alCerrar} />
      {/* Una isla gris que sube desde abajo, como el menú del escritorio. Flota: por eso lleva sombra */}
      <div
        ref={hoja}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-[1.75rem] bg-fondo px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 shadow-flotante outline-none"
      >
        <span aria-hidden className="mx-auto mb-1 block h-1 w-10 rounded-full bg-borde-fuerte" />
        <div className="mb-2 flex items-center justify-between pl-3">
          <p id="hoja-secciones" className="text-xl font-semibold tracking-[-0.02em]">
            Secciones
          </p>
          <button
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar"
            className="grid size-11 place-items-center rounded-full border border-borde bg-superficie text-tenue hover:text-texto"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <ListaGrupos ruta={ruta} alPulsar={alCerrar} />
        <div className="mt-5">
          <p className="mb-1 px-3 text-[13px] font-medium text-apagado">General</p>
          <Link href="/buscar" onClick={alCerrar} className={claseFila(esActiva('/buscar', ruta))}>
            {esActiva('/buscar', ruta) && <BarraActiva />}
            <Search className="size-5 shrink-0" aria-hidden />
            Buscar
          </Link>
          <EnlaceAjustes ruta={ruta} alPulsar={alCerrar} />
          <BotonSalir />
        </div>
      </div>
    </div>
  );
}

/**
 * Cada pestaña de la barra de abajo: 64 px de alto. La de la sección en la que estás lleva la
 * barra de la marca pegada al borde de arriba (la del menú lateral, tumbada), el icono en azul y el
 * texto en seminegrita: no va solo por color
 */
const PESTANA = 'relative flex min-h-16 flex-col items-center justify-center gap-1 text-[12px]';

function Pestana({ activa, icono: IconoPestana, texto }: { activa: boolean; icono: typeof LayoutDashboard; texto: string }) {
  return (
    <>
      {activa && <span aria-hidden className="absolute left-1/2 top-0 h-1 w-8 -translate-x-1/2 rounded-b-full bg-acento" />}
      <IconoPestana className={`size-[22px] ${activa ? 'text-acento' : 'text-tenue'}`} aria-hidden />
      <span className={activa ? 'font-semibold text-texto' : 'font-medium text-tenue'}>{texto}</span>
    </>
  );
}

/** Barra de pestañas del móvil, con «Más» para el resto de secciones */
export function BarraInferior() {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const mas = useRef<HTMLButtonElement>(null);

  const principales = TODAS.filter((seccion) => EN_BARRA_INFERIOR.includes(seccion.href));
  const enMas = !principales.some((seccion) => esActiva(seccion.href, ruta));

  return (
    <>
      {abierto && <HojaSecciones ruta={ruta} alCerrar={() => setAbierto(false)} vuelta={mas} />}

      {/* Una tarjeta blanca pegada abajo, con las esquinas de arriba redondeadas: flota sobre la página */}
      <nav
        aria-label="Secciones principales"
        className="no-imprimir fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 rounded-t-2xl bg-superficie px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_rgba(14,20,32,0.08)] lg:hidden dark:shadow-[0_-1px_0_var(--borde)]"
      >
        {principales.map((seccion) => {
          const activa = esActiva(seccion.href, ruta);
          return (
            <Link key={seccion.href} href={seccion.href} aria-current={activa ? 'page' : undefined} className={PESTANA}>
              <Pestana activa={activa} icono={seccion.icono} texto={seccion.texto} />
            </Link>
          );
        })}
        <button ref={mas} type="button" onClick={() => setAbierto(true)} aria-expanded={abierto} aria-haspopup="dialog" className={PESTANA}>
          <Pestana activa={enMas} icono={Menu} texto="Más" />
        </button>
      </nav>
    </>
  );
}
