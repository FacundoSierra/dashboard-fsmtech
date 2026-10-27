import { Estado, type NivelEstado } from '@/components/ui';
import type { EstadoHerramienta as EstadoDeLaHerramienta } from '@/lib/consultoria/reglas';
import { NOMBRE_ESTADO } from './formato';

/**
 * Con el `<Estado>` del panel, icono y texto: cobrada, bien; con incidencia, aviso, porque hay que
 * resolverla antes del cierre; anulada, grave. Prevista, firmada y confirmada, neutras: es lo normal
 * y el texto dice cuál.
 */
const NIVEL: Record<EstadoDeLaHerramienta, NivelEstado> = {
  cobrada: 'bien',
  prevista: 'neutro',
  firmada: 'neutro',
  confirmada: 'neutro',
  incidencia: 'aviso',
  anulada: 'grave',
};

/** El estado de una herramienta */
export default function EstadoHerramienta({ estado }: { estado: EstadoDeLaHerramienta }) {
  return (
    <span className="shrink-0">
      <Estado nivel={NIVEL[estado]}>{NOMBRE_ESTADO[estado]}</Estado>
    </span>
  );
}
