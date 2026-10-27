import type { Metadata } from 'next';
import FaltaMigracion from '@/components/consultoria/FaltaMigracion';
import PantallaHucha from '@/components/consultoria/PantallaHucha';
import { contextoDeReglas, movimientosDeHucha } from '@/lib/consultoria/consultas';
import { hoyEnMadrid } from '@/lib/consultoria/reglas';
import { exigirConsultoria } from '@/lib/consultoria/sesion';

export const metadata: Metadata = { title: 'Hucha' };

/** La hucha: el saldo, lo que entrará y el libro, con «Reclamar», «Ajuste» y «Saldo de partida» */
export default async function HuchaPage() {
  const acceso = await exigirConsultoria();
  if ('pendiente' in acceso) return <FaltaMigracion migracion={acceso.falta} />;
  const { consultor } = acceso;

  const [hucha, { contexto }] = await Promise.all([movimientosDeHucha(consultor.id), contextoDeReglas(consultor.id)]);
  if (hucha.pendiente) return <FaltaMigracion migracion={hucha.falta} />;

  return <PantallaHucha hucha={hucha} hoy={hoyEnMadrid()} pctIrpf={contexto.ajustes.pctIrpf} />;
}
