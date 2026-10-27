import type { Metadata } from 'next';
import { unstable_rethrow } from 'next/navigation';
import Aviso from '@/components/consultoria/Aviso';
import PestanasConsultoria from '@/components/consultoria/PestanasConsultoria';
import { Encabezado } from '@/components/ui';
import { exigirConsultoria, type AccesoConsultoria } from '@/lib/consultoria/sesion';

export const metadata: Metadata = { title: { default: 'Consultoría', template: '%s · Consultoría · Dashboard FSMTECH' } };

/**
 * La sección Consultoría (REQ-001): la cartera de OVB, la producción, las liquidaciones y la hucha.
 * La puerta va aquí y en cada página (`exigirConsultoria()`, memorizada por petición): sin sesión, a
 * `/login`. Mientras la base del panel no sea la fuente (`fuenteDesde` nulo, spec 6.2), el aviso de
 * arriba dice que esto es una copia y que aquí no se guarda nada: las acciones lo rechazan.
 */
export default async function ConsultoriaLayout({ children }: LayoutProps<'/consultoria'>) {
  let acceso: AccesoConsultoria | null = null;
  try {
    acceso = await exigirConsultoria();
  } catch (error) {
    // El `redirect('/login')` de la sesión sigue su camino. Si la base no responde, la página vuelve a
    // pedirlo (la misma promesa, por `cache()`) y el fallo lo recoge el `error.tsx` de la sección, que
    // está por debajo de este layout: así sale «No se ha podido leer la consultoría» con sus pestañas
    unstable_rethrow(error);
  }
  const soloCopia = acceso !== null && 'consultor' in acceso && acceso.consultor.fuenteDesde === null;

  return (
    <>
      <Encabezado titulo="Consultoría" subtitulo="La cartera de OVB, la producción, las liquidaciones y la hucha" />
      {soloCopia && (
        <Aviso caja className="-mt-2 mb-5">
          <strong className="font-semibold">Copia de FSM-Finance: aquí todavía no se guarda nada.</strong> Hasta el cambio, las firmas y las
          liquidaciones se siguen apuntando en FSM-Finance.
        </Aviso>
      )}
      <PestanasConsultoria />
      {children}
    </>
  );
}
