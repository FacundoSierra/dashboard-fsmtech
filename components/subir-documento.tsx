'use client';

import { useRef, useState, useTransition, type DragEvent, type FormEvent } from 'react';
import { CheckCircle2, FileUp, Loader2, X } from 'lucide-react';
import { subirDocumento } from '@/app/(panel)/documentos/acciones';
import { ACEPTADOS, CATEGORIAS, TAMANO_MAXIMO, type Categoria } from '@/lib/documentos/tipos';

const CAMPO =
  'w-full min-w-0 rounded-lg border border-borde bg-fondo px-3 py-2 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento/30';
const ETIQUETA = 'mb-1 block text-xs font-medium text-tenue';

/** `2026-09 Factura_VM.pdf` → `2026 09 Factura VM`: un título de partida que se puede cambiar */
function tituloDeArchivo(nombre: string): string {
  return nombre.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function tamanoLegible(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} kB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/**
 * Subir un documento de un cliente: se arrastra o se elige el archivo, y se rellenan sus datos.
 * El archivo va al almacén privado y su nota a la bóveda. Los campos no se vacían si algo falla.
 */
export function SubirDocumento({
  clientes,
  inicial,
  hoy,
}: {
  clientes: { nombre: string; titulo: string }[];
  inicial: { cliente?: string; categoria?: Categoria; cobro?: string };
  hoy: string;
}) {
  const selector = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cliente, setCliente] = useState(inicial.cliente ?? clientes[0]?.nombre ?? '');
  const [categoria, setCategoria] = useState<Categoria>(inicial.categoria ?? 'factura');
  const [titulo, setTitulo] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [importe, setImporte] = useState('');
  const [cobro, setCobro] = useState(inicial.cobro ?? '');
  const [encima, setEncima] = useState(false);
  const [error, setError] = useState<string>();
  const [subido, setSubido] = useState<string>();
  const [subiendo, empezar] = useTransition();

  function elegir(nuevo: File | undefined) {
    setError(undefined);
    setSubido(undefined);
    if (!nuevo) return;
    if (nuevo.size > TAMANO_MAXIMO) return setError('El archivo pasa de 4 MB. Si es un PDF escaneado, bájale la calidad.');
    setArchivo(nuevo);
    if (!titulo) setTitulo(tituloDeArchivo(nuevo.name));
  }

  function soltar(evento: DragEvent) {
    evento.preventDefault();
    setEncima(false);
    elegir(evento.dataTransfer.files[0]);
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!archivo) return setError('Elige un archivo.');
    const datos = new FormData();
    datos.set('archivo', archivo);
    datos.set('cliente', cliente);
    datos.set('categoria', categoria);
    datos.set('titulo', titulo);
    datos.set('fecha', fecha);
    datos.set('importe', importe);
    if (categoria === 'factura') datos.set('cobro', cobro);
    setError(undefined);
    empezar(async () => {
      const resultado = await subirDocumento(datos);
      if (resultado.error) return setError(resultado.error);
      setSubido(titulo);
      setArchivo(null);
      setTitulo('');
      setImporte('');
      setCobro('');
      if (selector.current) selector.current.value = '';
    });
  }

  const conImporte = categoria === 'factura' || categoria === 'presupuesto';

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div
        onDragOver={(evento) => {
          evento.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={soltar}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
          encima ? 'border-acento bg-acento-suave' : 'border-borde-fuerte bg-superficie-2'
        }`}
      >
        {archivo ? (
          <div className="flex max-w-full items-center gap-2 text-sm">
            <FileUp className="size-5 shrink-0 text-acento" aria-hidden />
            <span className="min-w-0 truncate font-medium">{archivo.name}</span>
            <span className="shrink-0 text-tenue">{tamanoLegible(archivo.size)}</span>
            <button
              type="button"
              onClick={() => {
                setArchivo(null);
                if (selector.current) selector.current.value = '';
              }}
              className="shrink-0 rounded p-1 text-apagado hover:bg-superficie hover:text-texto"
            >
              <X className="size-4" aria-hidden />
              <span className="sr-only">Quitar el archivo</span>
            </button>
          </div>
        ) : (
          <>
            <FileUp className="size-6 text-apagado" aria-hidden />
            <p className="text-sm">
              Arrastra aquí el archivo o{' '}
              <button type="button" onClick={() => selector.current?.click()} className="font-medium text-acento hover:underline">
                elígelo
              </button>
            </p>
            <p className="text-xs text-apagado">PDF, imágenes, Word, Excel, texto o zip · 4 MB como mucho</p>
          </>
        )}
        <input
          ref={selector}
          type="file"
          accept={ACEPTADOS}
          onChange={(evento) => elegir(evento.target.files?.[0])}
          className="sr-only"
          aria-label="Archivo"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className={ETIQUETA}>Cliente</span>
          <select value={cliente} onChange={(e) => setCliente(e.target.value)} className={CAMPO}>
            {clientes.map((c) => (
              <option key={c.nombre} value={c.nombre}>
                {c.titulo}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={ETIQUETA}>Qué es</span>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)} className={CAMPO}>
            {Object.entries(CATEGORIAS).map(([valor, nombre]) => (
              <option key={valor} value={valor}>
                {nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="sm:col-span-2">
          <span className={ETIQUETA}>Título</span>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} required maxLength={120} placeholder="Factura de septiembre" className={CAMPO} />
        </label>
        <label>
          <span className={ETIQUETA}>Fecha del documento</span>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required className={CAMPO} />
        </label>
        {conImporte && (
          <label>
            <span className={ETIQUETA}>
              Importe (€) <span className="font-normal text-apagado">· opcional</span>
            </span>
            <input value={importe} onChange={(e) => setImporte(e.target.value)} inputMode="decimal" placeholder="70" className={CAMPO} />
          </label>
        )}
        {categoria === 'factura' && (
          <label>
            <span className={ETIQUETA}>
              Cobro que paga <span className="font-normal text-apagado">· opcional</span>
            </span>
            <input type="month" value={cobro} onChange={(e) => setCobro(e.target.value)} placeholder="2026-09" className={CAMPO} />
          </label>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-critico-texto">
          {error}
        </p>
      )}
      {subido && (
        <p role="status" className="flex items-center gap-1.5 text-sm">
          <CheckCircle2 className="size-4 text-bien" aria-hidden />
          Subido: {subido}
        </p>
      )}

      <button
        type="submit"
        disabled={subiendo || !archivo}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-acento-fuerte px-4 py-2.5 font-medium text-white hover:opacity-90 disabled:opacity-60 sm:w-auto"
      >
        {subiendo && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {subiendo ? 'Subiendo…' : 'Subir documento'}
      </button>
    </form>
  );
}
