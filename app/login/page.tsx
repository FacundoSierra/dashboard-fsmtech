import type { Metadata } from 'next';
import { BotonEntrarConHuella } from '@/components/passkeys';
import { hayPasskeys } from '@/lib/passkeys/config';
import { destinoSeguro } from '@/lib/passkeys/destino';
import { FormularioLogin } from './formulario';

export const metadata: Metadata = { title: 'Acceso' };

export default async function PaginaLogin({ searchParams }: PageProps<'/login'>) {
  const { desde } = await searchParams;
  const destino = destinoSeguro(typeof desde === 'string' ? desde : null);
  const conHuella = hayPasskeys();

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-borde bg-superficie p-6 shadow-tarjeta">
        <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-acento-fuerte text-sm font-bold text-white" aria-hidden>
          FS
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard FSMTECH</h1>
        <p className="mb-6 mt-1 text-sm text-tenue">
          Panel privado. {conHuella ? 'Entra con la huella o con la contraseña.' : 'Introduce la contraseña.'}
        </p>

        {conHuella && (
          <div className="mb-5">
            <BotonEntrarConHuella desde={destino} />
            <div className="mt-5 flex items-center gap-3 text-xs text-apagado">
              <span className="h-px flex-1 bg-borde" />
              o con la contraseña
              <span className="h-px flex-1 bg-borde" />
            </div>
          </div>
        )}

        <FormularioLogin desde={destino} />
      </div>
    </main>
  );
}
