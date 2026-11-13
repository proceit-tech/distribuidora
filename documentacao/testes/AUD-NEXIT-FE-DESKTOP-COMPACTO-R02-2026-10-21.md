# AUD-NEXIT-FE-DESKTOP-COMPACTO-R02 — Reauditoría FE-UX-C03-F001

**Fecha:** 21/10/2026  
**Repositorio/branch:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`  
**Commit funcional auditado:** `194de5c82bf899f514b29ac36b74988a559b2d7f`  
**Commit previo:** `334ab9574c357049829016839cf25d40a09ff861`  
**Auditoría R01:** `documentacao/testes/AUD-NEXIT-FE-DESKTOP-COMPACTO-R01-2026-10-21.md`  
**Definición:** `documentacao/definicoes/REQ-NEXIT-FE-DESKTOP-COMPACTO-2026-10-21.md`.

## Alcance y método independiente

Se confirmó que el commit funcional auditado era el HEAD de la branch. Se releyeron `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, la definición de rediseño, la AUD-R01, el progreso pertinente y el diff real de la corrección; se inspeccionaron el CSS y JSX afectados y el nuevo test de análisis de cascada.

**No se ejecutaron tests locales ni navegador**, no se consultó la VM ni se realizaron SQL, migrations, Docker, deploy o llamadas al gateway. Resultados `flujo-factura-ux 51/0`, `facturacion 271/0`, `rediseno 90/0`, `pagos 77/0`, `revision-factura 42/0`, `visual-v1 30/0`, `credito 91/0`, `stock-e02 61/0`, `entrega-e04 49/0` y `descuentos-e03 47/0` son **declarados por Claude, no reproducidos por ChatGPT**. TypeScript y ESLint focales también son declaración de Claude.

## Matriz de reauditoría

| Criterio R01 | Evidencia del código/commit | Veredicto |
|---|---|---|
| F001: no ocultar `Revisar y confirmar` a 1024/1099 | Eliminado el bloque histórico `@media (max-width: 1099px)` que establecía `.accionRevisar { display:none }`; botón ya no usa `estilos.accionRevisar` | **CORREGIDO** |
| Mantener operación a >=1100 | Nueva barra `barraResumen` y botón principal conservados; regla de ocultación eliminada | Conforme estático |
| Única acción / sin barra móvil sustituta | CSS `.barraMovil` eliminado, JSX sin barra móvil, solo una acción `Revisar y confirmar` | Conforme |
| Barra que ocupa varias líneas | `.barraResumen` conserva `flex-wrap:wrap`; `.barraAcciones` recibe `flex:0 0 auto`, `flex-wrap:wrap`, reglas <=760px mantienen acciones a ancho completo | Conforme estático; tamaño efectivo no verificado |
| Validaciones y emisión | `disabled={!puedeGuardar}`, `onClick={grabar}`; diff no altera `grabar()`, cuerpo revisado, huella, modal o control de idempotencia | Sin regresión demostrada |
| Test focal y reproducibilidad | `flujo-factura-ux.casos.ts` agrega parser liviano de bloques y media, aplica 1024/1099/1100/1366/1600/1920 a reglas ocultadoras y comprueba unicidad/JSX; Claude declara fallo de tres aserciones al restaurar el CSS antiguo | Cobertura razonable **estática**, no motor CSS real |

## Límites de la prueba

El parser creado por Claude recorre bloques `@media` y busca declaraciones de ocultación, pero **no es un motor de diseño ni una implementación completa de la cascada CSS** (especificidad, `@supports`, herencia, ancho disponible, ocupación efectiva). El bug concreto original era una regla CSS explícita y su eliminación sí se confirma por diff. No convertir esta prueba estática en certificado de apariencia del navegador.

Quedan sin verificar por el auditor y por navegador real: todas las columnas de la tabla sin scroll a 1366×768, 1600×900 y 1920×1080; barra `sticky` sin solapamientos en 1024/1099px y zoom aumentado; paneles de impuestos/pendientes expandibles; foco con teclado; dirección de entrega larga, moneda extranjera y crédito con entrada. La prueba en el único entorno real corresponde al responsable humano y **no requiere nuevo código salvo defecto observado**.

## Dictamen y gate

**AUD R02: F001 CORREGIDO; CONFORME EN REVISIÓN ESTÁTICA.** Cero hallazgos BLOQUEANTE/ALTA/MEDIA nuevos demostrados dentro de la corrección. No se solicita otra iteración de Claude para F001.

**NO HOMOLOGADO VISUAL NI OPERATIVAMENTE.** No presumir que push equivale a deploy/actualización de VM. La próxima etapa es comprobar el nuevo commit desplegado por el responsable en navegador, anotar dimensiones/zoom y evidencias DESPUÉS, y volver a corregir solamente si esa prueba identifica un defecto. Prohibido marcar tareas Done/Homologado o iniciar otro menú desde este dictamen.
