'use client'; // Los límites de error tienen que ser Client Components

export default function ErrorPanel({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-borde bg-superficie p-6 shadow-tarjeta text-center">
      <h1 className="text-lg font-semibold">No se han podido cargar las notas</h1>
      <p className="mt-2 text-sm text-tenue">
        Puede ser un fallo puntual de GitHub o que falte configurar la fuente de datos.
        {error.digest && <span className="mt-1 block font-mono text-xs">Referencia: {error.digest}</span>}
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-4 rounded-lg bg-acento-fuerte px-4 py-2 text-sm font-medium text-white"
      >
        Reintentar
      </button>
    </div>
  );
}
