'use client';

import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState, useTransition, type ComponentType } from 'react';
import { ArrowRight, Check, Command, FileText, Inbox, ListPlus, Loader2, Search } from 'lucide-react';
import { apuntarObjetivo } from '@/app/(panel)/acciones';
import { cambiarCobro } from '@/app/(panel)/economia/acciones';
import { datosBarra, type DatosBarra } from '@/app/(panel)/ordenes';
import { hrefNota } from '@/lib/rutas';

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
  { texto: 'Documentos', href: '/documentos' },
  { texto: 'Informes', href: '/informes' },
  { texto: 'Crear cliente', href: '/crear?tipo=cliente' },
  { texto: 'Crear reunión', href: '/crear?tipo=reunion' },
  { texto: 'Crear requerimiento', href: '/crear?tipo=requerimiento' },
  { texto: 'Subir documento', href: '/documentos#subir' },
  { texto: 'Ajustes', href: '/ajustes' },
];

const sinTildes = (valor: string) => valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const contieneTodas = (texto: string, palabras: string[]) => {
  const normal = sinTildes(texto);
  return palabras.every((palabra) => normal.includes(palabra));
};

/**
 * La barra de órdenes: `Ctrl+K` (o el botón de la cabecera) y se escribe. Salta a una sección o
 * a una nota, y hace lo de cada día sin buscar botones: «objetivo llamar a Pablo», «cobrado vm
 * septiembre», «apuntar idea para CNI». Lo que marca pasa por las mismas acciones que los botones
 */
export function BarraOrdenes() {
  const router = useRouter();
  const idLista = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const [abierta, setAbierta] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [datos, setDatos] = useState<DatosBarra | null>(null);
  const [activa, setActiva] = useState(0);
  const [mensaje, setMensaje] = useState<{ error?: boolean; texto: string }>();
  const [haciendo, empezar] = useTransition();

  useEffect(() => {
    function tecla(evento: KeyboardEvent) {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k') {
        evento.preventDefault();
        setAbierta((antes) => !antes);
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

  function cerrar() {
    setAbierta(false);
    setConsulta('');
    setDatos(null);
    setMensaje(undefined);
    setActiva(0);
  }

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
    const texto = textoTras(/^apuntar\s+/i);
    ordenes.push({ id: 'apuntar', texto: `Apuntar en el inbox: «${texto}»`, icono: Inbox, hacer: ir(`/capturar?texto=${encodeURIComponent(texto)}`) });
  } else {
    const palabras = normal.split(/\s+/).filter(Boolean);
    for (const seccion of SECCIONES.filter((s) => contieneTodas(s.texto, palabras))) {
      ordenes.push({ id: `seccion-${seccion.href}`, texto: seccion.texto, detalle: 'Ir', icono: ArrowRight, hacer: ir(seccion.href) });
    }
    if (q.length >= 2) {
      const notas = (datos?.notas ?? []).filter((n) => contieneTodas(`${n.titulo} ${n.ruta.split('/').at(-1)}`, palabras)).slice(0, 8);
      for (const nota of notas) {
        ordenes.push({ id: `nota-${nota.ruta}`, texto: nota.titulo, detalle: nota.carpeta || 'nota', icono: FileText, hacer: ir(hrefNota(nota.ruta)) });
      }
      ordenes.push({ id: 'buscar', texto: `Buscar «${q}» en todas las notas`, icono: Search, hacer: ir(`/buscar?q=${encodeURIComponent(q)}`) });
    }
  }

  const seleccionada = Math.min(activa, Math.max(0, ordenes.length - 1));

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
        type="button"
        onClick={() => setAbierta(true)}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-borde bg-superficie px-2.5 text-sm text-tenue hover:text-texto"
        aria-keyshortcuts="Control+K"
      >
        <Command className="size-4" aria-hidden />
        <span className="hidden md:inline">Órdenes</span>
        <kbd className="hidden rounded border border-borde px-1 font-sans text-[11px] text-apagado md:inline">Ctrl K</kbd>
        <span className="sr-only md:hidden">Barra de órdenes</span>
      </button>

      {/* En un portal: la cabecera tiene `backdrop-blur`, y con eso un `fixed` de dentro se mediría contra ella y no contra la pantalla */}
      {abierta &&
        createPortal(
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Barra de órdenes">
          <button type="button" aria-label="Cerrar" className="absolute inset-0 cursor-default bg-black/40" onClick={cerrar} />
          <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-borde bg-superficie shadow-2xl">
            <div className="flex items-center gap-2 border-b border-borde px-3">
              {haciendo ? <Loader2 className="size-4 shrink-0 animate-spin text-apagado" aria-hidden /> : <Command className="size-4 shrink-0 text-apagado" aria-hidden />}
              <input
                ref={entrada}
                autoFocus
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
                  } else if (e.key === 'Escape') {
                    cerrar();
                  }
                }}
                role="combobox"
                aria-expanded="true"
                aria-controls={idLista}
                aria-activedescendant={ordenes[seleccionada] ? `${idLista}-${seleccionada}` : undefined}
                placeholder="Ir a…, objetivo …, cobrado …, apuntar …"
                className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-apagado"
              />
            </div>

            <ul id={idLista} role="listbox" className="max-h-80 overflow-y-auto p-1.5">
              {ordenes.map((o, i) => (
                <li
                  key={o.id}
                  id={`${idLista}-${i}`}
                  role="option"
                  aria-selected={i === seleccionada}
                  onMouseEnter={() => setActiva(i)}
                  onClick={() => ejecutar(o)}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${i === seleccionada ? 'bg-acento-suave text-acento' : ''}`}
                >
                  <o.icono className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{o.texto}</span>
                  {o.detalle && <span className="shrink-0 text-xs text-apagado">{o.detalle}</span>}
                </li>
              ))}
              {ordenes.length === 0 && (
                <li className="px-2.5 py-2 text-sm text-tenue">
                  {(orden === 'cobrado' || orden === 'cobro') && !datos ? 'Cargando los cobros…' : (orden === 'cobrado' || orden === 'cobro') ? 'No hay cobros pendientes que encajen.' : 'Nada con ese nombre.'}
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
                Prueba «objetivo llamar a Pablo», «cobrado vm septiembre» o «apuntar idea para CNI». Enter hace, Esc cierra.
              </p>
            )}
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
