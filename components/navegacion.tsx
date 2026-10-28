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

/** Marca del panel: las iniciales sobre el azul de la app */
export function Marca() {
  return (
    <span
      aria-hidden
      className="flex size-7 items-center justify-center rounded-lg bg-acento-fuerte text-[11px] font-bold tracking-tight text-white"
    >
      FS
    </span>
  );
}

function esActiva(href: string, ruta: string): boolean {
  return href === '/' ? ruta === '/' : ruta === href || ruta.startsWith(`${href}/`);
}

// En la hoja del móvil, cada fila de 44 px; en el menú lateral, que se usa con ratón, más juntas
const FILA_HOJA = 'min-h-11';

function EnlaceSeccion({ seccion, ruta, alPulsar }: { seccion: Seccion; ruta: string; alPulsar?: () => void }) {
  const activa = esActiva(seccion.href, ruta);
  const IconoSeccion = seccion.icono;
  return (
    <Link
      href={seccion.href}
      onClick={alPulsar}
      aria-current={activa ? 'page' : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${alPulsar ? FILA_HOJA : ''} ${
        activa ? 'bg-acento-suave text-acento' : 'text-tenue hover:bg-superficie-2 hover:text-texto'
      }`}
    >
      <IconoSeccion className="size-4 shrink-0" aria-hidden />
      {seccion.texto}
    </Link>
  );
}

function ListaGrupos({ ruta, alPulsar }: { ruta: string; alPulsar?: () => void }) {
  return (
    <div className="space-y-5">
      {GRUPOS.map((grupo) => (
        <div key={grupo.titulo}>
          <p className="mb-1 px-2.5 text-xs font-medium text-apagado">{grupo.titulo}</p>
          <div className="space-y-0.5">
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
    <Link
      href="/ajustes"
      onClick={alPulsar}
      aria-current={activa ? 'page' : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium ${alPulsar ? FILA_HOJA : ''} ${
        activa ? 'bg-acento-suave text-acento' : 'text-tenue hover:bg-superficie-2 hover:text-texto'
      }`}
    >
      <Settings className="size-4" aria-hidden />
      Ajustes
    </Link>
  );
}

function BotonSalir({ enHoja = false }: { enHoja?: boolean }) {
  return (
    <form action={cerrarSesion}>
      <button
        type="submit"
        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-tenue hover:bg-superficie-2 hover:text-texto ${enHoja ? FILA_HOJA : ''}`}
      >
        <LogOut className="size-4" aria-hidden />
        Salir
      </button>
    </form>
  );
}

/** Menú lateral de escritorio */
export function BarraLateral() {
  const ruta = usePathname();
  return (
    <aside className="no-imprimir fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-borde bg-superficie lg:flex">
      <Link href="/" className="flex items-center gap-2.5 px-5 py-5">
        <Marca />
        <span className="text-sm font-semibold tracking-tight">FSMTECH</span>
      </Link>
      <nav aria-label="Secciones" className="flex-1 overflow-y-auto px-3">
        <ListaGrupos ruta={ruta} />
      </nav>
      <div className="space-y-0.5 border-t border-borde p-3">
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
      <div
        ref={hoja}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-borde bg-superficie p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] outline-none"
      >
        <div className="mb-2 flex items-center justify-between">
          <p id="hoja-secciones" className="text-sm font-semibold">
            Secciones
          </p>
          <button
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar"
            className="-mr-2 grid size-11 place-items-center rounded-lg text-tenue hover:bg-superficie-2 hover:text-texto"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <ListaGrupos ruta={ruta} alPulsar={alCerrar} />
        <div className="mt-5 border-t border-borde pt-3">
          <Link
            href="/buscar"
            onClick={alCerrar}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-tenue hover:bg-superficie-2 hover:text-texto ${FILA_HOJA}`}
          >
            <Search className="size-4" aria-hidden />
            Buscar
          </Link>
          <EnlaceAjustes ruta={ruta} alPulsar={alCerrar} />
          <BotonSalir enHoja />
        </div>
      </div>
    </div>
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

      <nav
        aria-label="Secciones principales"
        className="no-imprimir fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-borde bg-superficie/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {principales.map((seccion) => {
          const activa = esActiva(seccion.href, ruta);
          const IconoSeccion = seccion.icono;
          return (
            <Link
              key={seccion.href}
              href={seccion.href}
              aria-current={activa ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${activa ? 'text-acento' : 'text-apagado'}`}
            >
              <IconoSeccion className="size-5" aria-hidden />
              {seccion.texto}
            </Link>
          );
        })}
        <button
          ref={mas}
          type="button"
          onClick={() => setAbierto(true)}
          aria-expanded={abierto}
          aria-haspopup="dialog"
          className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${enMas ? 'text-acento' : 'text-apagado'}`}
        >
          <Menu className="size-5" aria-hidden />
          Más
        </button>
      </nav>
    </>
  );
}
