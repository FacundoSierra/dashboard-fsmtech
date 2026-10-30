import Link from 'next/link';
import { Wallet } from 'lucide-react';
import { EstadoPildora, TITULO_TARJETA, euros } from '@/components/ui';
import type { Boveda } from '@/lib/boveda/tipos';
import { cobrosPorCobrar, economia } from '@/lib/economia';

const VISIBLES = 3;

/**
 * La tarjeta oscura de Hoy, como el cronómetro de la referencia: lo que falta por cobrar (este mes
 * y lo atrasado), en grande y en blanco; debajo, de quién y cuánto, y un botón en píldora a los
 * cobros de Economía, donde se marcan. Las mismas cifras que Economía
 */
export function PorCobrar({ boveda, hoy }: { boveda: Boveda; hoy: string }) {
  const dinero = economia(boveda, hoy);
  const debidos = cobrosPorCobrar(dinero, hoy).filter((d) => !d.cobro.cobrado);
  const atrasados = dinero.atrasados.length;

  // Lo de cada cliente, sumado: un cliente con dos cobros sale una vez
  const porCliente = new Map<string, number>();
  for (const { cliente, cobro } of debidos) {
    const nombre = cliente.nota.titulo.split(' — ')[0];
    porCliente.set(nombre, (porCliente.get(nombre) ?? 0) + cobro.importe);
  }
  const filas = [...porCliente].sort((a, b) => b[1] - a[1]);

  return (
    <section className="tema-oscuro imprimir-plano flex h-full flex-col rounded-xl p-5 sm:p-6">
      <h2 className={`flex min-h-11 items-center ${TITULO_TARJETA}`}>Por cobrar</h2>
      <p className="mt-1 text-[40px] font-semibold leading-none tracking-[-0.03em] sm:text-[44px]">{euros(dinero.pendiente)}</p>
      <div className="mt-3">
        {atrasados ? (
          <EstadoPildora nivel="grave">
            {atrasados} {atrasados === 1 ? 'cobro atrasado' : 'cobros atrasados'}
          </EstadoPildora>
        ) : filas.length ? (
          <p className="text-[13px] text-tenue">De este mes</p>
        ) : (
          <EstadoPildora nivel="bien">Al día</EstadoPildora>
        )}
      </div>

      {filas.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-borde pt-4 text-sm">
          {filas.slice(0, VISIBLES).map(([nombre, importe]) => (
            <li key={nombre} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-tenue">{nombre}</span>
              <span className="cifras shrink-0 font-semibold">{euros(importe, true)}</span>
            </li>
          ))}
          {filas.length > VISIBLES && <li className="text-[13px] text-tenue">Y {filas.length - VISIBLES} más</li>}
        </ul>
      )}

      <span aria-hidden className="block min-h-5 flex-1" />
      <Link
        href="/economia#por-cobrar"
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-[#0a1f3d] transition-colors hover:bg-white/90"
      >
        <Wallet className="size-4" aria-hidden />
        Ver los cobros
      </Link>
    </section>
  );
}
