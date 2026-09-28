'use client';

import Link from 'next/link';
import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import {
  crearCliente,
  crearRequerimientoNuevo,
  crearReunionNueva,
  type ResultadoCreacion,
} from '@/app/(panel)/crear/acciones';
import { hrefNota } from '@/lib/rutas';

const CAMPO =
  'w-full min-w-0 rounded-lg border border-borde bg-fondo px-3 py-2 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento/30';
const ETIQUETA = 'mb-1 block text-xs font-medium text-tenue';

/** `Centro de Negocios Inmobiliarios` → `centro-de-negocios-inmobiliarios`: la propuesta del nombre corto */
function aSlug(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '');
}

function Campo({ etiqueta, opcional, ancho, children }: { etiqueta: string; opcional?: boolean; ancho?: boolean; children: ReactNode }) {
  return (
    <label className={ancho ? 'sm:col-span-2' : undefined}>
      <span className={ETIQUETA}>
        {etiqueta}
        {opcional && <span className="font-normal text-apagado"> · opcional</span>}
      </span>
      {children}
    </label>
  );
}

/** El envío, el aviso de error o de hecho y el botón: lo que comparten los tres formularios */
function useCreacion(crear: () => Promise<ResultadoCreacion>, listo: () => void) {
  const [resultado, setResultado] = useState<ResultadoCreacion>({});
  const [creando, empezar] = useTransition();
  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    setResultado({});
    empezar(async () => {
      const nuevo = await crear();
      setResultado(nuevo);
      if (!nuevo.error) listo();
    });
  };
  return { resultado, creando, enviar };
}

