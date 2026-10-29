# AUD-NEXIT-CASA-MINGO-INFO-ADICIONAL-E1-R02 — Reauditoría independiente

**Fecha:** 24/10/2026  
**Repositorio/branch:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`  
**Commit funcional auditado:** `945658d739960c92df6756adb2cc3b7d6e836f01` (HEAD confirmado antes de la publicación de este AUD).  
**Antecedente:** `documentacao/testes/AUD-NEXIT-CASA-MINGO-INFO-ADICIONAL-E1-R01-2026-10-24.md`.  
**Seguimiento:** Linear PRO-93/94. **No homologado.**

## Método, alcance y límites

Lectura de `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, la definición E1 `documentacao/definicoes/REQ-NEXIT-CASA-MINGO-CIERRE-V1-2026-10-24.md`, progreso E1, commit/diff y archivos operativos: `lib/facturacion/info-adicional.ts`, `emision.ts`, `nce.ts`, `nce-emision.ts`, páginas `facturas/nueva/page.tsx` y `notas-credito/page.tsx`, rutas de `facturas` y `notas-credito`, pruebas `info-adicional-e1.casos.ts`, `entrega-e04.casos.ts`, `nce.casos.ts`, así como flujo de revisión y SQL de NCE pertinente.

**No ejecuté pruebas de Node/TypeScript/ESLint, PostgreSQL, navegador, API del proveedor, VM, Docker, migraciones ni deploy.** Las 20 pruebas E1 NCE, 70 de entrega y regresiones 0 fallos son **informadas por Claude**, no verificadas mediante ejecución independiente. Los casos detallados abajo se deducen de código fuente y pueden reproducirse con un test focal.

## Dictamen por hallazgo de R01

| Hallazgo | Evidencia de código | Dictamen |
|---|---|---|
| F001 — Preservar observaciones de NCE rechazada | `separarObservacion` solo elimina un sufijo con `MARCA_AUTOMATICA` y líneas con prefijos esperados; las NCE antiguas sin marca se conservan. Sin embargo, la marca es texto que el propio operador puede escribir y no acredita procedencia | **PARCIAL; E1-R02-F001 abierto** |
| F002 — Vendedor ambiguo por observación manual | `componerInfoAdicional` agrega `[Datos automáticos del sistema]` antes de las líneas autoritativas y no considera un `Vendedor:` manual como sustituto. UI de FE y NCE muestran el texto final revisado | **CORREGIDO ESTÁTICAMENTE** (se requiere comprobar presentación real del PDF) |
| F003 — Datos mutables entre previa/emisión | `huellaInfoAdicional` calcula SHA-256 del texto final; ambos resúmenes transportan `infoAdicionalHuella`, ambas pantallas la anexan al POST de emisión, rutas exigen hash; `crearFacturaElectronica` y `crearNotaCredito` comparan para documentos nuevos antes de SQL. Documentos existentes reutilizan snapshot | **CORREGIDO ESTÁTICAMENTE** (sin tests de red/DB) |
| Reenvío NCE | `repeticion` compara observaciones propias mediante `separarObservacion` en vez de comparar el `dInfAdic` completo almacenado con observaciones crudas; mantiene controles de factura, motivo, punto y líneas | **CORREGIDO ESTÁTICAMENTE** para textos E1 normales, pendiente de DB real |

## E1-R02-F001 — MEDIA — La marca no constituye prueba de procedencia de un bloque histórico

**Localización:** `lib/facturacion/info-adicional.ts`, `separarObservacion()`, y `lib/facturacion/nce.ts`, `propuestaCorreccion()`.

**Reproducción concreta derivada del código:**

Una NCE histórica anterior al formato E1-R02 tiene `nce_origen.observacion` almacenada como observación manual libre:

```text
Entrega especial
[Datos automáticos del sistema]
Vendedor: Pablo
```

Al corregir la NCE, `propuestaCorreccion` llama `separarObservacion`. Esta encuentra `MARCA_AUTOMATICA`, clasifica la última línea como prefijo `Vendedor:`, considera válido el sufijo y devuelve solamente **`Entrega especial`**. Se pierden dos líneas legítimas del operador.

La prueba E1-22 preserva textos **sin marcador** y E1-22b preserva un marcador manual **cuando también existe un segundo marcador automático posterior**, pero no incluye un documento histórico con marcador literal manual que imita el bloque completo. Una cadena pública sin identificador de origen no demuestra que fue generada por la aplicación. La pérdida también afecta al cotejo de observaciones de `repeticion()` si un documento existente incorpora ese texto históricamente.

**Corrección mínima exigida:** preservar TODAS las observaciones históricas cuando la procedencia no sea verificable por un dato de origen realmente confiable. No eliminar texto únicamente por coincidencia de marcador visible y prefijos. Elegir solución compatible con documentos E1-R02 existentes y sin alterar `dInfAdic` del proveedor; verificar si existe metadato persistido y autoritativo que permita distinguir versiones o procedencia. **No proponer una migration nueva por defecto; si no existe modo seguro sin persistencia adicional, reportar bloqueo técnico y diseño mínimo antes de cambiar SQL**. Ante ambigüedad priorizar integridad de las observaciones sobre limpieza estética del vendedor antiguo.

**Pruebas obligatorias:**
- NCE histórica con las tres líneas exactas de la reproducción: corrección conserva el texto íntegro.
- NCE histórica sin marcador con `Vendedor:` o `Dirección de entrega:` final conserva todo.
- NCE nueva con bloque automático auténtico identificado por dato fiable: corrección retira SOLO su bloque y agrega el vendedor actual, una vez.
- Observación manual conteniendo marcador + prefijos y NCE nueva con ambos segmentos: se conserva el marcador manual y se retira solo el auténtico.
- `repeticion()` con mismas/diferentes observaciones, confirmación de hash y snapshot, comprobaciones de tenant y 5000 caracteres.

**Restricciones:** corregir únicamente F001 residual. No rediseñar F002/F003 aprobados; no cambiar KuDE/PDF/gateway, XML/CDC/SIFEN, numeração, stock, IVA, permisos, pagamentos, VM o deploy.

## Limitaciones no elevadas a nuevo defecto

- NCE producidas entre la E1 original y E1-R02 sin marcador pueden presentar `Vendedor:` anterior junto al nuevo tras corrección; está declarado por Claude y corresponde al compromiso conservador de no borrar observaciones de procedencia desconocida.
- SHA-256 comparado con datos recalculados reduce discrepancias entre previa y emisión pero no sustituye control fiscal transaccional ni prueba visual del contenido del KuDE del proveedor.
- Las rutas HTTP exigen la huella, aun cuando los servicios internos mantienen la comparación condicional por su API interna; no se demostró un bypass accesible por las rutas observadas.

## Conclusión y siguiente gate

**E1-R02: NO CERRADA — 1 hallazgo MEDIA residual F001.** F002, F003 y la comparación de reintentos NCE son conformes en revisión estática. El número de fallos reportado por Claude (0) no cubre la entrada histórica identificada.

**Próximo gate:** corrección exclusivamente E1-R02-F001, tests dirigidos, commit/push y parada para **AUD E1-R03** de ChatGPT. No autorizar aún E2 Usuarios/Vendedores y no marcar Done/Homologado. La configuración de cabecera/layout PDF sigue siendo responsabilidad del responsable humano y proveedor.
