# Vigilancia: estado técnico, avisos e informes

Qué comprueba el panel, de dónde saca cada dato y cómo ponerlo en marcha.

## Qué se comprueba

Solo los proyectos con `estado: activo`. Los pausados no: sus bases de Supabase gratuitas
se pausan solas y darían avisos que no hay que atender.

| Qué | Cómo | Caché | Configuración |
|---|---|---|---|
| **La web responde** | `GET` a la propiedad `web` del proyecto (o la línea `Web:` del cuerpo). Cuenta como viva cualquier respuesta que no sea 5xx ni 404: una web con contraseña (401, 403) está viva. Más de 3 s es «lenta» | 2 min | ninguna |
| **Certificado SSL** | Se lee el certificado por TLS sin validarlo, para poder avisar de uno caducado; si el navegador lo aceptaría queda aparte | 6 h | ninguna |
| **Dominio** | Caducidad por RDAP (`rdap.org`). Los `.com` y `.net` la publican; los `.es` no, y hay que apuntarla a mano (ver [economia.md](economia.md)) | 1 día | ninguna |
| **Base de Supabase** | `GET /auth/v1/health` **sin clave**. Una base activa responde `401 No API key found`: es la pasarela diciendo que el proyecto existe y está encendido. Así no se guarda la clave de ningún proyecto | 2 min | propiedad `supabase` del proyecto: `https://<ref>.supabase.co` |
| **Último cambio, PR y alertas** | API de GitHub | 5 min (alertas 30 min) | `GITHUB_TOKEN_LECTURA` |
| **Despliegue** | Del último commit de la rama principal: el estado que publica Vercel o el *check* de GitHub Actions llamado `deploy` | 5 min | `GITHUB_TOKEN_LECTURA` |
| **Commits sin subir** | La nota `dashboards/repos-locales.md` de la bóveda | — | la escribe la sincronización |
| **Disponibilidad** | Incidencias con la etiqueta `caida` de este repo | 5 min | vigilancia horaria |

Las URLs salen de las notas, así que antes de llamar a nada se filtran: solo `http(s)` y
nunca direcciones internas (`lib/vigilancia/red.ts`).

### Despliegues: por qué desde GitHub

El resultado se lee de GitHub y no de la API de Vercel por dos motivos:

- **Hay dos formas de desplegar.** Vercel publica un estado en cada commit (VM Propiedades,
  Bodegas, el portfolio). CJFIT despliega con GitHub Actions, que deja un *check* `deploy`.
- **No todos los Vercel son de la misma cuenta.** El de CJFIT es de Daniel. Con un token de
  Vercel solo se verían los de Facundo.

En CJFIT, cuando el push lo hace Facundo, el *check* `deploy` sale **cancelado** y el panel
lo enseña como «Despliegue cancelado»: hay que pedirle a Daniel que lo relance.

## Avisos

`lib/avisos.ts` convierte todo lo anterior en una lista ordenada por gravedad (crítico,
importante, aviso, info). Cada aviso tiene un `id` estable (`web-caida:cjfit-app`,
`ssl:pactum`…) y un campo `notificar`: solo los que merecen molestar fuera del panel.

| Crítico | Importante | Aviso | Info |
|---|---|---|---|
| Web caída, base que no responde, despliegue fallido, certificado o dominio caducados, vulnerabilidad crítica | Certificado a menos de 14 días, dominio a menos de 30, despliegue cancelado, pruebas en rojo, vulnerabilidades altas | Web lenta, certificado a menos de 30 días, dominio a menos de 60, renovaciones próximas | Commits sin subir, falta configuración |

## Vigilancia horaria y avisos al móvil

El panel solo mira cuando se abre. Para enterarse de una caída a las tres de la mañana, una
acción de GitHub (`.github/workflows/vigilancia.yml`) pregunta cada hora a
`/api/vigilancia` y refleja los avisos como **incidencias de este repo**:

- Aviso nuevo → abre una incidencia. **GitHub avisa en el móvil y por correo.**
- Aviso que desaparece → la comenta como resuelta y la cierra.
- Caída de web → además lleva la etiqueta `caida`. Con sus fechas de apertura y cierre el
  panel calcula la disponibilidad y la franja de 30 días.
- Primera ejecución → abre y cierra una incidencia `vigilancia-inicio`. Desde ese momento
  los días cuentan como vigilados; antes salen «sin datos», no como buenos.
