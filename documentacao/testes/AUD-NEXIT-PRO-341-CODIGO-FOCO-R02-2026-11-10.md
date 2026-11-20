# AUDITORÍA INDEPENDIENTE — PRO-341-R02 / Resultado de elección en búsqueda rápida

**Fecha:** 10/11/2026  
**Commit auditado:** [b7ca1ebb329d0fa87d568d2385323e3fe5f33105](https://github.com/proceit-tech/distribuidora/commit/b7ca1ebb329d0fa87d568d2385323e3fe5f33105)  
**Linear:** [PRO-341](https://linear.app/proceit/issue/PRO-341) · **GitHub:** [#18](https://github.com/proceit-tech/distribuidora/issues/18)  
**Auditor:** ChatGPT, inspección independiente de diff y archivos completos en SHA. **Ningún test, runner, lint, typecheck, build, SQL, PostgreSQL, navegador, VM, Docker, gateway o despliegue ejecutado.**  
**VEREDICTO: CORRECTIVO FUNCIONAL R02 CONFORME ESTÁTICAMENTE.** R01-F001 cerrado en código. **Existe un caso heredado de otra issue que NO está reconciliado: PRO330-61; se requiere mantenimiento puntual antes de declarar preparada la suite común.** PRO-341 sigue `In Review` / sin homologación; PRO-340 NO autorizada.

## 1. Alcance exacto y casos

El commit modifica **7 archivos**:
1. `lib/facturacion/busqueda-rapida.ts` — resultado tipado del controlador;
2. `app/(private)/facturas/nueva/page.tsx` — adaptación del resultado real de alta;
3. `lib/facturacion/codigo-foco-pro341.casos.ts` — casos nuevos;
4. `lib/facturacion/detalle-factura-vista.casos.ts` — actualizar PRO331-23/28;
5. `lib/facturacion/buscador-rapido.casos.ts` — compatibilidad callback void;
6. `lib/facturacion/visual-codigos-e05.casos.ts` — compatibilidad callback void;
7. `scripts/casos-clientes/run.js` — descripción de suite, sin ejecución.

**Nuevas verificaciones:** identificadores **PRO341-47..66 = 20 números**, más **PRO341-60b = 1 subcaso adicional**, por tanto **21 aserciones nuevas**. Sumadas a PRO341-01..46, **67 verificaciones identificadas** en código fuente (01..46 incluyen PRO341-10/11/12 generadas por bucle). Todos los casos están **escritos; ninguno ejecutado**. Los casos 47..61 usan el controlador REAL `crearBuscadorRapido` con dependencias simuladas y un **modelo** de `agregar`/focus; los 62..66 comprueban integración del código fuente. NO prueban React, DOM, PostgreSQL, lector físico ni latencia del navegador.

## 2. R01-F001 — CORREGIDO ESTÁTICAMENTE

- `busqueda-rapida.ts:57–65`: `ResultadoEleccion` es unión discriminada `{aceptado:true}|{aceptado:false}`; solo el segundo es rechazo. `undefined` conserva aceptación por defecto para callbacks de clientes/vendedores; no se infiere aceptación a partir del número `ALTA_BLOQUEADA=-1`.
- `page.tsx`: `agregarRapido(p)` ahora devuelve `ELECCION_RECHAZADA` si `agregar(p,"rapido")===ALTA_BLOQUEADA` y `ELECCION_ACEPTADA` si realmente agregó línea o incrementó SKU. `BuscadorProducto` propaga `ResultadoEleccion`; los wrappers de `BuscadorRapido` retornan el resultado tanto en creación como al `configurar` callbacks tras render.
- `busqueda-rapida.ts:117–126`: `seleccionar(t)` invoca callback una vez, limpia texto y solo emite `«…» añadido.` cuando **NO** hubo rechazo explícito. Un bloqueo deja el aviso de éxito vacío; el mensaje de máximo efectivo se presenta en el `role=alert` de Nueva factura, por su propia regla `avisoLimiteLineas`. El retorno temprano impide falso `role=status` de éxito.
- Tanto `ctl.elegir()` por clic como `ctl.enter()` con opción destacada o búsqueda directa asíncrona pasan por la misma función `seleccionar`. No se modificaron el `tokenLista`/`tokenDirecta`, la distinción de ceros iniciales, GTIN, permisos ni la invalidación de respuestas tardías.
- Clientes y vendedores conservan sus callbacks `void`; el controlador interpreta `void` como aceptación, manteniendo comportamiento anterior. El selector avanzado conserva control independiente de `ALTA_BLOQUEADA`. La regla de foco en Cantidad y excepción del editor fiscal, CSS de código completo, responsivo/scroll local y lógica atómica PRO-339 no cambiaron funcionalmente en R02.
- En la rama de bloqueo el buscador limpia el texto (comportamiento heredado); el producto no se agrega y no se enfoca Cantidad. El lector requerirá volver al campo buscador tras un alta aceptada, por petición expresa del cliente.

**Conclusión:** la contradicción «máximo de la empresa» + «producto añadido» queda resuelta en código; no se observó regresión del flujo en el diff.

## 3. Hallazgo de mantenimiento legado fuera del R01-F001 — PRO330-61

En `lib/facturacion/stock-preventivo.casos.ts:389` sigue el caso **PRO330-61** de PRO-330, creado antes de que la PRO-331 y la PRO-339 separaran los handlers de selección rápida y avanzada:

```ts
/<BuscadorProducto alElegir=\{agregar\}/.test(pag)
```

La pantalla vigente (y correcta) contiene `<BuscadorProducto alElegir={agregarRapido} />`; `agregarRapido` llama a `agregar(p,"rapido")`, que usa `lineasActuales.current` y mantiene el mismo incremento por `producto.id` y el control de stock. **Por ello la aserción PRO330-61 es estáticamente falsa con el código actual**, aunque la lógica de disponibilidad de stock no esté errónea.

**Clasificación:** **deuda de prueba preexistente, no defecto de la corrección R02.** Impide calificar como lista para ejecución sin falsas fallas a la suite conjunta. No modificar stock real, backend ni PRO-341 funcional para satisfacer un matcher histórico. Se exige una **orden de mantenimiento SOLO del caso** que actualice la expectativa PRO330-61 al recorrido actual:
`BuscadorProducto → agregarRapido → agregar("rapido") → aplicarLineas / SKU por producto.id`, y `SelectorProducto → agregar("avanzado")`, comprobando que la comprobación de stock se sigue basando en líneas efectivas.
La actualización deberá inspeccionar el archivo completo y los contratos vigentes antes de modificarlo, no ocultar ni eliminar el caso. Cualquier otra expectativa obsoleta encontrada deberá reportarse, sin ampliar automáticamente el alcance.

## 4. Estados y restricciones

- **PRO-341-R02: conforme ESTÁTICAMENTE**, sin requerimiento de R03 FUNCIONAL por R01-F001. **PRO-341 permanece `In Review`**, porque no se ejecutaron pruebas y falta homologación visual/operativa real, incluidas Cantidad/lector, máxima cantidad de líneas, doble lectura, CSS y confirmación de rechazo.
- **PRO-330 también permanece `In Review`**. Una tarea puntual de mantenimiento **PRO-330-T01** para PRO330-61 puede ejecutarse como próxima orden de código, **sin tocar funcionalidades**. No liberar PRO-340 todavía ni mezclar con mantenimiento de casos.
- **NEX-078 aún no aplicada**. Desplegar la versión dependiente de PRO-339/341 antes de ejecutar/verificar la migration hará que el backend **rechace TODA FE nueva con 422**, incluida la vista previa. La aplicación de NEX-078 requiere aprobación humana, backup, preflight y ventana controlada; **no se autoriza ejecutarla** aquí.
- El análisis estático no sustituye tests en React, TypeScript/lint, integración DB, navegador/zoom, performance ni homologación del cliente.
