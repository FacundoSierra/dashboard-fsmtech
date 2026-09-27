import 'server-only';
import { verificarSesion } from '@/lib/sesion';
import { API_GITHUB, cabecerasGitHub, configGitHub } from './github';

/** Así firma sus commits `.scripts/sincronizar-boveda.ps1`; los del panel empiezan por otra cosa */
const PREFIJO_PC = 'notas: sincronizacion';

/**
 * Cuándo subió el PC notas a GitHub por última vez. Lo que se escribe en el panel llega a
 * Obsidian cuando el PC sincroniza, así que esto dice si va a tardar dos minutos o hasta que
 * se encienda. El PC solo sube cuando hay cambios: una hora sin subir no significa que esté
 * apagado. `null` en local o si GitHub no responde.
 */
export async function ultimaSubidaDelPc(): Promise<string | null> {
  await verificarSesion();
  const github = configGitHub();
  if (process.env.BOVEDA_DIR || !github) return null;

  const respuesta = await fetch(
    `${API_GITHUB}/repos/${github.repo}/commits?sha=${encodeURIComponent(github.rama)}&per_page=30`,
    { headers: cabecerasGitHub(github.token), next: { revalidate: 60, tags: ['boveda'] } },
  );
  if (!respuesta.ok) return null;

  const commits = (await respuesta.json()) as { commit: { message: string; committer: { date: string } | null } }[];
  return commits.find((c) => c.commit.message.startsWith(PREFIJO_PC))?.commit.committer?.date ?? null;
}
