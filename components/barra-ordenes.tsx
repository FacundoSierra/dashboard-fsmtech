'use client';

import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useEffect, useEffectEvent, useId, useRef, useState, useSyncExternalStore, useTransition, type ComponentType } from 'react';
import { ArrowRight, Check, Command, ExternalLink, FileText, Inbox, ListPlus, Loader2, Search } from 'lucide-react';
import { apuntarObjetivo } from '@/app/(panel)/acciones';
import { cambiarCobro } from '@/app/(panel)/economia/acciones';
import { datosBarra, type DatosBarra } from '@/app/(panel)/ordenes';
import { hrefNota } from '@/lib/rutas';
import { useDialogo } from './dialogo';

type Icono = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

interface Orden {
  id: string;
  texto: string;
  detalle?: string;
  icono: Icono;
  /** Navegar cierra la barra; una escritura la deja abierta con el resultado */
  hacer: () => void | Promise<{ error?: string } | void>;
}

const SECCIONES: { texto: string; href: string }[] = [
  { texto: 'Hoy', href: '/' },
  { texto: 'Semana', href: '/semana' },
  { texto: 'Inbox', href: '/inbox' },
  { texto: 'Clientes', href: '/clientes' },
  { texto: 'Proyectos', href: '/proyectos' },
  { texto: 'Reuniones', href: '/reuniones' },
  { texto: 'Estado', href: '/estado' },
  { texto: 'Economía', href: '/economia' },
  // Solo el enlace: ni clientes ni herramientas de la consultoría en la barra (llevan nombres)
  { texto: 'Consultoría', href: '/consultoria' },
  { texto: 'Documentos', href: '/documentos' },
  { texto: 'Informes', href: '/informes' },
  { texto: 'Crear cliente', href: '/crear?tipo=cliente' },
  { texto: 'Crear reunión', href: '/crear?tipo=reunion' },
  { texto: 'Crear requerimiento', href: '/crear?tipo=requerimiento' },
  { texto: 'Subir documento', href: '/documentos#subir' },
  { texto: 'Ajustes', href: '/ajustes' },
];

/** «apuntar tarea …», «apuntar idea …», «apuntar nota …»: el tipo con el que se abre Capturar */
const TIPOS_CAPTURA: Record<string, { tipo: string; texto: string }> = {
  tarea: { tipo: 'tarea', texto: 'una tarea' },
  idea: { tipo: 'idea', texto: 'una idea' },
  nota: { tipo: 'nota', texto: 'una nota' },
};

const sinTildes = (valor: string) => valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const contieneTodas = (texto: string, palabras: string[]) => {
  const normal = sinTildes(texto);
  return palabras.every((palabra) => normal.includes(palabra));
};

// En el Mac el atajo es ⌘K. En el servidor no se sabe: sale «Ctrl K» y se cambia al hidratar
const sinSuscripcion = () => () => {};
const esMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * La barra de órdenes: `Ctrl+K` (o el botón de la cabecera) y se escribe. Salta a una sección o
 * a una nota, y hace lo de cada día sin buscar botones: «objetivo llamar a Pablo», «cobrado vm
 * septiembre», «apuntar idea para CNI». Lo que marca pasa por las mismas acciones que los botones.
 *
 * Con el teclado: las flechas mueven la opción elegida (y la lista la sigue), Esc cierra desde
 * cualquier sitio del diálogo, el Tab se queda en el campo y, al cerrar, el foco vuelve a donde
 * estaba
 */
