'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import BotonBorrar from '@/components/consultoria/BotonBorrar';
import { borrarCliente } from '@/lib/consultoria/acciones';
import type { FichaCliente } from '@/lib/consultoria/tipos';
import { fechaCorta } from '@/lib/consultoria/formato';

const FormularioCliente = dynamic(() => import('./FormularioCliente'), {
  loading: () => <p className="mt-5 text-sm text-apagado">Un momento…</p>,
});

/** Los datos de un cliente, para leerlos o cambiarlos; y borrarlo, si no tiene herramientas */
export default function DatosClienteConsultoria({ cliente, sePuedeBorrar }: { cliente: FichaCliente['cliente']; sePuedeBorrar: boolean }) {
  const router = useRouter();
  const [cambiando, setCambiando] = useState(false);

  if (cambiando) {
    return <FormularioCliente cliente={cliente} alGuardar={() => setCambiando(false)} alCancelar={() => setCambiando(false)} />;
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-sm text-apagado">Referencia</dt>
          <dd className="text-texto">{cliente.referencia ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-sm text-apagado">Próxima revisión</dt>
          <dd className="text-texto">{cliente.proximaRevision ? fechaCorta(cliente.proximaRevision) : 'Sin fecha'}</dd>
        </div>
        {cliente.notas && (
          <div className="sm:col-span-2">
            <dt className="text-sm text-apagado">Notas</dt>
            <dd className="whitespace-pre-line text-texto">{cliente.notas}</dd>
          </div>
        )}
      </dl>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <button
          type="button"
          onClick={() => setCambiando(true)}
          className="min-h-11 text-sm font-medium text-acento underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-acento"
        >
          Cambiar los datos
        </button>
        {sePuedeBorrar && (
          <BotonBorrar
            descripcion={cliente.nombre}
            etiqueta="Borrar cliente"
            className="min-h-11"
            onBorrar={async () => {
              const resultado = await borrarCliente(cliente.id);
              if (!resultado.error) router.push('/consultoria/clientes');
              return resultado;
            }}
          />
        )}
      </div>
    </div>
  );
}
