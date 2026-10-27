import type { ReactNode } from 'react';
import { Pendiente, Tarjeta } from '@/components/ui';
import type { LoQueFalta } from '@/lib/consultoria/tipos';

const TEXTO: Record<LoQueFalta, { titulo: string; texto: ReactNode }> = {
  configuracion: {
    titulo: 'Falta configurar la base de datos',
    texto: (
      <>
        Pon <code>SUPABASE_URL</code> y la clave secreta de la base en las variables del panel (en Vercel, solo en Production; en el PC,
        en <code>.env.local</code>; los nombres, en <code>.env.example</code>) y vuelve a cargar esta página.
      </>
    ),
  },
  '0001': {
    titulo: 'Falta un paso en la base de datos',
    texto: (
      <>
        Ejecuta la migración <code>0001_consultoria.sql</code> en el editor SQL de Supabase, en el proyecto <code>fsmtech</code>, y vuelve a
        cargar esta página.
      </>
    ),
  },
  copia: {
    titulo: 'La base nueva está vacía',
    texto: (
      <>
        Copia antes los datos de FSM-Finance con <code>npm run consultoria:copiar</code> y vuelve a cargar esta página.
      </>
    ),
  },
};

/**
 * Lo que dice cada página de la consultoría mientras falte algo: la configuración o la copia (de
 * `exigirConsultoria()`) o la migración (el `falta` de la consulta). Sin `migracion`, la 0001
 */
export default function FaltaMigracion({ migracion = '0001' }: { migracion?: LoQueFalta }) {
  const { titulo, texto } = TEXTO[migracion];
  return (
    <Tarjeta>
      <Pendiente titulo={titulo}>
        <p>{texto}</p>
      </Pendiente>
    </Tarjeta>
  );
}
