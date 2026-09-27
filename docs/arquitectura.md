# Arquitectura

## Flujo de datos

```
Móvil (Obsidian) ⇄ Obsidian Sync ⇄ Bóveda local del PC (Obsidian + Claude Code)
   │  tarea programada de Windows: commit, pull y push cada 2 minutos
   ▼
Repo privado de GitHub con las notas  ◀── escrituras del panel (API de GitHub)
   │  API de GitHub
   ▼
Este panel en Vercel → dashboard.facundosmtech.com
```

En desarrollo, `BOVEDA_DIR` apunta a la carpeta de la bóveda: las notas se leen y se escriben en el disco.

## Lectura de notas (`lib/boveda/fuente.ts`)
- **Árbol del repo:** `GET /repos/{repo}/git/trees/{rama}?recursive=1`, en caché 60 segundos con la etiqueta `boveda`. Un cambio subido aparece en el panel como mucho un minuto después.
- **Contenido:** `GET /repos/{repo}/git/blobs/{sha}`, en caché sin caducidad. Un SHA siempre tiene el mismo contenido, así que solo se descargan las notas que han cambiado.
- **Qué se lee:** solo `.md`. Quedan fuera las carpetas que empiezan por punto (`.obsidian`, `.claude`, `.scripts`…), `templates/` y el `CLAUDE.md` de la raíz.

## Escritura

El panel solo escribe lo que está en esta tabla (`lib/boveda/escritura.ts`). Cada escritura está acotada a un tipo de nota por su ruta, a una sección y a una forma de línea, y ninguna borra una nota ni la reescribe entera:

| Escritura | Dónde | Qué cambia | Desde |
|---|---|---|---|
| `crearNotaInbox` | `inbox/<nombre>.md`, nueva | Crea la nota; nunca sobrescribe | Capturar |
| `crearDiaria` | `daily-notes/AAAA-MM-DD.md`, nueva | Crea la del día; nunca sobrescribe | Hoy, al añadir un objetivo sin diaria |
| `marcarTarea` | Diaria, «🎯 Objetivos» o «⏳ A la espera» | Solo la casilla de una línea | Hoy |
| `anadirObjetivo` | Diaria, «🎯 Objetivos» | Una línea nueva al final | Hoy |
| `moverTarea` | Diaria, entre «🎯 Objetivos» y «⏳ A la espera» | Mueve una tarea de primer nivel con sus hijas | Hoy |
| `marcarCobro` | Nota de cobros, «Cobros» | La casilla y la fecha de cobro | Economía |
| `anadirCobroExtra` | Nota de cobros, «Cobros» | Una línea nueva, ya cobrada | Economía |
| `anadirRenovacion` | Ficha de cliente, «Renovaciones» | Una línea nueva | Economía |

Garantías comunes:

- **La línea tiene que seguir igual.** Las que se marcan o se mueven se buscan tal cual se pintaron en la página y solo dentro de su sección. Si ya no están (porque se cambiaron en Obsidian), no se toca nada y la página pide recargar.
- **Las secciones se buscan por su título exacto**, sin emojis ni tildes: «Cobros de VM Propiedades», el título de la nota, no es la sección «Cobros». Si la nota no tiene la sección, se dice en vez de inventarla.
- **Las líneas nuevas van al final de su sección**, en la viñeta vacía de la plantilla si la tiene.
- **El texto escrito en el panel se limpia:** sin saltos de línea (partirían la viñeta) ni `%%` (en Obsidian abriría un comentario que escondería el resto de la nota).
- **En producción**, `GET` de la nota y `PUT /repos/{repo}/contents/{ruta}` con su `sha`: si la nota cambia entre leer y escribir, GitHub responde 409 y no se escribe. Las notas nuevas se crean sin `sha`, de modo que si ya existen GitHub responde 422.
- **Se respetan los saltos de línea** de cada nota (las del PC van con los de Windows), y si un cambio no cambia nada no se hace commit.
- **Cada Server Action** llama a `verificarSesion()` al empezar, valida lo que llega (los tipos de TypeScript no viajan en la petición) y, al terminar, `updateTag('boveda')`, de modo que la página se pinta ya con el cambio.
- **Interfaz optimista** en las casillas y al mover tareas: cambian al instante y, si la escritura falla, vuelven como estaban y lo dicen.

