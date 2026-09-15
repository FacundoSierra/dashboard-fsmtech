# Arquitectura

## Flujo de datos

```
Bóveda local (Obsidian + Claude Code)
   │  tarea programada de Windows: commit y push cada 15 minutos
   ▼
Repo privado de GitHub con las notas
   │  API de GitHub con token de solo lectura
   ▼
Este panel en Vercel → dashboard.facundosmtech.com
```

En desarrollo, `BOVEDA_DIR` apunta a la carpeta de la bóveda y las notas se leen del disco.

## Lectura de notas (`lib/boveda/fuente.ts`)
- **Árbol del repo:** `GET /repos/{repo}/git/trees/{rama}?recursive=1`, en caché 60 segundos (etiqueta `boveda`). Un cambio subido aparece en el panel como mucho un minuto después.
- **Contenido:** `GET /repos/{repo}/git/blobs/{sha}`, en caché sin caducidad. Un SHA siempre tiene el mismo contenido, así que solo se descargan las notas que han cambiado.
- **Qué se lee:** solo `.md`. Quedan fuera las carpetas que empiezan por punto (`.obsidian`, `.claude`, `.scripts`…), `templates/` y el `CLAUDE.md` de la raíz.

## Análisis (`lib/boveda/parser.ts`)
- **Frontmatter:** YAML 1.2, así que las fechas quedan como texto `YYYY-MM-DD`.
- **Comentarios:** se quitan los de Obsidian (`%% %%`).
- **Secciones:** se dividen por títulos. `contenidoSeccion()` incluye las subsecciones y busca sin tildes ni emojis ("🎯 Objetivos" coincide con `objetivos`).
- **Extracción:** tareas `- [ ]` / `- [x]` con su nivel de sangría, viñetas, `[[enlaces]]` (también desde las propiedades) y `#etiquetas`.
- **Markdown:** `components/markdown.tsx` convierte los enlaces, incrustaciones y avisos (`> [!note]`) de Obsidian a Markdown estándar.

## Convenciones de la bóveda que usa el panel

| Pantalla | De dónde sale |
|---|---|
| Hoy: objetivos | `daily-notes/YYYY-MM-DD.md` de hoy (hora de Madrid), sección "Objetivos"; el progreso cuenta solo las tareas de primer nivel |
| Hoy: pendientes anteriores | Objetivos sin marcar de las dailies de los 14 días anteriores que no se repiten en la de hoy |
| Hoy: completado | Tareas marcadas de la sección "Completado" de hoy |
| Hoy: urgente | Tareas abiertas de proyectos activos con 🚨, "urgente" o `#prioridad/alta` |
| Clientes | Notas con `tipo: cliente` |
| Clientes: proyectos | Propiedad `cliente` de los proyectos |
| Clientes: contactos | Propiedad `empresa` de las personas o enlaces en la sección "Contactos" |
| Clientes: ideas | "Oportunidades / ideas" de sus contactos, y las ideas de las dailies que enlazan al cliente o a sus proyectos |
| Proyectos | `tipo: proyecto`: `estado`, `cliente`, `stack`, `web` (o la línea `Web:` del cuerpo), `remoto` y tareas de "Próximos pasos" |
| Reuniones | `tipo: reunion`: `fecha`, `hora`, `cliente`, `proyectos` y tareas abiertas de la nota |
| Requerimientos pendientes | `tipo: requerimiento` con `estado` distinto de `hecho` y `descartado` |

## Seguridad
- **Proxy (`proxy.ts`):** comprobación optimista. Sin cookie válida, todo redirige a `/login` salvo `robots.txt` y los estáticos de Next.
- **Capa de acceso a datos (`lib/sesion.ts`):** `obtenerBoveda()` llama a `verificarSesion()` antes de leer ninguna nota. Una página nueva no puede devolver notas sin sesión aunque el proxy no la cubra.
- **Cookie `sesion_panel`:**
  - Formato `v1.<expira>.<HMAC-SHA256>`.
  - `HttpOnly`, `SameSite=Lax` y `Secure` en producción; dura 30 días.
  - Cambiar `DASHBOARD_SECRET` cierra todas las sesiones. Cambiar solo la contraseña no las cierra.
- **Contraseña:** se compara en tiempo constante, con 1 segundo de espera tras cada fallo.
- **Falla cerrado:** sin `DASHBOARD_PASSWORD`, o sin un `DASHBOARD_SECRET` de 32 caracteres o más, no se puede entrar.
- **Sin indexar:** cabecera `X-Robots-Tag`, metadatos `robots` y `robots.txt` con `Disallow: /`.
