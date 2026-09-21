import { calcularAvisos } from '@/lib/avisos';
import { obtenerBovedaParaVigilancia } from '@/lib/boveda/consultas';
import { economia } from '@/lib/economia';
import { hoyMadrid } from '@/lib/fechas';
import { autorizarVigilancia } from '@/lib/vigilancia/acceso';
import { estadoGeneral } from '@/lib/vigilancia/estado';
import { reposLocales } from '@/lib/vigilancia/repos-locales';

/**
 * Lo que consulta la vigilancia horaria de GitHub Actions (`.github/workflows/vigilancia.yml`).
 *
 * Devuelve solo los avisos que merecen notificación, sin datos de clientes más allá del
 * título del aviso: la acción abre una incidencia por cada uno y la cierra cuando
 * desaparece. Sin el secreto responde 404, como si no existiera.
 */
export async function GET(request: Request) {
  const autorizacion = autorizarVigilancia(request);
  if (!autorizacion) return new Response('Not found', { status: 404 });

  const boveda = await obtenerBovedaParaVigilancia(autorizacion);
  const hoy = hoyMadrid();
  const estado = await estadoGeneral(boveda);
  const avisos = calcularAvisos({ estado, economia: economia(boveda, hoy), repos: reposLocales(boveda), hoy });

  return Response.json(
    {
      comprobado: estado.comprobado,
      avisos: avisos
        .filter((aviso) => aviso.notificar)
        .map(({ id, nivel, titulo, detalle }) => ({ id, nivel, titulo, detalle, caida: id.startsWith('web-caida:') })),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