### Marcar un objetivo: en su sitio, no en «Completado»

La casilla cambia donde está en vez de mover la línea a «✅ Completado», a propósito. Claude apunta en «Completado» desde el PC a menudo, y dos líneas añadidas a la vez al final de la misma sección, una en el PC y otra en GitHub, hacen chocar la sincronización. Una casilla que cambia en su sitio es un cambio de un carácter en una línea que el PC casi nunca toca.

### La diaria desde el panel (`lib/boveda/diaria.ts`)

Si se apunta un objetivo y la diaria de hoy aún no existe (el PC está apagado), el panel la crea **igual que `.scripts/nota-diaria.ps1`**: la plantilla con lo que quedó sin marcar en «Objetivos» y «A la espera» de la última diaria, los repos con commits sin subir, las reuniones del día y el enlace a la anterior, con saltos de Windows. Comprobado contra el script con la misma bóveda: sale idéntica. Si cambia cómo se monta, hay que cambiarlo en los dos sitios.

Al revés, el script del PC mira antes en GitHub: si el panel ya creó la diaria de hoy, la trae con la sincronización en vez de crear otra, porque dos notas nuevas con el mismo nombre, una en cada lado, pararían la sincronización.

### Si la sincronización del PC choca

Si la misma nota cambia a la vez en el PC y en GitHub, el `pull --rebase` de `.scripts/sincronizar-boveda.ps1` choca, se cancela y la sincronización se queda parada hasta que se arregle a mano. Para que no pase en silencio, el script deja un aviso en `inbox/sincronizacion-atascada.md` con las notas que chocan. GitHub no lo recibe (está parado), pero **Obsidian Sync lo lleva al móvil**. Cuando vuelve a funcionar, el aviso se borra solo.

En la página de Hoy, debajo de los objetivos, sale cuándo subió el PC por última vez (`lib/boveda/sincronizacion.ts`, el último commit `notas: sincronizacion`). Lo que se escribe en el panel llega a Obsidian cuando el PC sincroniza, así que eso dice si tardará dos minutos o hasta que se encienda. El PC solo sube cuando hay cambios: una hora sin subir no significa que esté apagado.

Los cobros tienen más detalle en `docs/economia.md`.

### Captura rápida (`lib/boveda/escritura.ts` y `lib/boveda/captura.ts`)
- **Qué puede escribir:** solo notas nuevas en `inbox/`. La ruta se valida con `^inbox/[a-z0-9][a-z0-9-]*\.md$` y nunca se sobrescribe una nota existente.
- **En producción:** `PUT /repos/{repo}/contents/{ruta}` sin `sha`, de modo que si la nota ya existe GitHub responde 422. Hace falta un token con "Contents: Read and write". La nota llega a Obsidian con la siguiente sincronización de la bóveda.
- **En local:** se escribe en `BOVEDA_DIR` con la opción `wx`.
- **Después de guardar:** `updateTag('boveda')` caduca el árbol en caché y el inbox muestra la nota al momento.
- **Nombre:** `inbox/YYYY-MM-DD-HHMM-primeras-palabras.md`, con hora de Madrid.
- **Formato:**

```markdown
---
tipo: captura
categoria: tarea
fecha: 2026-09-16
hora: "09:30"
origen: dashboard
relacionado: "[[cjfit-app]]"
---
# Primera línea del texto

- [ ] Primera línea del texto

Resto del texto

## 🔗 Relacionado
- [[cjfit-app]]

#inbox
```

- **Por categoría:**
  - `categoria` puede ser `idea`, `tarea` o `nota`.
  - En las ideas y notas el cuerpo es el texto tal cual.
  - Las ideas llevan además `#idea`.
  - `relacionado` solo aparece si se eligió un proyecto o un cliente que existe.

