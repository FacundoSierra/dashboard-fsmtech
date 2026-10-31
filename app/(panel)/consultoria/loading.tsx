const TARJETA = 'rounded-xl bg-superficie';

/** Mientras llega una pestaña: el título y las pestañas se quedan, y debajo, el hueco de las tarjetas */
export default function CargandoConsultoria() {
  return (
    <div className="flex flex-col gap-3 sm:gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        <div className={`${TARJETA} h-64 motion-safe:animate-pulse`} />
        <div className={`${TARJETA} h-64 motion-safe:animate-pulse`} />
      </div>
      <div className={`${TARJETA} h-80 motion-safe:animate-pulse`} />
    </div>
  );
}
