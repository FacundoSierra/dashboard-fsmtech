import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import FaltaMigracion from '@/components/consultoria/FaltaMigracion';
import FichaClienteConsultoria from '@/components/consultoria/FichaClienteConsultoria';
import { contextoDeReglas, fichaDeCliente } from '@/lib/consultoria/consultas';
import { hoyEnMadrid } from '@/lib/consultoria/reglas';
import { exigirConsultoria } from '@/lib/consultoria/sesion';

// Sin el nombre del cliente en el título: la pestaña del navegador y el historial no lo guardan
export const metadata: Metadata = { title: 'Cliente' };

/** Un cliente de la consultoría: sus datos, sus herramientas y sus extornos */
export default async function ClienteConsultoriaPage({ params }: PageProps<'/consultoria/clientes/[id]'>) {
  const acceso = await exigirConsultoria();
  if ('pendiente' in acceso) return <FaltaMigracion migracion={acceso.falta} />;
  const { consultor } = acceso;
  const { id } = await params;

  const [{ ficha, pendiente, falta }, { contexto }] = await Promise.all([fichaDeCliente(consultor.id, id), contextoDeReglas(consultor.id)]);
  if (pendiente) return <FaltaMigracion migracion={falta} />;
  if (!ficha) notFound();

  return <FichaClienteConsultoria ficha={ficha} companias={contexto.companias} hoy={hoyEnMadrid()} />;
}
