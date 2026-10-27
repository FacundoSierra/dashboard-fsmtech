# Base de datos

**Estado (2026-10-27):** la migración `0001_consultoria.sql` está escrita y la ha revisado el `revisor-migraciones`. **Está pendiente de ejecutar** en `fsmtech`. La base está vacía: aún no hay copia de los datos de FSM-Finance ni se ha hecho el cambio. Lo que falta y en qué orden, en la sección 12 de `docs/specs/req-001-consultoria-en-el-panel.md`.

## Motor
- Supabase (Postgres), proyecto `fsmtech`, West EU (Irlanda, `eu-west-1`), plan gratuito: sin copias de seguridad (la exportación semanal es la 13.3 de la spec)
- Sin ORM: el servidor del panel entra con `@supabase/supabase-js` por `baseDeDatos()` (`lib/base/cliente.ts`), y los scripts del PC por `scripts/consultoria-comun.mjs`. Por qué y con qué clave: ADR-001 y ADR-002, y la sección «Base de datos: la consultoría» de `docs/arquitectura.md`

## Qué hay: la consultoría (REQ-001)
Es la consultoría de FSM-Finance, con **los mismos nombres de tablas, columnas, restricciones, índices y vistas, y las columnas en el mismo orden**. No se repite aquí:
- **La migración**, con sus comprobaciones en la cabecera: `supabase/migraciones/0001_consultoria.sql`
- **El porqué de cada tabla y las reglas de negocio**: la spec de origen, en el repo `fsm-finance`, `docs/specs/req-001-consultoria.md`, secciones 2 y 11, y su `docs/base-de-datos.md`

Lo que crea la `0001`:

| Qué | Nombres |
|---|---|
| Tablas (11) | `consultoria_consultores` (la nueva), `consultoria_companias`, `consultoria_ajustes`, `consultoria_niveles`, `consultoria_cierres`, `consultoria_clientes`, `consultoria_liquidaciones`, `consultoria_herramientas`, `consultoria_extornos`, `consultoria_cuenta` y `consultoria_hucha` |
| Vistas (5), con `security_invoker = on` | `consultoria_lineas`, `consultoria_liquidaciones_por_mes`, `consultoria_cuenta_movimientos`, `consultoria_hucha_movimientos` y `consultoria_clientes_resumen` |
| Funciones de «Ha llegado» y «Deshacer» | `consultoria_liquidar_mes(p_consultor, …)` y `consultoria_deshacer_liquidacion(p_consultor, p_id)` |
| Funciones de los disparadores | `consultoria_proteger_herramienta`, `_extorno`, `_cargo`, `_liquidacion` y `_aportacion`: lo cobrado no cambia por debajo |

Dinero en `numeric(12,2)` (las unidades, en `numeric(10,2)`), fechas contables en `date`, y los importes de cada herramienta en columnas generadas (`bruto`, `hucha`, `irpf` y `neto`; en los extornos, `resto`).

## Lo que cambia respecto a FSM-Finance (spec, sección 4)
- **`consultoria_consultores`**, la primera tabla: `id` (sin valor por defecto: la copia trae el de FSM-Finance, que no es un dato personal), `nombre`, `fuente_desde` (nulo hasta el cambio) y `creado_en`. Solo puede haber uno (`consultoria_consultores_uno`). El `consultor_id` de las otras diez tablas apunta aquí, con el mismo nombre y el mismo valor
- **Sin `perfiles`, sin `es_consultor()`, sin políticas** (fuera los diez `create policy`) y sin la siembra de compañías: las compañías llegan con la copia
- **Solo en `fsmtech`**: la `0001` se para antes de cambiar nada si la base tiene `perfiles`, porque esa es la de FSM-Finance. Los scripts hacen lo mismo al conectar
- **`p_consultor`**: las dos funciones lo reciben como primer parámetro, porque con la clave secreta no hay `auth.uid()`. Si es nulo o no está en `consultoria_consultores`, `42501` («No hay consultor»)
- **Permisos, cerrados a todo salvo `service_role`**:
  - RLS activo en las once tablas y ninguna política
  - Tablas: `select, insert, update, delete` solo a `service_role`, sin `truncate` (vaciar lo hace Facundo como `postgres`, con el bloque de la 6.3 de la spec, solo antes del cambio)
  - **La excepción, `consultoria_consultores`**: `service_role` tiene `select, insert, delete` y solo `update (nombre)`. **`fuente_desde` lo cambia Facundo como `postgres`** en el editor SQL; ningún código lo toca
  - Vistas: `select` solo a `service_role`
  - Funciones: las dos de las liquidaciones, solo `service_role`; las de los disparadores, nadie
  - Lo que se cree después en `public`: sin permisos por defecto para `anon` ni `authenticated` (tablas, secuencias y funciones). El `execute` de `public` en las funciones nuevas no se quita así: **cada función lleva su `revoke … from public`**

## Migraciones
- En `supabase/migraciones/NNNN_titulo.sql`, numeradas desde `0001`, con un comentario arriba que dice qué y por qué, y sus comprobaciones
- Que se puedan ejecutar dos veces sin romper nada (`if not exists`, `create or replace`, `drop … if exists`). Para corregir una tabla ya creada, otra migración
- **Las ejecuta Facundo** en el editor SQL de `fsmtech`, después del `revisor-migraciones`. Nunca un agente ni el código
- Lo que entre después (ADR-001): tablas en `public` con el prefijo de su módulo (`<modulo>_*`), en español; cada tabla con RLS y `grant` solo a `service_role`; cada función con su `revoke … from public`