## Análisis (`lib/boveda/parser.ts`)
- **Frontmatter:** YAML 1.2, así que las fechas quedan como texto `YYYY-MM-DD`.
- **Comentarios:** se quitan los de Obsidian (`%% %%`).
- **Secciones:** se dividen por títulos. `contenidoSeccion()` incluye las subsecciones y busca sin tildes ni emojis ("🎯 Objetivos" coincide con `objetivos`).
- **Extracción:** tareas `- [ ]` / `- [x]` con su nivel de sangría, viñetas, `[[enlaces]]` (también desde las propiedades) y `#etiquetas`.
- **Diccionarios de enlaces:** `rutas` y `titulos` son objetos sin prototipo, para que `[[constructor]]` no resuelva a nada.
- **Markdown:** `components/markdown.tsx` convierte los enlaces, incrustaciones y avisos (`> [!note]`) de Obsidian a Markdown estándar.

## Convenciones de la bóveda que usa el panel

| Pantalla | De dónde sale |
|---|---|
| Hoy: objetivos | `daily-notes/YYYY-MM-DD.md` de hoy (hora de Madrid), sección "Objetivos"; el progreso cuenta solo las tareas de primer nivel |
| Hoy: pendientes anteriores | Objetivos sin marcar de las dailies de los 14 días anteriores que no se repiten en la de hoy |
| Hoy: completado | Tareas marcadas de la sección "Completado" de hoy |
| Hoy: urgente | Tareas abiertas de proyectos activos con 🚨, "urgente" o `#prioridad/alta` |
| Semana | Para cada día: objetivos y "Completado" de su daily, reuniones con esa `fecha` y tareas marcadas en otras notas que empiezan por `YYYY-MM-DD —` |
| Semana: racha | Días seguidos con daily hasta hoy, o hasta ayer si hoy aún no hay |
| Clientes | Notas con `tipo: cliente` |
| Clientes: proyectos | Propiedad `cliente` de los proyectos |
| Clientes: contactos | Propiedad `empresa` de las personas o enlaces en la sección "Contactos" |
| Clientes: ideas | "Oportunidades / ideas" de sus contactos, y las ideas de las dailies que enlazan al cliente o a sus proyectos |
| Proyectos | `tipo: proyecto`: `estado`, `cliente`, `stack`, `web` (o la línea `Web:` del cuerpo), `remoto` y tareas de "Próximos pasos" |
| Reuniones | `tipo: reunion`: `fecha`, `hora`, `cliente`, `proyectos` y tareas abiertas de la nota |
| Inbox | Notas de `inbox/`, las más recientes primero; `categoria`, `fecha`, `hora` y `relacionado` si las tienen |
| Buscar | Todas las palabras de dos letras o más, sin distinguir tildes, en el título, las propiedades, las etiquetas o el texto; el título puntúa más |
| Requerimientos pendientes | `tipo: requerimiento` con `estado` distinto de `hecho` y `descartado` |
| Estado: qué se vigila | Proyectos con `estado: activo`: `web` (o la línea `Web:`), `supabase` (`https://<ref>.supabase.co`) y `remoto` (repo de GitHub) |
| Economía | `tipo: cobros` en `clientes/<cliente>/cobros/<cliente>-cobros-AAAA.md`: propiedad `plan` y casillas de la sección «Cobros». Sección «Renovaciones» de las fichas de cliente. Ver `docs/economia.md` |
| Repos del PC | `dashboards/repos-locales.md`, que escribe `.scripts/estado-repos.ps1` de la bóveda |

## App instalable (PWA)
- **Manifest (`app/manifest.ts`):**
  - nombre, colores e iconos;
  - accesos directos a Apuntar, Buscar y Semana;
  - `share_target`: al compartir desde otra app del móvil se abre `/capturar?titulo=…&texto=…&url=…` con el texto ya escrito.
- **Iconos:** se generan con `ImageResponse` en `app/icon.tsx`, `app/apple-icon.tsx` y `app/iconos/[tamano]` (192 y 512).
- **Sin service worker:** el panel necesita conexión y no guarda notas en el dispositivo.

## Vigilancia

