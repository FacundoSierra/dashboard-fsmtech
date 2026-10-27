import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AccionesHerramienta from '@/components/consultoria/AccionesHerramienta';
import { ENLACE_VOLVER } from '@/components/consultoria/estilos';
import FaltaMigracion from '@/components/consultoria/FaltaMigracion';
import FichaHerramienta from '@/components/consultoria/FichaHerramienta';
import { madresPosibles, nombreDeCompania } from '@/components/consultoria/formato';
import { clientesConsultoria, contextoDeReglas, herramienta, movimientosDeHucha, produccion, productosUsados } from '@/lib/consultoria/consultas';
import { hoyEnMadrid } from '@/lib/consultoria/reglas';
import { exigirConsultoria } from '@/lib/consultoria/sesion';

// Sin el cliente ni el producto en el título: la pestaña del navegador y el historial no los guardan
export const metadata: Metadata = { title: 'Herramienta' };

/**
 * Una herramienta: verla, cambiarla, anularla (con su extorno) o borrarla. Para cambiarla, también las
 * herramientas de las que puede colgar si es una APEX (las de todos: al cambiarla se puede cambiar de cliente)
 */
export default async function HerramientaPage({ params }: PageProps<'/consultoria/produccion/[id]'>) {
  const acceso = await exigirConsultoria();
  if ('pendiente' in acceso) return <FaltaMigracion migracion={acceso.falta} />;
  const { consultor } = acceso;
  const { id } = await params;

  const [encontrada, { contexto }, { clientes }, { productos }, hucha, todas] = await Promise.all([
    herramienta(consultor.id, id),
    contextoDeReglas(consultor.id),
    clientesConsultoria(consultor.id),
    productosUsados(consultor.id),
    movimientosDeHucha(consultor.id),
    produccion(consultor.id),
  ]);
  if (encontrada.pendiente) return <FaltaMigracion migracion={encontrada.falta} />;
  const h = encontrada.herramienta;
  if (!h) notFound();

  const hoy = hoyEnMadrid();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-5 px-1">
        <Link href="/consultoria/produccion" className={ENLACE_VOLVER}>
          Producción
        </Link>
        <Link href={`/consultoria/clientes/${h.clienteId}`} className={ENLACE_VOLVER}>
          Ficha del cliente
        </Link>
      </div>
      <FichaHerramienta herramienta={h} compania={nombreDeCompania(h.compania, contexto.companias)} hoy={hoy} />
      <AccionesHerramienta
        herramienta={h}
        contexto={contexto}
        clientes={clientes}
        productosUsados={productos}
        movimientosHucha={hucha.movimientos.map((m) => ({ fecha: m.fecha, importe: m.importe }))}
        madres={madresPosibles(todas.filas, h.aportacionDe)}
        hoy={hoy}
      />
    </div>
  );
}