function Pie({ resultado, creando, texto }: { resultado: ResultadoCreacion; creando: boolean; texto: string }) {
  return (
    <div className="space-y-3 sm:col-span-2">
      {resultado.error && (
        <p role="alert" className="text-sm text-critico-texto">
          {resultado.error}
          {resultado.ruta && (
            <>
              {' '}
              <Link href={hrefNota(resultado.ruta)} className="underline">
                Abrir la ficha
              </Link>
            </>
          )}
        </p>
      )}
      {!resultado.error && resultado.ruta && (
        <p role="status" className="flex flex-wrap items-center gap-1.5 text-sm">
          <CheckCircle2 className="size-4 text-bien" aria-hidden />
          Creada.
          <Link href={hrefNota(resultado.ruta)} className="font-medium text-acento hover:underline">
            Abrir la nota
          </Link>
        </p>
      )}
      <button
        type="submit"
        disabled={creando}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-acento-fuerte px-4 py-2.5 font-medium text-white hover:opacity-90 disabled:opacity-60 sm:w-auto"
      >
        {creando && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {texto}
      </button>
    </div>
  );
}

// ── Cliente ──────────────────────────────────────────────────────────────────

export function FormCliente({
  lineas,
  estados,
  mesActual,
}: {
  lineas: Record<string, string>;
  estados: Record<string, string>;
  mesActual: string;
}) {
  const [nombre, setNombre] = useState('');
  const [corto, setCorto] = useState('');
  const [cortoTocado, setCortoTocado] = useState(false);
  const [sector, setSector] = useState('');
  const [web, setWeb] = useState('');
  const [estado, setEstado] = useState('potencial');
  const [linea, setLinea] = useState('desarrollo');
  const [contexto, setContexto] = useState('');
  const [conTrato, setConTrato] = useState(false);
  const [concepto, setConcepto] = useState('Mantenimiento');
  const [importe, setImporte] = useState('');
  const [cada, setCada] = useState('mes');
  const [desde, setDesde] = useState(mesActual);

  const { resultado, creando, enviar } = useCreacion(
    () =>
      crearCliente({
        nombre,
        corto: cortoTocado ? corto : aSlug(nombre),
        sector,
        web,
        estado,
        linea,
        contexto,
        cobros: conTrato ? { concepto, importe, cada, desde } : undefined,
      }),
    () => {
      setNombre('');
      setCorto('');
      setCortoTocado(false);
      setSector('');
      setWeb('');
      setContexto('');
      setImporte('');
      setConTrato(false);
    },
  );

  return (
    <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-2">
      <Campo etiqueta="Nombre">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={80} placeholder="Restaurante La Plaza" className={CAMPO} />
      </Campo>
      <Campo etiqueta="Nombre corto (carpeta y enlaces)">
        <input
          value={cortoTocado ? corto : aSlug(nombre)}
          onChange={(e) => {
            setCortoTocado(true);
            setCorto(aSlug(e.target.value));
          }}
          required
          maxLength={40}
          placeholder="la-plaza"
          className={`${CAMPO} font-mono`}
        />
      </Campo>
      <Campo etiqueta="Estado">
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className={CAMPO}>
          {Object.entries(estados).map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </select>
      </Campo>
      <Campo etiqueta="Línea de negocio">
        <select value={linea} onChange={(e) => setLinea(e.target.value)} className={CAMPO}>
          {Object.entries(lineas).map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </select>
      </Campo>
      <Campo etiqueta="Sector" opcional>
        <input value={sector} onChange={(e) => setSector(e.target.value)} maxLength={80} placeholder="Hostelería (Madrid)" className={CAMPO} />
      </Campo>
      <Campo etiqueta="Web" opcional>
        <input value={web} onChange={(e) => setWeb(e.target.value)} type="url" placeholder="https://" className={CAMPO} />
      </Campo>
      <Campo etiqueta="Contexto del negocio" opcional ancho>
        <textarea
          value={contexto}
          onChange={(e) => setContexto(e.target.value)}
          rows={3}
          maxLength={1500}
          placeholder="Qué hacen, cómo trabajan hoy y qué problema les resuelves"
          className={CAMPO}
        />
      </Campo>

      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={conTrato} onChange={(e) => setConTrato(e.target.checked)} className="size-4 accent-acento-fuerte" />
        Ya hay trato: crear también su nota de cobros
      </label>
      {conTrato && (
        <div className="grid gap-3 rounded-lg border border-borde bg-superficie-2 p-3 sm:col-span-2 sm:grid-cols-4">
          <label className="sm:col-span-2">
            <span className={ETIQUETA}>Concepto</span>
            <input value={concepto} onChange={(e) => setConcepto(e.target.value)} required maxLength={80} className={CAMPO} />
          </label>
          <label>
            <span className={ETIQUETA}>Importe (€)</span>
            <input value={importe} onChange={(e) => setImporte(e.target.value)} required inputMode="decimal" placeholder="50" className={CAMPO} />
          </label>
          <label>
            <span className={ETIQUETA}>Cada</span>
            <select value={cada} onChange={(e) => setCada(e.target.value)} className={CAMPO}>
              <option value="mes">Mes</option>
              <option value="año">Año</option>
              <option value="sesion">Sesión</option>
              <option value="hora">Hora</option>
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className={ETIQUETA}>Primer mes del trato</span>
            <input type="month" value={desde} onChange={(e) => setDesde(e.target.value)} required placeholder="2026-10" className={CAMPO} />
          </label>
          <p className="text-xs text-tenue sm:col-span-2 sm:self-end">
            Doce meses desde el primero. Las casillas de cobro se crean solas si es al mes o al año; las sesiones y horas, al cobrarlas.
          </p>
        </div>
      )}

      <Pie resultado={resultado} creando={creando} texto="Crear cliente" />
    </form>
  );
}

// ── Reunión ──────────────────────────────────────────────────────────────────

export function FormReunion({
  clientes,
  proyectos,
  inicial,
  hoy,
}: {
  clientes: { nombre: string; titulo: string }[];
  proyectos: { nombre: string; titulo: string; cliente?: string }[];
  inicial?: string;
  hoy: string;
}) {
  const [cliente, setCliente] = useState(inicial ?? clientes[0]?.nombre ?? '');
  const [fecha, setFecha] = useState(hoy);
  const [hora, setHora] = useState('');
  const [tema, setTema] = useState('');
  const [marcados, setMarcados] = useState<string[]>([]);
  const [objetivo, setObjetivo] = useState('');
  const suyos = proyectos.filter((p) => p.cliente === cliente);

  const { resultado, creando, enviar } = useCreacion(
    () => crearReunionNueva({ cliente, fecha, hora, tema, proyectos: marcados.filter((m) => suyos.some((p) => p.nombre === m)), objetivo }),
    () => {
      setTema('');
      setHora('');
      setObjetivo('');
      setMarcados([]);
    },
  );

  return (
    <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-2">
      <Campo etiqueta="Cliente">
        <select value={cliente} onChange={(e) => setCliente(e.target.value)} className={CAMPO}>
          {clientes.map((c) => (
            <option key={c.nombre} value={c.nombre}>
              {c.titulo}
            </option>
          ))}
        </select>
      </Campo>
      <Campo etiqueta="Tema">
        <input value={tema} onChange={(e) => setTema(e.target.value)} required maxLength={80} placeholder="Precios y mantenimiento" className={CAMPO} />
      </Campo>
      <Campo etiqueta="Fecha">
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required className={CAMPO} />
      </Campo>
      <Campo etiqueta="Hora" opcional>
        <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={CAMPO} />
      </Campo>
      {suyos.length > 0 && (
        <fieldset className="sm:col-span-2">
          <legend className={ETIQUETA}>Proyectos</legend>
          <div className="flex flex-wrap gap-3">
            {suyos.map((p) => (
              <label key={p.nombre} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={marcados.includes(p.nombre)}
                  onChange={(e) => setMarcados((antes) => (e.target.checked ? [...antes, p.nombre] : antes.filter((m) => m !== p.nombre)))}
                  className="size-4 accent-acento-fuerte"
                />
                {p.titulo}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <Campo etiqueta="Objetivo" opcional ancho>
        <textarea value={objetivo} onChange={(e) => setObjetivo(e.target.value)} rows={2} maxLength={1500} className={CAMPO} />
      </Campo>
      <p className="text-xs text-tenue sm:col-span-2">Con la fecha puesta, la diaria de ese día la recoge sola entre los objetivos.</p>
      <Pie resultado={resultado} creando={creando} texto="Crear reunión" />
    </form>
  );
}

// ── Requerimiento ────────────────────────────────────────────────────────────

export function FormRequerimiento({
  proyectos,
  reuniones,
  inicial,
}: {
  proyectos: { nombre: string; titulo: string; cliente?: string; siguiente: string }[];
  reuniones: { nombre: string; titulo: string; cliente?: string }[];
  inicial?: string;
}) {
  const [proyecto, setProyecto] = useState(inicial ?? proyectos[0]?.nombre ?? '');
  const [titulo, setTitulo] = useState('');
  const [pide, setPide] = useState('');
  const [origen, setOrigen] = useState('');
  const [horas, setHoras] = useState('');
  const [prioridad, setPrioridad] = useState('media');
  const elegido = proyectos.find((p) => p.nombre === proyecto);
  const deSuCliente = reuniones.filter((r) => elegido?.cliente && r.cliente === elegido.cliente);

  const { resultado, creando, enviar } = useCreacion(
    () => crearRequerimientoNuevo({ proyecto, titulo, pide, origen: deSuCliente.some((r) => r.nombre === origen) ? origen : '', horas, prioridad }),
    () => {
      setTitulo('');
      setPide('');
      setOrigen('');
      setHoras('');
      setPrioridad('media');
    },
  );

  return (
    <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-2">
      <Campo etiqueta="Proyecto">
        <select value={proyecto} onChange={(e) => setProyecto(e.target.value)} className={CAMPO}>
          {proyectos.map((p) => (
            <option key={p.nombre} value={p.nombre}>
              {p.titulo}
            </option>
          ))}
        </select>
      </Campo>
      <Campo etiqueta="Número">
        <input value={elegido?.siguiente ?? ''} readOnly aria-readonly className={`${CAMPO} font-mono text-tenue`} />
      </Campo>
      <Campo etiqueta="Qué es, en corto" ancho>
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} required maxLength={100} placeholder="Que el CRM escriba con su dominio" className={CAMPO} />
      </Campo>
      <Campo etiqueta="Qué pide el cliente, en sus palabras" opcional ancho>
        <textarea value={pide} onChange={(e) => setPide(e.target.value)} rows={3} maxLength={1500} className={CAMPO} />
      </Campo>
      <Campo etiqueta="Dónde se pidió" opcional>
        <select value={origen} onChange={(e) => setOrigen(e.target.value)} className={CAMPO}>
          <option value="">— En ninguna reunión —</option>
          {deSuCliente.map((r) => (
            <option key={r.nombre} value={r.nombre}>
              {r.titulo}
            </option>
          ))}
        </select>
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Horas" opcional>
          <input value={horas} onChange={(e) => setHoras(e.target.value)} inputMode="decimal" placeholder="8" className={CAMPO} />
        </Campo>
        <Campo etiqueta="Prioridad">
          <select value={prioridad} onChange={(e) => setPrioridad(e.target.value)} className={CAMPO}>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
        </Campo>
      </div>
      <Pie resultado={resultado} creando={creando} texto="Crear requerimiento" />
    </form>
  );
}
