import type { Metadata } from 'next';
import Link from 'next/link';
import { ENLACE_VOLVER, TARJETA } from '@/components/consultoria/estilos';
import FaltaMigracion from '@/components/consultoria/FaltaMigracion';
import FormularioFirma from '@/components/consultoria/FormularioFirma';
import { madresPosibles } from '@/components/consultoria/formato';
import { clientesConsultoria, contextoDeReglas, produccion, productosUsados } from '@/lib/consultoria/consultas';
import { hoyEnMadrid } from '@/lib/consultoria/reglas';
import { exigirConsultoria } from '@/lib/consultoria/sesion';

export const metadata: Metadata = { title: 'Nueva firma' };

/**
 * Nueva firma. El formulario es lo que se ve al entrar, así que no va con `next/dynamic`: ya viaja
 * solo en esta ruta, que es lo que buscaba la carga aparte. Calcula en el navegador lo que saldría
 * (eso no escribe); guardar, hasta el cambio, lo rechaza la acción (spec 6.2).
 *
 * Las herramientas de las que puede colgar una APEX salen de Producción. Si no se pueden leer, no se
 * pregunta por la APEX y la firma se apunta como siempre.
 */
export default async function NuevaFirmaPage({ searchParams }: PageProps<'/consultoria/produccion/nueva'>) {
  const acceso = await exigirConsultoria();
  if ('pendiente' in acceso) return <FaltaMigracion migracion={acceso.falta} />;
  const { consultor } = acceso;
  const { cliente } = await searchParams;

  const [{ contexto, deSerie, pendiente, falta }, { clientes }, { productos }, todas] = await Promise.all([
    contextoDeReglas(consultor.id),
    clientesConsultoria(consultor.id),
    productosUsados(consultor.id),
    produccion(consultor.id),
  ]);
  if (pendiente) return <FaltaMigracion migracion={falta} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 px-1">
        <h2 className="text-lg font-semibold tracking-tight">Nueva firma</h2>
        <Link href="/consultoria/produccion" className={ENLACE_VOLVER}>
          Volver a Producción
        </Link>
      </div>
      {deSerie.companias ? (
        <section className={`${TARJETA} text-sm text-tenue`}>
          No tienes compañías guardadas, y una firma no se puede apuntar sin la suya.{' '}
          <Link href="/consultoria/ajustes#companias" className="font-medium text-acento underline-offset-4 hover:underline">
            Añádelas en Ajustes
          </Link>
          .
        </section>
      ) : (
        <FormularioFirma
          contexto={contexto}
          clientes={clientes}
          productosUsados={productos}
          hoy={hoyEnMadrid()}
          clienteInicial={typeof cliente === 'string' ? cliente : null}
          madres={todas.pendiente ? [] : madresPosibles(todas.filas)}
        />
      )}
    </div>
  );
}
