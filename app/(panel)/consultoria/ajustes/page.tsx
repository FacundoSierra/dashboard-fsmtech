import type { Metadata } from 'next';
import AjustesCompanias from '@/components/consultoria/AjustesCompanias';
import Bloque from '@/components/consultoria/Bloque';
import CuadroVigente from '@/components/consultoria/CuadroVigente';
import FaltaMigracion from '@/components/consultoria/FaltaMigracion';
import FormularioAjustes from '@/components/consultoria/FormularioAjustes';
import FormularioNiveles from '@/components/consultoria/FormularioNiveles';
import { ajustesConsultoria } from '@/lib/consultoria/consultas';
import { exigirConsultoria } from '@/lib/consultoria/sesion';

export const metadata: Metadata = { title: 'Ajustes' };

/**
 * Ajustes de la consultoría: unidades previas, porcentajes, niveles y compañías (editables), y el
 * cuadro de comisiones vigente y los cierres cargados (de solo lectura)
 */
export default async function AjustesConsultoriaPage() {
  const acceso = await exigirConsultoria();
  if ('pendiente' in acceso) return <FaltaMigracion migracion={acceso.falta} />;

  const datos = await ajustesConsultoria(acceso.consultor.id);
  if (datos.pendiente) return <FaltaMigracion migracion={datos.falta} />;

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <h2 className="px-1 text-lg font-semibold tracking-tight">Ajustes</h2>
      <Bloque titulo="Punto de partida y porcentajes" periodo="Lo apuntado no cambia: cada herramienta guarda los suyos">
        <FormularioAjustes ajustes={datos.ajustes} deSerie={datos.deSerie.ajustes} />
      </Bloque>
      <div className="grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-2 xl:items-start">
        <Bloque titulo="Niveles" periodo="Vale el de mayor €/unidad de los alcanzados">
          <FormularioNiveles niveles={datos.niveles} deSerie={datos.deSerie.niveles} />
        </Bloque>
        {/* La cabecera del panel es fija: el ancla deja sitio para que no tape el título */}
        <div id="companias" className="scroll-mt-24">
          <Bloque titulo="Compañías" periodo="Su regla de fechas, su calendario y su reserva">
            <AjustesCompanias companias={datos.companias} deSerie={datos.deSerie.companias} />
          </Bloque>
        </div>
      </div>
      <Bloque titulo="Cuadro de comisiones de OVB" periodo="De solo lectura: un cuadro nuevo es un cambio en el código">
        <CuadroVigente cuadro={datos.cuadro} cierres={datos.cierres} />
      </Bloque>
    </div>
  );
}