Ver [vigilancia.md](vigilancia.md): qué se comprueba, cachés, avisos, la acción horaria que
abre incidencias en GitHub y los informes mensuales.

## Entrar con huella o cara (passkeys)

WebAuthn con `@simplewebauthn`: Touch ID en el Mac, Windows Hello en el PC y Face ID en el móvil. La llave privada no sale del dispositivo; el panel solo guarda la parte pública, que no sirve para entrar por sí sola.

Como el panel no tiene base de datos, los dispositivos viven en la variable `PASSKEYS` de Vercel (un JSON con `id`, `llave`, `nombre` y `creado`). Al registrar uno en **Ajustes**, el panel devuelve el valor entero para pegar allí; hasta que no se pega y se vuelve a desplegar, ese dispositivo no entra.

| Paso | Ruta | Sesión |
|---|---|---|
| Opciones de registro | `/api/passkeys/registro/opciones` | Sí |
| Comprobar el registro | `/api/passkeys/registro/verificar` | Sí |
| Opciones de entrada | `/api/passkeys/entrar/opciones` | No |
| Comprobar la entrada | `/api/passkeys/entrar/verificar` | No |

Las dos rutas de entrada son las únicas, junto a `/api/vigilancia`, que el proxy deja pasar sin sesión: fallan cerradas (404 si no hay dispositivos) y solo abren sesión si la firma del dispositivo cuadra con el reto, el dominio y la dirección esperados. El reto viaja en una cookie `httpOnly` de cinco minutos limitada a `/api/passkeys`. No se guarda contador de uso: las passkeys que se sincronizan entre dispositivos no lo incrementan.

Para quitar un dispositivo, se borra de `PASSKEYS` y se vuelve a desplegar. La contraseña sigue siendo el respaldo.

## Seguridad
- **Proxy (`proxy.ts`):** comprobación optimista. Sin cookie válida, todo redirige a `/login` salvo lo público y sin datos: estáticos de Next, `robots.txt`, `manifest.webmanifest` e iconos. El navegador pide el manifest y los iconos sin cookies.
- **Capa de acceso a datos (`lib/sesion.ts`):** `obtenerBoveda()` llama a `verificarSesion()` antes de leer ninguna nota. Una página nueva no puede devolver notas sin sesión aunque el proxy no la cubra.
- **Server Actions:** `guardarCaptura` llama a `verificarSesion()` al empezar, valida el tipo y la longitud (5.000 caracteres) y solo enlaza a notas que existen.
- **Cookie `sesion_panel`:**
  - Formato `v1.<expira>.<HMAC-SHA256>`.
  - `HttpOnly`, `SameSite=Lax` y `Secure` en producción; dura 30 días.
  - Cambiar `DASHBOARD_SECRET` cierra todas las sesiones. Cambiar solo la contraseña no las cierra.
- **Contraseña:** se compara en tiempo constante, con 1 segundo de espera tras cada fallo.
- **Falla cerrado:** sin `DASHBOARD_PASSWORD`, o sin un `DASHBOARD_SECRET` de 32 caracteres o más, no se puede entrar.
- **Token de GitHub:** permisos finos, solo el repo de notas y solo "Contents". El panel solo hace las escrituras acotadas de la tabla de «Escritura».
- **Sin indexar:** cabecera `X-Robots-Tag`, metadatos `robots` y `robots.txt` con `Disallow: /`.
- **`/api/vigilancia`:** el proxy la deja pasar sin cookie. Se autentica dentro con `Authorization: Bearer <VIGILANCIA_SECRET>` comparado en tiempo constante, falla cerrado (sin secreto de 32 caracteres, nadie entra) y responde 404 sin él. Solo devuelve los avisos a notificar.
- **Token de lectura:** `GITHUB_TOKEN_LECTURA` es solo lectura y distinto de `GITHUB_TOKEN`: si se filtra, no puede tocar las notas.
- **Llamadas a webs:** las URLs salen de las notas; `urlVigilable()` solo deja pasar `http(s)` con dominio, nunca `localhost`, `.local`, `.internal` ni IPs.
