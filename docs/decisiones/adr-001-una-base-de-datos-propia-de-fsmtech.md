# ADR-001: El panel tiene una base de datos propia de FSMTECH, y la consultoría es lo primero que entra

- Fecha: 2026-10-27
- Estado: aceptada
- Requerimiento: REQ-001

## Contexto
Facundo quiere llevar la consultoría de OVB desde el panel, junto a sus clientes de informática, sin entrar en FSM-Finance. La consultoría no puede ir en notas: lleva nombres de clientes, y las notas suben a GitHub. Hasta hoy el panel no tenía base de datos: lee la bóveda por la API de GitHub, guarda los documentos en Vercel Blob y las passkeys en una variable.

Había dos caminos: que el panel usara la base de FSM-Finance, o una base nueva. Facundo eligió el 2026-10-27 **una base nueva, solo de FSMTECH**, «para no mezclar» su negocio con la aplicación de sus clientes, y porque abre la puerta a meter más cosas del negocio. El proyecto de Supabase ya está creado: `fsmtech`, West EU (Ireland, `eu-west-1`), plan gratuito.

## Decisión
- **Un proyecto de Supabase, `fsmtech`, en `eu-west-1`**, junto a las funciones del panel (`dub1`, Dublín). Solo tiene datos del negocio de Facundo: ningún dato de los usuarios de FSM-Finance
- **Cambia un principio del roadmap**: el panel ya no es solo «una ventana sobre las notas». **Las notas siguen siendo la verdad de todo lo demás**; la base guarda solo lo que no puede ir a GitHub (hoy, la consultoría). Nada se guarda en los dos sitios a la vez
- **Convenciones para crecer**, para que lo siguiente no obligue a rehacer nada:
  - las tablas en `public`, **con el prefijo de su módulo** (`consultoria_*`; lo siguiente, `<modulo>_*`), en español, como en FSM-Finance. Un esquema propio por módulo se descarta por ahora: obligaría a exponer cada esquema en la Data API y a cambiar todas las consultas
  - las migraciones en `supabase/migraciones/NNNN_titulo.sql` de este repo, numeradas desde `0001`, idempotentes cuando se pueda, con sus comprobaciones en la cabecera; **las ejecuta Facundo a mano** en el editor SQL, después del `revisor-migraciones`
  - **cerrado por defecto**: RLS activo en toda tabla, permisos explícitos solo para `service_role`, nada para `anon` ni `authenticated`, y los permisos por defecto de lo que se cree después, quitados (ADR-002)
  - dinero en `numeric(12,2)`, fechas contables en `date`, importes calculados en columnas generadas donde ya lo estaban
- **La consultoría entra con una sola migración consolidada** (`0001_consultoria.sql`), que es el estado final de las `0013`, `0015` y `0016` de FSM-Finance con los cambios de la spec (sección 4): en una base vacía no hay historia que repetir

## Alternativas consideradas
- Usar la base de FSM-Finance desde el panel — lo descarta Facundo: mezcla su negocio con la aplicación de sus clientes, y el panel tendría una clave de una base con las finanzas de otras personas (lo que ya se rechazó en la fase 6 del roadmap)
- Repetir las tres migraciones de FSM-Finance tal cual — arrastran `perfiles`, `es_consultor()` y el orden de la `0015` y la `0016` (después de la `0016` no se puede volver a ejecutar la `0013`), y no hay nada que conservar de esa historia en una base vacía
- Un esquema de Postgres por módulo (`consultoria.clientes`) — más limpio, pero hay que exponerlo en la Data API y cambiar todas las consultas y scripts el día que hay prisa. Se puede hacer más adelante si hay muchos módulos

## Consecuencias
- El panel pasa a depender de una base: si Supabase no responde, la sección Consultoría lo dice y el resto del panel (que lee notas) sigue igual
- **Plan gratuito**: 500 MB, sin copias de seguridad y **se pausa tras una semana sin actividad** (supabase.com/pricing, consultado el 2026-10-27). Con uso diario no debería pasar; si pasa, se reactiva desde Supabase. Con datos de dinero, conviene la exportación periódica de la spec (sección 13) o pasar a Pro (25 $/mes, con copias diarias de 7 días) cuando la base guarde más cosas
- La base se vigila como las de los clientes: la propiedad `supabase` de la nota del proyecto, con la URL pública
- Lo siguiente que entre en la base sigue las mismas convenciones y su propio ADR si cambia alguna