export function BarraOrdenes() {
  const router = useRouter();
  const idLista = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const [abierta, setAbierta] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [datos, setDatos] = useState<DatosBarra | null>(null);
  const [activa, setActiva] = useState(0);
  const [mensaje, setMensaje] = useState<{ error?: boolean; texto: string }>();
  const [haciendo, empezar] = useTransition();
  const mac = useSyncExternalStore(sinSuscripcion, esMac, () => false);

  function cerrar() {
    setAbierta(false);
    setConsulta('');
    setDatos(null);
    setMensaje(undefined);
    setActiva(0);
  }

  useDialogo({ abierto: abierta, caja, alCerrar: cerrar, inicial: entrada, vuelta: boton });

  const alternar = useEffectEvent(() => (abierta ? cerrar() : setAbierta(true)));
  useEffect(() => {
    function tecla(evento: KeyboardEvent) {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k') {
        evento.preventDefault();
        alternar();
      }
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  // Los datos se piden cada vez que se abre: tras marcar un cobro, el siguiente ya no sale
  useEffect(() => {
    if (!abierta) return;
    let vigente = true;
    datosBarra()
      .then((nuevos) => vigente && setDatos(nuevos))
      .catch(() => vigente && setMensaje({ error: true, texto: 'No se han podido cargar las notas.' }));
    return () => {
      vigente = false;
    };
  }, [abierta]);

  const ir = (href: string) => () => {
    cerrar();
    router.push(href);
  };

  const q = consulta.trim();
  const normal = sinTildes(q);
  const [orden, ...resto] = normal.split(/\s+/);
  const textoTras = (prefijo: RegExp) => q.replace(prefijo, '').trim();
  const ordenes: Orden[] = [];

  if (/^(objetivo|\+)\s/.test(normal) && textoTras(/^(objetivo|\+)\s+/i)) {
    const objetivo = textoTras(/^(objetivo|\+)\s+/i);
    ordenes.push({ id: 'objetivo', texto: `Añadir a los objetivos de hoy: «${objetivo}»`, icono: ListPlus, hacer: () => apuntarObjetivo(objetivo) });
  } else if (orden === 'cobrado' || orden === 'cobro') {
    const cobros = (datos?.cobros ?? []).filter((c) => contieneTodas(c.busqueda, resto));
    for (const cobro of cobros.slice(0, 8)) {
      ordenes.push({
        id: `cobro-${cobro.ruta}-${cobro.linea}`,
        texto: `Marcar cobrado: ${cobro.texto}`,
        icono: Check,
        hacer: () => {
          const datosCobro = new FormData();
          datosCobro.set('ruta', cobro.ruta);
          datosCobro.set('linea', cobro.linea);
          datosCobro.set('cobrado', '1');
          return cambiarCobro({}, datosCobro);
        },
      });
    }
  } else if (orden === 'apuntar' && textoTras(/^apuntar\s+/i)) {
    // «apuntar tarea llamar a Pablo» abre Capturar con «Tarea» elegido; sin tipo, el de siempre
    const tipo = Object.hasOwn(TIPOS_CAPTURA, resto[0] ?? '') && resto.length > 1 ? TIPOS_CAPTURA[resto[0]] : undefined;
    const texto = tipo ? textoTras(/^apuntar\s+\S+\s+/i) : textoTras(/^apuntar\s+/i);
    const parametros = new URLSearchParams({ texto, ...(tipo ? { tipo: tipo.tipo } : {}) });
    ordenes.push({
      id: 'apuntar',
      texto: tipo ? `Apuntar ${tipo.texto} en el inbox: «${texto}»` : `Apuntar en el inbox: «${texto}»`,
      icono: Inbox,
      hacer: ir(`/capturar?${parametros}`),
    });
  } else {
    const palabras = normal.split(/\s+/).filter(Boolean);
    for (const seccion of SECCIONES.filter((s) => contieneTodas(s.texto, palabras))) {
      ordenes.push({ id: `seccion-${seccion.href}`, texto: seccion.texto, detalle: 'Ir', icono: ArrowRight, hacer: ir(seccion.href) });
    }
    // Los paneles propios, en otra pestaña: «finance», «df»…
    for (const portal of (datos?.portales ?? []).filter((p) => contieneTodas(`${p.nombre} ${p.dominio}`, palabras))) {
      ordenes.push({
        id: `portal-${portal.url}`,
        texto: `Abrir ${portal.nombre}`,
        detalle: portal.dominio,
        icono: ExternalLink,
        hacer: () => {
          cerrar();
          window.open(portal.url, '_blank', 'noopener,noreferrer');
        },
      });
    }
    if (q.length >= 2) {
      const notas = (datos?.notas ?? []).filter((n) => contieneTodas(`${n.titulo} ${n.ruta.split('/').at(-1)}`, palabras)).slice(0, 8);
      for (const nota of notas) {
        ordenes.push({ id: `nota-${nota.ruta}`, texto: nota.titulo, detalle: nota.detalle, icono: FileText, hacer: ir(hrefNota(nota.ruta)) });
      }
      ordenes.push({ id: 'buscar', texto: `Buscar «${q}» en todas las notas`, icono: Search, hacer: ir(`/buscar?q=${encodeURIComponent(q)}`) });
    }
  }

  const seleccionada = Math.min(activa, Math.max(0, ordenes.length - 1));
  const idActiva = ordenes[seleccionada] ? `${idLista}-${seleccionada}` : undefined;

  // La opción elegida, siempre a la vista: con las flechas se puede bajar más allá del alto de la lista
  useEffect(() => {
    if (!abierta || !idActiva) return;
    document.getElementById(idActiva)?.scrollIntoView({ block: 'nearest' });
  }, [abierta, idActiva]);

  function ejecutar(orden: Orden | undefined) {
    if (!orden || haciendo) return;
    setMensaje(undefined);
    empezar(async () => {
      const resultado = await orden.hacer();
      if (!resultado) return;
      if (resultado.error) return setMensaje({ error: true, texto: resultado.error });
      setMensaje({ texto: `Hecho: ${orden.texto.replace(/^[^:]+:\s*/, '')}` });
      setConsulta('');
      setDatos(await datosBarra());
    });
  }

  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierta(true)}
        className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-borde bg-superficie px-2.5 text-sm text-tenue hover:text-texto"
        aria-keyshortcuts={mac ? 'Meta+K' : 'Control+K'}
        aria-haspopup="dialog"
      >
        <Command className="size-4" aria-hidden />
        <span className="hidden md:inline">Órdenes</span>
        <kbd className="hidden rounded border border-borde px-1 font-sans text-[11px] text-apagado md:inline">{mac ? '⌘ K' : 'Ctrl K'}</kbd>
        <span className="sr-only md:hidden">Barra de órdenes</span>
      </button>

      {/* En un portal: la cabecera tiene `backdrop-blur`, y con eso un `fixed` de dentro se mediría contra ella y no contra la pantalla */}
      {abierta &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Barra de órdenes">
            {/* Solo para el ratón: con el teclado se cierra con Esc, y así el Tab no se va aquí */}
            <button type="button" tabIndex={-1} aria-label="Cerrar" className="absolute inset-0 cursor-default bg-black/40" onClick={cerrar} />
            <div ref={caja} className="relative w-full max-w-xl overflow-hidden rounded-xl border border-borde bg-superficie shadow-2xl">
              <div className="flex items-center gap-2 border-b border-borde px-3">
                {haciendo ? (
                  <Loader2 className="size-4 shrink-0 text-apagado motion-safe:animate-spin" aria-hidden />
                ) : (
                  <Command className="size-4 shrink-0 text-apagado" aria-hidden />
                )}
                <input
                  ref={entrada}
                  value={consulta}
                  onChange={(e) => {
                    setConsulta(e.target.value);
                    setActiva(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setActiva((i) => Math.min(i + 1, ordenes.length - 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setActiva((i) => Math.max(i - 1, 0));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      ejecutar(ordenes[seleccionada]);
                    }
                  }}
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={idLista}
                  aria-activedescendant={idActiva}
                  aria-label="Qué quieres hacer"
                  placeholder="Ir a…, objetivo …, cobrado …, apuntar …"
                  className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-apagado"
                />
              </div>

              <ul id={idLista} role="listbox" aria-label="Órdenes" className="max-h-80 overflow-y-auto p-1.5">
                {ordenes.map((o, i) => (
                  <li
                    key={o.id}
                    id={`${idLista}-${i}`}
                    role="option"
                    aria-selected={i === seleccionada}
                    onMouseEnter={() => setActiva(i)}
                    onClick={() => ejecutar(o)}
                    className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${i === seleccionada ? 'bg-acento-suave text-acento' : ''}`}
                  >
                    <o.icono className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{o.texto}</span>
                    {o.detalle && <span className="max-w-[40%] shrink-0 truncate text-xs text-apagado">{o.detalle}</span>}
                  </li>
                ))}
                {ordenes.length === 0 && (
                  <li className="px-2.5 py-2 text-sm text-tenue">
                    {(orden === 'cobrado' || orden === 'cobro') && !datos
                      ? 'Cargando los cobros…'
                      : orden === 'cobrado' || orden === 'cobro'
                        ? 'No hay cobros pendientes que encajen.'
                        : 'Nada con ese nombre.'}
                  </li>
                )}
              </ul>

              {mensaje && (
                <p role={mensaje.error ? 'alert' : 'status'} className={`border-t border-borde px-3 py-2 text-sm ${mensaje.error ? 'text-critico-texto' : 'text-texto'}`}>
                  {mensaje.texto}
                </p>
              )}
              {!q && !mensaje && (
                <p className="border-t border-borde px-3 py-2 text-xs text-apagado">
                  Prueba «objetivo llamar a Pablo», «cobrado vm septiembre» o «apuntar tarea revisar la web». Enter hace, Esc cierra.
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
