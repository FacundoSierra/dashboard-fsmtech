'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { diasEntre } from '@/lib/consultoria/calendario';
import type { ClienteDeLaLista } from '@/lib/consultoria/tipos';
import { euros, fechaCorta, normalizar } from '@/lib/consultoria/formato';
import { BOTON_SECUNDARIO, CAMPO } from './estilos';
import { IconoEstado } from '@/components/ui';
import { cuantas } from './formato';

// El formulario solo viaja cuando alguien lo abre
const FormularioCliente = dynamic(() => import('./FormularioCliente'), {
  loading: () => <p className="mt-5 text-sm text-apagado">Un momento…</p>,
});

/** Cuántos días antes se avisa de una revisión */
const DIAS_AVISO = 30;

/**
 * La cartera: buscar sobre lo ya cargado (sin ir al servidor en cada tecla), y por cliente lo que
 * tiene, lo que aporta (al mes y en únicas, por separado), lo que ha generado y la próxima revisión,
 * resaltada si ya pasó o queda menos de un mes.
 */
export default function ListaClientesConsultoria({ clientes, hoy }: { clientes: ClienteDeLaLista[]; hoy: string }) {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [creando, setCreando] = useState(false);
  const buscado = useDeferredValue(texto);

  const filtrados = useMemo(() => {
    const clave = normalizar(buscado);
    if (!clave) return clientes;
    return clientes.filter((c) => normalizar(`${c.nombre} ${c.referencia ?? ''}`).includes(clave));
  }, [buscado, clientes]);

  return (
    <div className="flex flex-col gap-5">
      {creando ? (
        <section className="rounded-xl border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5">
          <h2 className="text-base font-semibold tracking-tight text-texto">Cliente nuevo</h2>
          <FormularioCliente
            alGuardar={(id) => router.push(`/consultoria/clientes/${id}`)}
            alCancelar={() => setCreando(false)}
          />
        </section>
      ) : null}

      <section className="rounded-xl border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-texto">Tus clientes</h2>
            <p className="mt-0.5 text-sm text-apagado">
              {buscado ? `${filtrados.length} de ${clientes.length}` : cuantas(clientes.length, 'cliente', 'clientes')}
            </p>
          </div>
          {!creando && (
            <button
              type="button"
              onClick={() => setCreando(true)}
              className={`${BOTON_SECUNDARIO} inline-flex items-center gap-1.5`}
            >
              <Plus className="size-4" aria-hidden />
              Cliente nuevo
            </button>
          )}
        </header>

        <label className="relative mt-4 block">
          <span className="sr-only">Buscar un cliente</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-apagado" aria-hidden />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por nombre o referencia"
            autoComplete="off"
            className={`${CAMPO} pl-9`}
          />
        </label>

        {filtrados.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-2">
            {filtrados.map((cliente) => (
              <FilaCliente key={cliente.id} cliente={cliente} hoy={hoy} />
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-tenue">
            {clientes.length === 0 ? 'Aún no hay ningún cliente.' : 'Ningún cliente se llama así.'}
          </p>
        )}
      </section>
    </div>
  );
}

function FilaCliente({ cliente, hoy }: { cliente: ClienteDeLaLista; hoy: string }) {
  const sinDato = cliente.herramientas > 0 && cliente.aportacionMensual === 0 && cliente.aportacionUnica === 0;
  const dias = cliente.proximaRevision ? diasEntre(hoy, cliente.proximaRevision) : null;
  const revisionCerca = dias !== null && dias < DIAS_AVISO;

  return (
    <li>
      <Link
        href={`/consultoria/clientes/${cliente.id}`}
        className="flex flex-col gap-2 rounded-lg bg-fondo/70 px-4 py-3.5 transition-colors hover:bg-fondo focus-visible:outline-2 focus-visible:outline-acento sm:flex-row sm:items-start sm:justify-between sm:gap-4"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-texto">{cliente.nombre}</span>
          {cliente.referencia && <span className="block truncate text-sm text-apagado">{cliente.referencia}</span>}
          <span className="mt-1 block text-sm text-tenue">
            {cuantas(cliente.herramientas, 'herramienta', 'herramientas')}
            {cliente.previstas > 0 && ` · ${cuantas(cliente.previstas, 'prevista', 'previstas')}`}
          </span>
          {cliente.proximaRevision && (
            // Pasada o a menos de un mes: con el icono de aviso, no solo con color
            <span className={`mt-0.5 flex items-center gap-1.5 text-sm ${revisionCerca ? 'font-medium text-texto' : 'text-apagado'}`}>
              {revisionCerca && <IconoEstado nivel="aviso" />}
              <span>
                {dias !== null && dias < 0 ? 'Revisión pasada: ' : 'Revisión el '}
                {fechaCorta(cliente.proximaRevision)}
              </span>
            </span>
          )}
        </span>
        <span className="flex shrink-0 flex-col gap-0.5 text-sm sm:items-end sm:text-right">
          {sinDato ? (
            <span className="text-apagado">Aportación: sin dato</span>
          ) : (
            <>
              {cliente.aportacionMensual > 0 && <span className="cifras font-semibold text-texto">{euros(cliente.aportacionMensual)}/mes</span>}
              {cliente.aportacionUnica > 0 && <span className="cifras font-semibold text-texto">{euros(cliente.aportacionUnica)} en únicas</span>}
            </>
          )}
          <span className="text-tenue">
            Generado <span className="cifras font-semibold text-texto">{euros(cliente.generadoBruto)}</span>
          </span>
        </span>
      </Link>
    </li>
  );
}
