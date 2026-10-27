'use client'; // Los límites de error tienen que ser Client Components

/**
 * Si una lectura de la consultoría falla (no la falta de la configuración, la migración o la copia,
 * que tienen su aviso), las consultas lanzan un error en vez de devolver ceros: sería dinero que no
 * es. El detalle está en el registro del servidor; aquí, que no se ha podido leer y cómo reintentarlo.
 * La cabecera de la sección (el título y las pestañas) se queda: este límite va por debajo del layout.
 */
export default function ErrorDeLaConsultoria({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <section role="alert" className="rounded-xl border border-borde bg-superficie p-5 shadow-tarjeta">
      <h2 className="text-base font-semibold tracking-tight">No se ha podido leer la consultoría</h2>
      <p className="mt-2 max-w-prose text-sm text-tenue">
        No se enseñan cifras a medias: vuelve a intentarlo dentro de un momento. Si sigue fallando, el detalle está en el registro del
        servidor. Puede que la base esté en pausa por una semana sin uso: se reactiva desde Supabase.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-apagado">Referencia: {error.digest}</p>}
      <button
        type="button"
        onClick={() => retry()}
        className="mt-4 min-h-11 rounded-lg bg-acento-fuerte px-4 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
      >
        Volver a intentarlo
      </button>
    </section>
  );
}
