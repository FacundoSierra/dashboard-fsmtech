/**
 * Vigilancia horaria: pregunta al panel qué avisos hay y los refleja como incidencias
 * (issues) de este repo. GitHub avisa de cada incidencia nueva en el móvil y por correo.
 *
 *  - Aviso nuevo            → abre una incidencia con las etiquetas `vigilancia` y su nivel
 *  - Aviso que desaparece   → comenta que se ha resuelto y la cierra
 *  - Caída de una web       → además lleva la etiqueta `caida`; el panel calcula la
 *                             disponibilidad con sus fechas de apertura y cierre
 *  - Primera ejecución      → abre y cierra una incidencia `vigilancia-inicio`: desde ahí
 *                             el panel da los días por vigilados
 *
 * Si el panel no responde, abre una incidencia propia y NO cierra ninguna otra: sin datos
 * no se puede saber si una caída se ha arreglado.
 *
 * Lo lanza `.github/workflows/vigilancia.yml`. Variables: VIGILANCIA_URL, VIGILANCIA_SECRET,
 * GITHUB_TOKEN y GITHUB_REPOSITORY (las dos últimas las pone Actions).
 *
 * Con VIGILANCIA_SIMULACRO=1 lee todo pero no escribe nada en GitHub: dice qué haría.
 */

const { VIGILANCIA_URL, VIGILANCIA_SECRET, GITHUB_TOKEN, GITHUB_REPOSITORY } = process.env;
const SIMULACRO = process.env.VIGILANCIA_SIMULACRO === '1';
if (SIMULACRO) console.log('SIMULACRO: no se escribe nada en GitHub');
const API = 'https://api.github.com';

if (!VIGILANCIA_URL || !VIGILANCIA_SECRET) {
  // Sin configurar todavía: no es un error, para que no llegue un correo de fallo cada hora
  console.log('Vigilancia sin configurar: faltan los secretos VIGILANCIA_URL y VIGILANCIA_SECRET. No se hace nada.');
  process.exit(0);
}
if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) {
  console.error('Faltan GITHUB_TOKEN o GITHUB_REPOSITORY');
  process.exit(1);
}

const ETIQUETAS = {
  vigilancia: { color: '6e7781', description: 'Abierta por la vigilancia horaria del panel' },
  caida: { color: 'd03b3b', description: 'Una web no respondía' },
  critico: { color: 'd03b3b', description: 'Aviso crítico' },
  grave: { color: 'ec835a', description: 'Aviso importante' },
  aviso: { color: 'fab219', description: 'Aviso' },
  'vigilancia-inicio': { color: '0ca30c', description: 'Primera ejecución de la vigilancia' },
};

const marca = (id) => `<!-- vigilancia:id=${id} -->`;
const RE_MARCA = /<!-- vigilancia:id=([^\s>]+) -->/;

