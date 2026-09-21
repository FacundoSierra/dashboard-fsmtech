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
| `cada` | `mes` (por defecto) o `año` |
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
2. **Desde el panel**, en Economía: botón «Cobrado» (y «Deshacer» si te equivocas)
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

## Cómo marca el panel un cobro

Es la segunda cosa que el panel puede escribir en la bóveda, además de crear capturas en
`inbox/`. Está acotada (`marcarCobro()` en `lib/boveda/escritura.ts`):

- Solo en `clientes/<cliente>/cobros/<cliente>-cobros-AAAA.md`: la nota tiene que estar en la
  carpeta de su propio cliente
- Solo una línea con forma de cobro, y solo cambia la casilla y la fecha de cobro
- Solo si la línea sigue igual que cuando se pintó la página. En producción escribe con el
  `sha` de lo que leyó: si la nota ha cambiado entretanto, GitHub responde 409 y no se toca
- Es una Server Action: comprueba la sesión antes de nada

El cambio llega a Obsidian con la siguiente sincronización del PC, en dos minutos como mucho.
Si en esos dos minutos se edita la misma nota en Obsidian, la sincronización puede chocar y
pararse (lo apunta en `sincronizar-boveda.log`): conviene no marcar el mismo cobro a la vez
en los dos sitios.

## Qué calcula

| | Cómo |
|---|---|
| **Te quedan al mes** | Suma de lo que queda con cada plan en vigor este mes |
| **Cobrado este año** | Suma de las casillas marcadas de este año: lo cobrado de verdad |
| **Pendiente de cobro** | Casillas sin marcar de este mes y de meses anteriores |
| **Pagas a proveedores** | Lo que pagas tú al mes, con lo anual repartido |
| **Evolución** | Lo que queda cada mes desde el primer plan, hasta 24 meses |
| **Reparto** | Lo que queda de cada cliente, y si uno pasa de la mitad del total |

## Renovaciones

Salen de tres sitios y se juntan en una lista, contando cada dominio una sola vez:

- Líneas del plan con `renueva`
- La sección «Renovaciones» de la ficha del cliente: `- 2026-10-06 — Certificado SSL de ejemplo.es`
- Los dominios `.com` y `.net` de las webs, por RDAP. Los `.es` no publican la caducidad
