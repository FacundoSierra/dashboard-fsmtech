import type { Metadata } from 'next';
import FaltaMigracion from '@/components/consultoria/FaltaMigracion';
import ListaClientesConsultoria from '@/components/consultoria/ListaClientesConsultoria';
import { clientesConsultoria } from '@/lib/consultoria/consultas';
import { hoyEnMadrid } from '@/lib/consultoria/reglas';
import { exigirConsultoria } from '@/lib/consultoria/sesion';

export const metadata: Metadata = { title: 'Clientes' };

/** La cartera de la consultoría, con su buscador sobre lo cargado */
export default async function ClientesConsultoriaPage() {
  const acceso = await exigirConsultoria();
  if ('pendiente' in acceso) return <FaltaMigracion migracion={acceso.falta} />;

  const { clientes, pendiente, falta } = await clientesConsultoria(acceso.consultor.id);
  if (pendiente) return <FaltaMigracion migracion={falta} />;

  return <ListaClientesConsultoria clientes={clientes} hoy={hoyEnMadrid()} />;
}
