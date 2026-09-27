/**
 * Lo que se ve mientras llega una página del panel.
 *
 * Sin esto, al pulsar un enlace la pantalla no cambiaba hasta que el servidor terminaba, y
 * el clic parecía muerto. Además, Next solo puede adelantar la carga de una página dinámica
 * hasta su pantalla de carga: sin ella, tampoco precargaba nada.
 */
export default function Cargando() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>

      <div className="mb-6">
        <div className="h-7 w-56 animate-pulse rounded-lg bg-superficie-2" />
        <div className="mt-2 h-4 w-40 animate-pulse rounded bg-superficie-2" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-borde bg-superficie" />
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-xl border border-borde bg-superficie" />
        <div className="h-64 animate-pulse rounded-xl border border-borde bg-superficie" />
      </div>
    </div>
  );
}
