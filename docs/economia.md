# Economía: planes y cobros

La página `/economia`, las tarjetas de cliente y los avisos de cobros salen de una nota por
cliente y año de trato en la bóveda. El año de trato empieza cuando empieza el trato (de
septiembre a agosto, por ejemplo), no en enero. La lógica está en `lib/economia.ts`.

## Dónde va cada cosa

```
clientes/<cliente>/
  <cliente>.md                     ← la ficha: quién es, contactos, renovaciones sueltas
  cobros/
    <cliente>-cobros-2026.md       ← el trato que empieza en 2026: lo ACORDADO y lo COBRADO
    <cliente>-cobros-2027.md       ← el siguiente año de trato, con sus condiciones
  documentos/                      ← facturas y contratos en PDF
  reuniones/
```

El nombre lleva el cliente delante porque en la bóveda los nombres de nota son únicos: cinco
notas llamadas `2026` chocarían entre sí. La plantilla es `templates/cobros.md`.

Lo que paga el negocio y no es de ningún cliente (herramientas, suscripciones) va aparte, en
una sola nota: `negocio/gastos-fsmtech.md` (ver [Gastos del negocio](#gastos-del-negocio)).

## El plan: lo acordado

Va en las propiedades de la nota. Una línea por concepto:

```yaml
tipo: cobros
cliente: "[[bodegas-agrovello]]"
anio: 2026
desde: 2026-09          # primer mes del trato; por defecto enero
hasta: 2027-08          # opcional: por defecto, doce meses desde `desde`
plan:
  - concepto: Mantenimiento
    importe: 50
    cada: mes
  - concepto: Hosting IONOS
    importe: 8
    cada: mes
    paga: yo
    cobro: aparte
  - concepto: Dominio bodegasagrovello.com
    importe: 15
    cada: año
    paga: yo
    cobro: incluido
    renueva: 2027-05-19
```

| Campo | Qué es |
|---|---|
| `concepto`, `importe` | Obligatorios. El importe en euros; vale `50`, `58,50` o `1.200` |
| `cada` | `mes` (por defecto) o `año`, que son cuotas; `sesion` u `hora`, que son tarifas (ver abajo) |
| `paga` | Quién paga al proveedor. **Sin este campo, la línea es trabajo tuyo** (mantenimiento, desarrollo) y se le cobra al cliente |
| `cobro` | Solo con `paga: yo`: `aparte` si se lo cobras además (por defecto), `incluido` si sale de tu cuota |
| `renueva` | Fecha de renovación: sale en la lista de renovaciones y avisa antes |

### Los tres tratos

| Trato | Líneas | Te paga | Pagas tú | Te queda |
|---|---|---|---|---|
| Lo pagas tú y se lo cobras aparte | mantenimiento 50 + hosting 12 `paga: yo, cobro: aparte` | 62 | 12 | 50 |
| Lo pagas tú y va incluido (familia) | mantenimiento 50 + hosting 12 `paga: yo, cobro: incluido` | 50 | 12 | 38 |
| Lo paga el cliente | mantenimiento 50 + hosting 12 `paga: cliente` | 50 | 0 | 50 |

Las líneas anuales se reparten entre doce para calcular lo que queda al mes; lo que el
cliente paga cada mes solo incluye las mensuales, y las anuales se enseñan aparte.

### Tarifas: por sesión o por hora

La consultoría no se cobra con cuota fija. La tarifa va en el plan con `cada: sesion` o
`cada: hora`, y **lo que entra se apunta en los cobros de cada mes**, como siempre:

```yaml
plan:
  - concepto: Sesión de consultoría
    importe: 60
    cada: sesion
```

```markdown
- [x] 2026-10 — Dos sesiones — 120 € — cobrado 2026-10-28
```

Una tarifa no suma nada fijo al mes. En un plan **solo de tarifas**, lo que queda al mes es
la **media de lo cobrado en los meses del plan que ya han terminado** (el de hoy aún puede
cambiar), y el panel lo marca como media. Si el plan tiene también cuota, las sesiones son
extras: cuentan en lo cobrado, no en lo que queda al mes.

## Gastos del negocio

Lo que paga FSMTECH y no es de ningún cliente: Claude Code, Obsidian, una plataforma de
inversión… Va en `negocio/gastos-fsmtech.md` (`tipo: gastos`, plantilla `templates/gastos.md`).
**Lo que se paga por un cliente** (su hosting, su base de datos) **no va aquí**: va en su plan
de cobros con `paga: yo`, que es lo que alimenta «Lo que te ha dejado cada cliente».

```yaml
tipo: gastos
suscripciones:
  - concepto: Claude Code
    importe: 217,80
    cada: año
    desde: 2026-03-25     # el día del primer cargo
  - concepto: Investing Pro
    importe: 80
    cada: año
    desde: 2026-08-26
    baja: 2027-08-26      # no se renueva: ese cargo ya no cuenta
    linea: consultoria-financiera
```

| Campo | Qué es |
|---|---|
| `concepto`, `importe` | Obligatorios. El importe, como en los planes (`52,66`, `1.200`) |
| `cada` | `mes` (por defecto) o `año` |
| `desde` | Obligatorio. El día del primer cargo; los siguientes caen el mismo día de cada mes o de cada año (el 31, el último día de los meses más cortos) |
| `baja` | Opcional. El día en que ya no se cobraría porque se da de baja: ese cargo y los siguientes no cuentan, y hasta ese día sale en Renovaciones como «Darse de baja de…», con su aviso |
| `linea` | Opcional. Con ella, sale al filtrar Economía por esa línea. Sin ella es un gasto general, y solo sale en «Todas las líneas» |

Lo que se paga una vez va en la sección «Pagos sueltos»: `- 2026-11-03 — Curso de Next — 49,90 €`.

Los cargos no se marcan: una suscripción se cobra sola, así que el panel los calcula desde
`desde`. Lo que se renueva solo no sale en Renovaciones (no hay nada que hacer); el próximo
cargo de cada suscripción se ve en la tarjeta «Gastos del negocio».

## Línea de negocio y estado del cliente

Van en la ficha del cliente (`templates/cliente.md`):

| Propiedad | Valores | Sin ella |
|---|---|---|
| `linea` | `desarrollo`, `consultoria-financiera`, `otro` | `desarrollo` |
| `estado` | `potencial`, `activo`, `pausado`, `perdido` (el antiguo `inactivo` cuenta como `pausado`) | `activo` |

Economía se filtra por línea (`/economia?linea=consultoria-financiera`), y todas sus cifras
salen solo de los clientes de esa línea. En Clientes, el estado hace de embudo: cuántos
potenciales, activos, pausados y perdidos, y se filtra por cada uno. Los filtros de línea
solo aparecen cuando hay clientes de más de una.

## Los cobros: lo cobrado

En el cuerpo, sección «Cobros», una casilla por cobro:

```markdown
## Cobros
- [x] 2026-10 — Mantenimiento y hosting — 58 € — cobrado 2026-10-03 — [[2026-10-01-factura-001.pdf]]
- [ ] 2026-11 — Mantenimiento y hosting — 58 €
- [ ] 2026-12 — Mantenimiento y hosting — 58 €
- [ ] 2026-05 — Dominio (anual) — 15 €
```

- Formato: `- [ ] AAAA-MM — concepto — importe €`, con raya, semiraya o guion entre partes
- Al cobrar se marca la casilla y se añade `— cobrado AAAA-MM-DD`
- Lo que vaya detrás (el enlace a la factura) se respeta
- El mes es el que se cobra, no el día: sirve para saber si va atrasado

Tres formas de marcar un cobro, y las tres acaban en la misma línea:

1. **En Obsidian**, pulsando la casilla (y añadiendo la fecha, si quieres)
2. **Desde el panel**, en Economía: botón «Cobrado» (y «Deshacer» si te equivocas). Lo que no
   estaba en el plan, con «Cobro extra»
3. **Diciéndoselo a Claude** («ha pagado Bodegas lo de octubre»)

### Estados

| Estado | Cuándo | En la franja del año |
|---|---|---|
| Cobrado | Casilla marcada | Celda baja, verde |
| Pendiente | Sin marcar, de este mes | Celda mediana, amarilla |
| Atrasado | Sin marcar, de un mes anterior | Celda alta, roja, y aviso en Hoy y en Estado |
| Por cobrar | Sin marcar, de un mes que no ha llegado | Celda baja, gris |

La altura cambia con el estado porque el verde y el rojo no se distinguen con deuteranopía
(ΔE 4,1 medido con el validador de la guía de visualización).

Los atrasados salen como aviso en el panel, pero **no van al móvil**: los cobros se marcan a
mano y habría falsas alarmas cada vez que se olvide una casilla.

## Qué escribe el panel en la economía

Tres cosas, todas acotadas (`lib/boveda/escritura.ts`; la lista completa de escrituras del
panel está en `docs/arquitectura.md`):

| Botón | Escritura | Dónde | Qué cambia |
|---|---|---|---|
| «Cobrado» / «Deshacer» | `marcarCobro()` | Nota de cobros, sección «Cobros» | La casilla y `— cobrado AAAA-MM-DD` |
| «Cobro extra» | `anadirCobroExtra()` | Nota de cobros del plan en vigor, sección «Cobros» | Una línea nueva ya marcada: `- [x] 2026-11 — Landing de Navidad — 150 € — cobrado 2026-11-14` |
| «Apuntar una renovación» | `anadirRenovacion()` | Ficha del cliente, sección «Renovaciones» | Una línea nueva: `- 2027-01-12 — Dominio ejemplo.es` |

- Las notas de cobros, solo en `clientes/<cliente>/cobros/<cliente>-cobros-AAAA.md`, en la
  carpeta de su propio cliente; las fichas, solo en `clientes/<cliente>/<cliente>.md`
- Marcar solo toca una línea con forma de cobro, y solo si sigue igual que cuando se pintó la
  página. En producción escribe con el `sha` de lo que leyó: si la nota ha cambiado
  entretanto, GitHub responde 409 y no se toca
- El cobro extra es **lo ya cobrado** que no estaba en el plan (un trabajo suelto): la fecha
  no puede ser futura, y el mes de la línea es el de esa fecha. Lo que se va a cobrar cada
  mes va en el plan. Cuenta en «Cobrado este año», no en lo que queda al mes
- El importe se escribe como a mano: `150`, `49,90`
- Son Server Actions: comprueban la sesión antes de nada y validan lo que llega

El cambio llega a Obsidian con la siguiente sincronización del PC, en dos minutos como mucho.
Si en esos dos minutos se edita la misma línea en Obsidian, la sincronización puede chocar y
pararse: el PC lo avisa con una nota en `inbox/sincronizacion-atascada.md`, que llega al móvil
por Obsidian Sync, y se arregla a mano.

## Qué calcula

| | Cómo |
|---|---|
| **Te quedan al mes** | Suma de lo que queda con cada plan en vigor este mes |
| **Cobrado este año** | Suma de las casillas marcadas de este año: lo cobrado de verdad |
| **Pendiente de cobro** | Casillas sin marcar de este mes y de meses anteriores |
| **Pagas a proveedores** | Lo que pagas tú al mes, con lo anual repartido |
| **Evolución** | Lo que queda cada mes desde el primer plan, hasta 24 meses |
| **Reparto** | Lo que queda de cada cliente, y si uno pasa de la mitad del total |
| **Lo que te ha dejado cada cliente** | Últimos doce meses, este incluido: lo cobrado de verdad (casillas marcadas) menos lo que pagas tú por él según el plan de cada mes (dominios, hosting…). No cuenta tus horas |
| **Balance del año, hasta hoy** | Lo cobrado (casillas marcadas) menos lo pagado por los clientes (el `gastoMensual` del plan en vigor, de enero a este mes) menos los gastos del negocio (los cargos de las suscripciones hasta hoy y los pagos sueltos). Debajo, la misma cuenta al mes con lo de hoy: lo que pagan los clientes, lo que pagas por ellos y lo que suponen al mes las suscripciones que siguen cobrándose |
| **Gastos del negocio** | Cada suscripción con lo cargado este año y su próximo cargo, y los pagos sueltos del año |

## Renovaciones

Salen de cuatro sitios y se juntan en una lista, contando cada dominio una sola vez:

- Líneas del plan con `renueva`
- Las bajas pendientes de los gastos del negocio (`baja`), mientras no hayan pasado
- La sección «Renovaciones» de la ficha del cliente: `- 2026-10-06 — Certificado SSL de ejemplo.es`. Se puede apuntar desde el panel, al pie de la lista de renovaciones
- Los dominios `.com` y `.net` de las webs, por RDAP. Los `.es` no publican la caducidad
