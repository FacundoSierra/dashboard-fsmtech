# ADR-004: Las comisiones recurrentes son una serie: la herramienta y una fila por cuota, programadas unos meses por delante

- Fecha: 2026-11-01
- Estado: propuesta
- Requerimiento: REQ-002

> Numeración de este repo. Los «ADR-004», «ADR-005» y «ADR-006» que citan los comentarios de `lib/consultoria/reglas.ts` son los de FSM-Finance, de donde vino la consultoría.

## Contexto
Los seguros de año prorrogable que se cobran por recibo (el RC Integral de Plus Ultra) no pagan la comisión de una vez. Cobran una cuota fija cada trimestre o cada semestre, desde el periodo natural que contiene el efecto y hasta que se anulan. Hasta ahora, cada cuota habría sido una «firma» más, apuntada a mano con `--repetida`. Facundo no lo quiere así: es una sola firma con su comisión recurrente (2026-11-01).

Lo que ya hay y funciona con filas de `consultoria_herramientas`, con su `fecha_cobro` y su `liquidacion_id`:
- «Ha llegado» (`consultoria_liquidar_mes`): da por cobradas las filas marcadas y pasa las demás al mes siguiente con el motivo;
- «Deshacer» (`consultoria_deshacer_liquidacion`);
- la vista de las líneas, las previsiones de Liquidaciones y del Resumen, la hucha y el recuento del mes;
- los disparadores que protegen lo cobrado.

La 0001 ya preveía que, en una comisión sobre recibo, «cada comisión que llega después es su propia fila, con sus unidades y `unidades_nivel` 0».

La regla de cobro la dio Facundo el 2026-11-01. Cada periodo natural se cobra el mes siguiente a su último mes: abril-junio en julio, julio-septiembre en octubre, octubre-diciembre en enero y enero-marzo en abril. En los semestrales, enero-junio en julio y julio-diciembre en enero (deducido). Los recibos mensuales no son recurrentes: se cobran anualizados, de una vez.

## Decisión
- **Cada cuota es una fila de `consultoria_herramientas`**, colgada de su herramienta con `cuota_de` e identificada por su periodo natural, `cuota_periodo`: el día 1 del trimestre o del semestre. Copia de su herramienta el cliente, la compañía, el producto, el mes de producción y el efecto (como el documento de OVB), el €/unidad y la reserva. Lleva sus unidades y **`unidades_nivel` 0**: no cuenta para el nivel. El IRPF es el de Ajustes del momento. Así, «Ha llegado», «Deshacer», «no ha entrado», las previsiones, la hucha y los disparadores funcionan **sin cambiar una línea de sus funciones**
- **La herramienta guarda la serie**: `cuotas_cada_meses` (3 o 6) y `unidades_cuota`. En una firma nueva, la fila de la herramienta lleva 0 u para cobrar y las de producción para el nivel, y todas sus cuotas son filas aparte. Si la herramienta tiene unidades para cobrar (el RC de antes, cobrado en julio), **ella misma es la cuota de su primer periodo**: no se parte ni se toca lo cobrado
- **Se guardan por adelantado, con un horizonte**: las cuotas que se cobran hasta seis meses después del mes de hoy. Las programa una sola función idempotente: al dar de alta o cambiar una serie, al marcar «Ha llegado», con el script de la firma y con un botón de la herramienta. Un índice único `(cuota_de, cuota_periodo)` impide duplicar, aunque se relance
- **La regla vive en `reglas.ts`** (`periodoNatural` y `cobroDeLaCuota`, con sus pruebas), como el resto de las fechas. La fila la arma una función SQL, `consultoria_programar_cuotas`, que copia los campos de la herramienta y recibe de la regla los periodos y los cobros. Así el panel y los scripts no pueden armar cuotas distintas, y todo entra en una transacción
- **Anular la herramienta corta las cuotas sin cobrar** de los periodos que empiezan después de la anulación: se borran, porque nunca se cobraron. Una anulada no programa más

## Alternativas consideradas
- **Calcular las cuotas al vuelo y guardarlas solo al cobrarse**. «Ha llegado» tendría que crear filas, con una firma nueva de `liquidar_mes`, y lo que «no ha entrado» necesita una fila igualmente, porque guarda su mes nuevo y su motivo. Además, la vista, las consultas y los scripts tendrían que mezclar líneas guardadas y calculadas. Es más código en más sitios para lo mismo
- **Una tabla aparte, `consultoria_cuotas`**. Habría que reescribir la vista de las líneas, la de la hucha, el resumen de clientes, «Ha llegado», «Deshacer» y los disparadores para que la vieran
- **Programarlas todas al alta**: la serie no tiene fin hasta que se anula. **O un año entero por delante**: el Resumen enseñaría casi solo meses futuros por una cuota de 3 €, y una anulación cortaría muchas
- **La regla en SQL, dentro de «Ha llegado»**. Sería atómico, pero la regla quedaría en dos lenguajes (la pantalla de la firma la necesita antes de guardar), y cambiarla pediría una migración
- **Partir la fila de julio del RC en «alta» y «primera cuota»**. Está cobrada: habría que deshacer la liquidación n.º 5 o saltarse los disparadores

## Consecuencias
- Las cuotas pendientes son filas: se ven, se cambian (si OVB paga otra cantidad un trimestre), se anulan con su extorno o se borran como cualquier otra herramienta
- Producción, la ficha del cliente y la elección de la herramienta de una APEX tienen que **dejar fuera las cuotas** y enseñarlas dentro de su herramienta, como las APEX
- Programar después de «Ha llegado» no va en la misma transacción. Si falla, la liquidación queda bien, el aviso lo dice y el botón de la herramienta lo repite; relanzarlo no duplica
- Una cuota que no llega pasa de mes en mes, como cualquier línea, hasta que se cobra, se anula o se borra
- Si un día cambia la regla, se cambian `cobroDeLaCuota` y sus pruebas, y las cuotas pendientes se reprograman desde su `cuota_periodo`. Lo cobrado no cambia
- Los recibos anuales y las comisiones sobre saldo de importe variable no entran: el `check` de `cuotas_cada_meses` solo admite 3 y 6, y ampliarlo es una migración pequeña