async function github(ruta, opciones = {}) {
  if (SIMULACRO && opciones.method && opciones.method !== 'GET') {
    console.log(`  [simulacro] ${opciones.method} ${ruta} ${opciones.body ?? ''}`.slice(0, 240));
    // Lo mínimo para que el resto del script siga como si hubiera escrito
    return { number: 0, title: JSON.parse(opciones.body ?? '{}').title ?? '' };
  }
  const respuesta = await fetch(`${API}${ruta}`, {
    ...opciones,
    headers: {
      authorization: `Bearer ${GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(opciones.body ? { 'content-type': 'application/json' } : {}),
    },
  });
  if (!respuesta.ok && respuesta.status !== 422) {
    throw new Error(`GitHub ${opciones.method ?? 'GET'} ${ruta}: ${respuesta.status} ${await respuesta.text()}`);
  }
  return respuesta.status === 204 ? null : respuesta.json();
}

const repo = `/repos/${GITHUB_REPOSITORY}`;

async function asegurarEtiquetas() {
  for (const [name, datos] of Object.entries(ETIQUETAS)) {
    // 422 = ya existe
    await github(`${repo}/labels`, { method: 'POST', body: JSON.stringify({ name, ...datos }) });
  }
}

async function abiertas() {
  const lista = await github(`${repo}/issues?labels=vigilancia&state=open&per_page=100`);
  return new Map(
    lista
      .map((issue) => [issue.body?.match(RE_MARCA)?.[1], issue])
      .filter(([id]) => Boolean(id)),
  );
}

async function abrir({ id, nivel, titulo, detalle, caida }) {
  const cuerpo = [
    detalle ?? '',
    '',
    `Detectado por la vigilancia horaria a las ${new Date().toISOString().slice(11, 16)} UTC. Se cerrará sola cuando se resuelva.`,
    '',
    'Panel: https://dashboard.facundosmtech.com/estado',
    '',
    marca(id),
  ].join('\n');
  const etiquetas = ['vigilancia', nivel, ...(caida ? ['caida'] : [])].filter((e) => e in ETIQUETAS);
  const issue = await github(`${repo}/issues`, {
    method: 'POST',
    body: JSON.stringify({ title: titulo, body: cuerpo, labels: etiquetas }),
  });
  console.log(`Abierta #${issue.number}: ${titulo}`);
}

async function cerrar(issue, motivo) {
  await github(`${repo}/issues/${issue.number}/comments`, { method: 'POST', body: JSON.stringify({ body: motivo }) });
  await github(`${repo}/issues/${issue.number}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
  });
  console.log(`Cerrada #${issue.number}: ${issue.title}`);
}

async function marcarInicio() {
  const previas = await github(`${repo}/issues?labels=vigilancia-inicio&state=all&per_page=1`);
  if (previas.length) return;
  const issue = await github(`${repo}/issues`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Vigilancia en marcha',
      body: 'Primera ejecución de la vigilancia horaria. Desde este momento el panel cuenta la disponibilidad de las webs.',
      labels: ['vigilancia-inicio'],
    }),
  });
  await github(`${repo}/issues/${issue.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) });
  console.log('Marcado el inicio de la vigilancia');
}

async function consultarPanel() {
  const respuesta = await fetch(VIGILANCIA_URL, {
    headers: { authorization: `Bearer ${VIGILANCIA_SECRET}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!respuesta.ok) throw new Error(`El panel respondió ${respuesta.status}`);
  const datos = await respuesta.json();
  if (!Array.isArray(datos.avisos)) throw new Error('Respuesta del panel sin lista de avisos');
  return datos.avisos;
}

const hora = () => new Date().toISOString().slice(11, 16);

async function principal() {
  await asegurarEtiquetas();
  const actuales = await abiertas();

  let avisos;
  try {
    avisos = await consultarPanel();
  } catch (error) {
    console.error(`No se pudo consultar el panel: ${error.message}`);
    if (!actuales.has('panel')) {
      await abrir({
        id: 'panel',
        nivel: 'critico',
        titulo: 'El panel de vigilancia no responde',
        detalle: `${error.message}. Mientras no responda no se comprueban las webs.`,
      });
    }
    // Sin datos no se cierra nada: no se sabe si las caídas se han arreglado
    return;
  }

  await marcarInicio();

  if (actuales.has('panel')) await cerrar(actuales.get('panel'), `El panel vuelve a responder (${hora()} UTC).`);

  const vigentes = new Set(avisos.map((a) => a.id));
  for (const aviso of avisos) {
    if (!actuales.has(aviso.id)) await abrir(aviso);
  }
  for (const [id, issue] of actuales) {
    if (id !== 'panel' && !vigentes.has(id)) await cerrar(issue, `Resuelto: la vigilancia ya no lo detecta (${hora()} UTC).`);
  }

  console.log(`Vigilancia: ${avisos.length} avisos para notificar`);
}

// Se termina saliendo de la función, no con process.exit(): cortar el proceso con una
// petición de red a medio cerrar hace fallar a Node en Windows
await principal();
