import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { BOTON_PRINCIPAL, TARJETA } from '@/components/consultoria/estilos';
import FaltaMigracion from '@/components/consultoria/FaltaMigracion';
import FiltrosProduccion from '@/components/consultoria/FiltrosProduccion';
import TablaProduccion from '@/components/consultoria/TablaProduccion';
import { contextoDeReglas, produccion } from '@/lib/consultoria/consultas';
import type { EstadoHerramienta } from '@/lib/consultoria/reglas';
import { exigirConsultoria } from '@/lib/consultoria/sesion';

export const metadata: Metadata = { title: 'Producción' };

const texto = (valor: string | string[] | undefined) => (typeof valor === 'string' ? valor : undefined);

/** Las herramientas, con los filtros en la dirección y sus totales de producción */
export default async function ProduccionPage({ searchParams }: PageProps<'/consultoria/produccion'>) {
  const acceso = await exigirConsultoria();
  if ('pendiente' in acceso) return <FaltaMigracion migracion={acceso.falta} />;
  const { consultor } = acceso;
  const filtros = await searchParams;

  const [datos, { contexto }] = await Promise.all([
    // Lo que no se entiende, la consulta lo ignora
    produccion(consultor.id, {
      mes: texto(filtros.mes),
      compania: texto(filtros.compania),
      estado: texto(filtros.estado) as EstadoHerramienta | undefined,
    }),
    contextoDeReglas(consultor.id),
  ]);
  if (datos.pendiente) return <FaltaMigracion migracion={datos.falta} />;

  return (
    <section className={TARJETA}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">Producción</h2>
          <p className="mt-0.5 text-sm text-tenue">Cada herramienta firmada o prevista. Los filtros se guardan en la dirección</p>
        </div>
        <Link href="/consultoria/produccion/nueva" className={`${BOTON_PRINCIPAL} inline-flex items-center gap-1.5`}>
          <Plus className="size-4" aria-hidden />
          Nueva firma
        </Link>
      </header>
      <FiltrosProduccion meses={datos.meses} companias={contexto.companias} />
      <TablaProduccion produccion={datos} companias={contexto.companias} />
    </section>
  );
}
