import FaltaMigracion from '@/components/consultoria/FaltaMigracion';
import PantallaResumen from '@/components/consultoria/PantallaResumen';
import { contextoDeReglas, resumenConsultoria } from '@/lib/consultoria/consultas';
import { hoyEnMadrid } from '@/lib/consultoria/reglas';
import { exigirConsultoria } from '@/lib/consultoria/sesion';

/** El Resumen de la consultoría: este mes y el siguiente, la hucha, el nivel, los cierres y las barras */
export default async function ConsultoriaPage() {
  const acceso = await exigirConsultoria();
  if ('pendiente' in acceso) return <FaltaMigracion migracion={acceso.falta} />;
  const { consultor } = acceso;
  const hoy = hoyEnMadrid();

  const [resumen, { contexto }] = await Promise.all([resumenConsultoria(consultor.id, hoy), contextoDeReglas(consultor.id)]);
  if (resumen.pendiente) return <FaltaMigracion migracion={resumen.falta} />;

  return <PantallaResumen resumen={resumen} hoy={hoy} pctIrpf={contexto.ajustes.pctIrpf} />;
}
