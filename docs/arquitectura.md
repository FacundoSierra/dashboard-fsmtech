# Arquitectura

## Flujo de datos

```
Bóveda local (Obsidian + Claude Code)
   │  tarea programada de Windows: commit, pull y push cada 2 minutos
   ▼
Repo privado de GitHub con las notas  ◀── capturas del panel (API de GitHub)
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

El panel escribe en la bóveda de dos formas y solo de dos: crear capturas en `inbox/` y marcar cobros. Lo segundo está en `docs/economia.md`.

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
- **Token de GitHub:** permisos finos, solo el repo de notas y solo "Contents". El panel solo crea notas en `inbox/`.
- **Sin indexar:** cabecera `X-Robots-Tag`, metadatos `robots` y `robots.txt` con `Disallow: /`.
- **`/api/vigilancia`:** el proxy la deja pasar sin cookie. Se autentica dentro con `Authorization: Bearer <VIGILANCIA_SECRET>` comparado en tiempo constante, falla cerrado (sin secreto de 32 caracteres, nadie entra) y responde 404 sin él. Solo devuelve los avisos a notificar.
- **Token de lectura:** `GITHUB_TOKEN_LECTURA` es solo lectura y distinto de `GITHUB_TOKEN`: si se filtra, no puede tocar las notas.
- **Llamadas a webs:** las URLs salen de las notas; `urlVigilable()` solo deja pasar `http(s)` con dominio, nunca `localhost`, `.local`, `.internal` ni IPs.