- Si el panel no responde → abre su propia incidencia y **no cierra ninguna otra**: sin datos
  no se sabe si una caída se ha arreglado.

`/api/vigilancia` no usa la cookie de sesión (el proxy la deja pasar) sino
`Authorization: Bearer <VIGILANCIA_SECRET>`, comparado en tiempo constante. Sin el secreto
responde 404. Solo devuelve los avisos a notificar, y para leer las notas exige la
autorización que da `autorizarVigilancia()` (`lib/vigilancia/acceso.ts`).

**Coste:** cada ejecución gasta 1 minuto de Actions, unos 744 al mes de los 2.000 gratuitos
de los repos privados. La cuota es por cuenta: si otro repo empieza a gastar mucho, se puede
pasar a cada dos horas cambiando el `cron`.

**Precisión:** se comprueba cada hora, así que una caída de menos de una hora puede no
quedar registrada, y la duración de las que sí se registran es aproximada a la hora. Los
informes lo dicen.

## Puesta en marcha

### 1. Token de lectura de GitHub

En GitHub → *Settings → Developer settings → Fine-grained tokens → Generate new token*:

- **Resource owner:** FacundoSierra
- **Repository access:** *All repositories* (o los de los proyectos y este)
- **Permissions → Repository**, todos en **Read-only**: Metadata, Contents, Pull requests,
  Commit statuses, Actions, Deployments, Dependabot alerts, Issues

Guárdalo en Vercel como `GITHUB_TOKEN_LECTURA`. Es un token distinto de `GITHUB_TOKEN`, que
puede escribir en las notas: si este se filtra, no toca la bóveda.

**Lo que no alcanza:** el repo de Bodegas es de la cuenta `PabloLF20`. Un token de permisos
finos de Facundo no llega a repos de otra cuenta personal aunque sea colaborador, así que
Bodegas saldrá «sin acceso» en GitHub. La web, el certificado y la base sí se vigilan.

**Alertas de seguridad:** Dependabot tiene que estar activado en cada repo (*Settings → Code
security → Dependabot alerts*). Si no, el panel dice «sin acceso».

### 2. Secreto de la vigilancia

Genera un secreto largo:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

- En **Vercel**: `VIGILANCIA_SECRET` con ese valor, y redesplegar.
- En el **repo del panel** (*Settings → Secrets and variables → Actions*):
  - `VIGILANCIA_SECRET`: el mismo valor
  - `VIGILANCIA_URL`: `https://dashboard.facundosmtech.com/api/vigilancia`

### 3. Probarla

En el repo → *Actions → Vigilancia → Run workflow*. Debe aparecer una incidencia cerrada
«Vigilancia en marcha» y, si hay algo roto, una abierta por cada aviso.

### 4. Recibir los avisos en el móvil

La app de GitHub para móvil avisa de las incidencias nuevas de los repos que sigues. Eres el
dueño, así que ya lo sigues; comprueba en la app que las notificaciones de *Issues* están
activadas.

## Informes mensuales

`/informes/<cliente>?mes=YYYY-MM` genera un informe para mandar al cliente, imprimible o en
PDF desde el navegador:

- **Disponibilidad** de cada web e incidencias del mes (de la vigilancia horaria)
- **Cambios publicados**, clasificados por el prefijo del commit: `feat` → mejoras, `fix` →
  correcciones, `seguridad` → seguridad; el resto (`docs`, `chore`, `refactor`…) se cuenta
  como mantenimiento interno sin listarlo
- **Seguridad**: vulnerabilidades abiertas en las dependencias
- **Próximas renovaciones** del cliente

Por eso conviene seguir escribiendo los commits con el formato `tipo(ámbito): descripción`:
la descripción es lo que lee el cliente.

## Repos del PC

Los repos de `.repos/` no se suben con la bóveda, así que el panel no los ve.
`C:\brain\.scripts\estado-repos.ps1` los describe (rama, commits sin subir, archivos sin
commit) en `dashboards/repos-locales.md`, y `sincronizar-boveda.ps1` lo lanza antes de cada
sincronización.

- No hace `fetch`: compara con la última copia conocida del remoto, que se actualiza al hacer
  push. Tarda menos de un segundo.
- Solo reescribe la nota si algo cambia; si no, cada sincronización haría un commit.
- Está guardado en UTF-8 **con BOM**: PowerShell 5.1 lee los scripts sin BOM como ANSI y
  estropearía las tildes.
- Si falla, se apunta en `sincronizar-boveda.log` y la sincronización sigue.
