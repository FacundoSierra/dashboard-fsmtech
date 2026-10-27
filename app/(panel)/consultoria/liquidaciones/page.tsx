import type { Metadata } from 'next';
import FaltaMigracion from '@/components/consultoria/FaltaMigracion';
import PantallaLiquidaciones from '@/components/consultoria/PantallaLiquidaciones';
import { contextoDeReglas, cuentaDeComisionesDe, liquidaciones, lineasDelMes, movimientosDeHucha } from '@/lib/consultoria/consultas';
import { CUADRO_VIGENTE } from '@/lib/consultoria/cuadro';
import { hoyEnMadrid } from '@/lib/consultoria/reglas';
import { exigirConsultoria } from '@/lib/consultoria/sesion';
import { mesONulo } from '@/lib/consultoria/validar';

export const metadata: Metadata = { title: 'Liquidaciones' };

/**
 * Las liquidaciones por mes de cobro: `?anio=2026` elige el año y `?mes=2026-11` abre el detalle de
 * ese mes (sin año, el del mes). La cuenta de comisiones va debajo.
 */
export default async function LiquidacionesPage({ searchParams }: PageProps<'/consultoria/liquidaciones'>) {
  const acceso = await exigirConsultoria();
  if ('pendiente' in acceso) return <FaltaMigracion migracion={acceso.falta} />;
  const { consultor } = acceso;
  const parametros = await searchParams;
  const hoy = hoyEnMadrid();

  const abierto = mesONulo(typeof parametros.mes === 'string' ? parametros.mes : undefined);
  const anioPedido = typeof parametros.anio === 'string' && /^\d{4}$/.test(parametros.anio) ? Number(parametros.anio) : null;
  const anio = anioPedido ?? (abierto ? Number(abierto.slice(0, 4)) : Number(hoy.slice(0, 4)));

  const [datos, detalle, cuenta, hucha, { contexto }] = await Promise.all([
    liquidaciones(consultor.id, anio),
    abierto ? lineasDelMes(consultor.id, abierto) : Promise.resolve(null),
    cuentaDeComisionesDe(consultor.id),
    movimientosDeHucha(consultor.id),
    contextoDeReglas(consultor.id),
  ]);
  if (datos.pendiente) return <FaltaMigracion migracion={datos.falta} />;

  return (
    <PantallaLiquidaciones
      datos={datos}
      anio={anio}
      abierto={abierto}
      detalle={detalle}
      cuenta={cuenta}
      pctIrpf={contexto.ajustes.pctIrpf}
      minimoTransferencia={CUADRO_VIGENTE.minimoTransferencia}
      saldoHucha={hucha.saldo}
      hoy={hoy}
    />
  );
}
