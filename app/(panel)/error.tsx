'use client'; // Los límites de error tienen que ser Client Components
import { BOTON_PRINCIPAL } from '@/components/estilos';

/** Como el de la consultoría: una tarjeta del panel con qué ha pasado, la referencia y el botón en píldora */
export default function ErrorPanel({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <section role="alert" className="mx-auto mt-4 max-w-md rounded-xl bg-superficie p-6 text-center sm:mt-10 sm:p-8">
      <h1 className="text-xl font-semibold tracking-[-0.02em]">No se han podido cargar las notas</h1>
      <p className="mt-2 text-sm text-tenue">Puede ser un fallo puntual de GitHub o que falte configurar la fuente de datos.</p>
      {error.digest && <p className="mt-2 font-mono text-[13px] text-apagado">Referencia: {error.digest}</p>}
      <button type="button" onClick={() => retry()} className={`${BOTON_PRINCIPAL} mt-6 w-full`}>
        Reintentar
      </button>
    </section>
  );
}
