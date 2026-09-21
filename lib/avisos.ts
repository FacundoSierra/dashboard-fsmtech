import 'server-only';
import type { NivelEstado } from '@/components/ui';
import { diasEntre } from '@/lib/fechas';
import { hrefNota } from '@/lib/rutas';
import { nombreMes, type Economia } from './economia';
import type { EstadoGeneral } from './vigilancia/estado';
import type { ReposLocales } from './vigilancia/repos-locales';
import { LENTA_MS, diasHasta, seRenuevaSolo } from './vigilancia/webs';

export type NivelAviso = 'critico' | 'grave' | 'aviso' | 'info';

export interface Aviso {
  /** Estable entre comprobaciones: la vigilancia lo usa para abrir y cerrar incidencias */
  id: string;
  nivel: NivelAviso;
  titulo: string;
  detalle?: string;
  href?: string;
  /** Si merece un aviso al móvil fuera del panel */
  notificar: boolean;
}

const ORDEN: Record<NivelAviso, number> = { critico: 0, grave: 1, aviso: 2, info: 3 };

export const NIVEL_ESTADO: Record<NivelAviso, NivelEstado> = {
  critico: 'critico',
  grave: 'grave',
  aviso: 'aviso',
  info: 'neutro',
};

/** Meses de diferencia entre dos `YYYY-MM` */
function mesesEntre(desde: string, hasta: string): number {
  const [a1, m1] = desde.split('-').map(Number);
  const [a2, m2] = hasta.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

function plazo(dias: number): string {
  if (dias < 0) return `caducó hace ${-dias} ${dias === -1 ? 'día' : 'días'}`;
  if (dias === 0) return 'caduca hoy';
  return `caduca en ${dias} ${dias === 1 ? 'día' : 'días'}`;
}

export function calcularAvisos({
  estado,
  economia,
  repos,
  hoy,
}: {
  estado: EstadoGeneral;
  economia?: Economia;
  repos?: ReposLocales | null;
  hoy: string;
}): Aviso[] {
  const avisos: Aviso[] = [];
  // Todo respecto al momento de la comprobación
  const ahora = new Date(estado.comprobado).getTime();

  for (const { proyecto, web, certificado, dominio, supabase, repo } of estado.proyectos) {
    const slug = proyecto.nota.nombre;
    const nombre = proyecto.nota.titulo.split(' — ')[0];
    const enlace = hrefNota(proyecto.nota.ruta);

    if (web && !web.responde) {
      avisos.push({ id: `web-caida:${slug}`, nivel: 'critico', titulo: `${nombre}: la web no responde`, detalle: web.error, href: '/estado', notificar: true });
    } else if (web?.ms && web.ms > LENTA_MS) {
      avisos.push({ id: `web-lenta:${slug}`, nivel: 'aviso', titulo: `${nombre}: la web va lenta`, detalle: `Tarda ${(web.ms / 1000).toFixed(1)} s en responder`, href: '/estado', notificar: false });
    }

    if (certificado) {
      const dias = diasHasta(certificado.validoHasta, ahora);
      if (dias !== undefined && dias < 30) {
        avisos.push({
          id: `ssl:${slug}`,
          nivel: dias < 0 ? 'critico' : dias < 14 ? 'grave' : 'aviso',
          titulo: `${nombre}: el certificado SSL ${plazo(dias)}`,
          detalle: seRenuevaSolo(certificado.emisor)
            ? 'Si caduca, el navegador avisa de que el sitio no es seguro. Este tipo se renueva solo: si no lo ha hecho, revisa el alojamiento'
            : `Si caduca, el navegador avisa de que el sitio no es seguro. Es un certificado de ${certificado.emisor ?? 'un proveedor'}, que no se renueva solo: hay que renovarlo en el proveedor`,
          href: '/estado',
          notificar: dias < 14,
        });
      } else if (!certificado.valido && web?.responde) {
        avisos.push({ id: `ssl:${slug}`, nivel: 'grave', titulo: `${nombre}: problema con el certificado SSL`, detalle: certificado.error, href: '/estado', notificar: true });
      }
    }

    if (dominio?.caduca) {
      const dias = diasHasta(dominio.caduca, ahora)!;
      if (dias < 60) {
        avisos.push({
          id: `dominio:${slug}`,
          nivel: dias < 0 ? 'critico' : dias < 30 ? 'grave' : 'aviso',
          titulo: `${nombre}: el dominio ${dominio.nombre} ${plazo(dias)}`,
          detalle: 'Si caduca, la web y el correo dejan de funcionar. Confirma que el cliente lo renueva',
          href: '/economia#renovaciones',
          notificar: dias < 30,
        });
      }
    }

    if (supabase && !supabase.activa) {
      avisos.push({
        id: `supabase:${slug}`,
        nivel: 'critico',
        titulo: `${nombre}: la base de datos no responde`,
        detalle: supabase.sinDominio
          ? 'Su dirección no resuelve, ni al reintentar. Si sigue así en la próxima comprobación, el proyecto de Supabase puede haberse borrado'
          : `${supabase.error ?? 'Sin respuesta'}. Puede estar pausada: en el plan gratuito, Supabase las pausa tras una semana sin uso`,
        href: '/estado',
        notificar: true,
      });
    }

    if (repo?.despliegue && ['critico', 'grave', 'aviso'].includes(repo.despliegue.nivel)) {
      avisos.push({
        id: `despliegue:${slug}`,
        nivel: repo.despliegue.nivel === 'critico' ? 'critico' : repo.despliegue.nivel === 'grave' ? 'grave' : 'aviso',
        titulo: `${nombre}: ${repo.despliegue.texto.toLowerCase()}`,
        detalle: repo.despliegue.detalle,
        href: repo.despliegue.url ?? '/estado',
        notificar: repo.despliegue.nivel === 'critico',
      });
    }

    if (repo?.pruebas?.nivel === 'critico') {
      avisos.push({ id: `pruebas:${slug}`, nivel: 'grave', titulo: `${nombre}: pruebas en rojo`, detalle: repo.pruebas.detalle, href: repo.pruebas.url ?? '/estado', notificar: false });
    }

    if (repo?.alertas) {
      const serias = repo.alertas.criticas + repo.alertas.altas;
      if (serias > 0) {
        avisos.push({
          id: `seguridad:${slug}`,
          nivel: repo.alertas.criticas > 0 ? 'critico' : 'grave',
          titulo: `${nombre}: ${serias} ${serias === 1 ? 'vulnerabilidad seria' : 'vulnerabilidades serias'} en dependencias`,
          detalle: 'Alertas de Dependabot abiertas. Revisa si afectan al código que se despliega',
          href: `${repo.url}/security/dependabot`,
          notificar: repo.alertas.criticas > 0,
        });
      } else if (repo.alertas.medias > 0) {
        avisos.push({ id: `seguridad:${slug}`, nivel: 'aviso', titulo: `${nombre}: ${repo.alertas.medias} alertas de seguridad medias`, href: `${repo.url}/security/dependabot`, notificar: false });
      }
    }

    if (repo && !repo.accesible) {
      avisos.push({ id: `github:${slug}`, nivel: 'info', titulo: `${nombre}: sin datos de GitHub`, detalle: repo.motivo, href: enlace, notificar: false });
    }
  }

  for (const renovacion of economia?.renovaciones ?? []) {
    const dias = diasEntre(hoy, renovacion.fecha);
    if (dias < 45) {
      avisos.push({
        id: `renovacion:${renovacion.origen}:${renovacion.fecha}`,
        nivel: dias < 0 ? 'grave' : dias < 15 ? 'grave' : 'aviso',
        titulo: `${renovacion.concepto}: ${dias < 0 ? `venció hace ${-dias} días` : dias === 0 ? 'vence hoy' : `vence en ${dias} días`}`,
        href: '/economia#renovaciones',
        notificar: dias >= 0 && dias < 15,
      });
    }
  }

  // Cobros atrasados: no van al móvil, se ven en el panel y se marcan desde Economía
  for (const { cliente, cobro } of economia?.atrasados ?? []) {
    const mesesTarde = mesesEntre(cobro.mes, hoy.slice(0, 7));
    avisos.push({
      id: `cobro:${cliente.nota.nombre}:${cobro.mes}:${cobro.concepto.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      nivel: mesesTarde >= 2 ? 'grave' : 'aviso',
      titulo: `${cliente.nota.titulo}: ${nombreMes(cobro.mes, true)} sin cobrar (${cobro.importe.toLocaleString('es-ES')} €)`,
      detalle: cobro.concepto,
      href: `/economia#cliente-${cliente.nota.nombre}`,
      notificar: false,
    });
  }

  for (const local of repos?.repos ?? []) {
    if (local.sinSubir) {
      avisos.push({
        id: `sin-subir:${local.nombre}`,
        nivel: 'info',
        titulo: `${local.nombre}: ${local.sinSubir} ${local.sinSubir === 1 ? 'commit' : 'commits'} sin subir`,
        detalle: `En la rama ${local.rama ?? 'actual'} del PC`,
        href: '/estado#repos-locales',
        notificar: false,
      });
    }
  }

  if (estado.github === 'sin-token') {
    avisos.push({
      id: 'config:github',
      nivel: 'info',
      titulo: 'Falta el token de lectura de GitHub',
      detalle: 'Sin él no se ven despliegues, pruebas ni alertas de seguridad',
      href: '/estado#configuracion',
      notificar: false,
    });
  }

  return avisos.sort((a, b) => ORDEN[a.nivel] - ORDEN[b.nivel]);
}
