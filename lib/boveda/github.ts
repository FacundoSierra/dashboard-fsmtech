import 'server-only';

export const API_GITHUB = 'https://api.github.com';

const RE_REPO = /^[\w.-]+\/[\w.-]+$/;

export interface ConfigGitHub {
  token: string;
  repo: string;
  rama: string;
}

export function configGitHub(): ConfigGitHub | null {
  const { GITHUB_TOKEN: token, GITHUB_REPO: repo, GITHUB_BRANCH: rama = 'main' } = process.env;
  return token && repo && RE_REPO.test(repo) ? { token, repo, rama } : null;
}

export function cabecerasGitHub(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/** `inbox/mi nota.md` → `inbox/mi%20nota.md` */
export function rutaApi(ruta: string): string {
  return ruta.split('/').map(encodeURIComponent).join('/');
}
