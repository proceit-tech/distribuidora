# AUD-PRO129-UX-R02 — Alta fiscal única (NEX-064): auditoría estática

**Fecha:** 2026-10-17. **Auditor:** ChatGPT (revisión independiente estática del GitHub).
**SHA auditado:** `30c984b216957f8320f45ff729f4b984e30335bc` ([commit](https://github.com/proceit-tech/distribuidora/commit/30c984b216957f8320f45ff729f4b984e30335bc)).
**Base:** `d75b463a22eeb03f2384830089e9693cbeb295da`; 1 commit funcional; 20 archivos modificados/agregados.
**Fuentes:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, sección UX-R01 de `PROGRESSO-NEXIT-V1.md`, `documentacao/v1/DECISAO-PUNTOS-TIPOS-SERIES-2026-10-17.md`, `documentacao/testes/AUD-PRO129-PUNTOS-ALTA-TIPO-R01-2026-10-17.md`.
**Veredicto:** **CORRECCIÓN SOLICITADA: 2 hallazgos MEDIOS funcionales de interfaz/errores**. UX-R01-01 (ausencia de tipo en alta y punto duplicado falso) está **CORREGIDO ESTÁTICAMENTE**. No aprobar funcionalmente la pantalla, ni aplicar NEX-064/deploy por esa sola inspección. T30/T31 y migración sin ejecución PostgreSQL; capturas DEPOIS ausentes; contrato `dSerieNum` todavía pendiente.

## Matriz de comprobación

| Criterio / hallazgo | Evidencia concreta | Estado |
|---|---|---|
| UX-R01-01 / CA-04 — formulario único | `app/(private)/facturacion/puntos/page.tsx` líneas ~160–198 y ~380–467: `DialogoAlta` incluye sucursal, punto, nombre, **tipo**, serie, último, confirmación y activación; un único POST; ya no se abre diálogo posterior | **CERRADO ESTÁTICAMENTE**; interfaz real no comprobada |
| CA-05B — reutilizar est.001/punto001 FE para NCE | `page.tsx` líneas ~163–165, `lib/facturacion/puntos.ts` líneas ~90–104 y ~208–221, `app/api/facturacion/puntos/route.ts` líneas 19–41, `NEX-064` líneas 57–77 | **CONFORME ESTÁTICO**, pendiente ejecución real |
| Punto nuevo + primer tipo atómicos | `NEX-064` `fe_punto_alta_tipo`: mismo llamado de función SQL para `fe_punto_registrar`, `fe_secuencia_configurar` y `fe_punto_estado` sin captura de excepción que confirme parcialmente; advisory lock identidad antes de búsqueda | **CONFORME ESTÁTICO**; T30/T31 sin ejecución |
| Tipo duplicado sin reinicio | `NEX-064` líneas 59–64 verifica `fe_punto_secuencias` y produce `NEX:TIPO_DUPLICADO`; modal deshabilita Guardar si lo detecta | **CONFORME ESTÁTICO**; concurrente protegido en SQL, T31 sin ejecución |
| Unicidad, permisos y aislamiento | `NEX-064` líneas 39–57 (permiso PUNTOS, sucursal+alcance, lock de identidad), reutiliza validación de secuencias NEX-063 | **CONFORME ESTÁTICO** |
| CA-08 / UX estado del tipo no emitible | NRE/NDE/AFE aún no poseen emisión, pero UI permite `activar=true`, y los llama «disponible para emitir ahora» y «Activo» | **NO CONFORME — R02-01** |
| Diagnóstico de versiones | `puntos.ts` captura 42883 y siempre dice «falta aplicar la migración NEX-063», también cuando la nueva función NEX-064 no existe | **NO CONFORME — R02-02** |
| T30/T31 / reversión | T30 configura FE/NCE/NRE, duplicidad, rollback, aislamiento; T31 prueba sesiones concurrentes. NEX-064 y reversión incremental. Procedimiento requiere aplicar en orden | **PREPARADO, NO EJECUTADO** |
| Evidencia visual / fiscal | archivo ANTES/DEPOIS es solo tabla Markdown sin imágenes; revisión de navegador y gateway ausente | **NO HOMOLOGADO** |

## Hallazgos nuevos y acotados

### PRO129-UX-R02-01 — MEDIA — Estado «Activo / disponible para emitir» engañoso para NRE/NDE/AFE

**Archivos:** `app/(private)/facturacion/puntos/page.tsx`, líneas aproximadamente 345–361 (tabla) y 442–460 (modal).

**Evidencia:** al crear NRE, NDE o AFE el modal permite marcar «Dejar disponible para emitir ahora» y llama `altaPuntoConTipo(... activar:true)`. La tabla calcula `operativo = punto.activo && tipo.activo` **sin considerar `tipo.emitible`** y muestra «Activo» incluso para tipos que el propio catálogo identifica como «Solo configuración: la emisión aún no está habilitada». No hay funciones ni rutas de emisión de NRE/NDE/AFE. Esto contradice el significado explícito de «disponible para emitir ahora».

**Corrección esperada:** diferenciar **tipo configurado/activado administrativamente** de **emisión realmente habilitada**. Para NRE/NDE/AFE, no ofrecer como acción afirmativa «emitir ahora», ni estado operativo «Activo» sin calificación; el rótulo puede ser «Configurado · emisión no disponible» aunque la secuencia esté activa. Para FE/NCE, la disponibilidad real requiere además punto y tipo activos. Conservar el modelo SQL y permitir el alta anticipada de tipos futuros, sin liberar su emisión. Añadir regresión básica UI/TS para ambos casos, sin cambiar arquitectura ni numeração.

### PRO129-UX-R02-02 — MEDIA — Error de ausencia de NEX-064 apunta a la migration equivocada

**Archivo:** `lib/facturacion/puntos.ts`, líneas 110–118, consumido por `altaPuntoConTipo` líneas 212–220.

**Evidencia:** el SQL de la API usa `fe_punto_alta_tipo`, función creada **solo** por NEX-064. Cuando la NEX-063 ya está aplicada pero NEX-064 aún no, PostgreSQL devuelve `42883` (función inexistente) y `traducirErrorPunto` devuelve «falta aplicar la migración NEX-063». Ese diagnóstico es falso y dificulta la sequência de implantação segura.

**Corrección esperada:** diferenciar `42883` en el contexto del alta nueva (NEX-064) de ausencias de funciones/columnas NEX-063 en las operaciones antiguas. Error guiado, en español Paraguay, sin detalles internos ni asumir que una migration ya fue aplicada. Teste simples com mock `42883` para `altaPuntoConTipo`, cobrindo nome correto da migration. Não alterar DB por conta disso.

## Limitações e encaminhamento

- A revisão estática do NEX-064 não comprova o comportamento SQL. A função SQL é transacional por construção, mas as corridas reais de T30/T31 não foram executadas.
- Claude reportou `alta-punto.casos`, `puntos.casos`, `series.casos`, `secuencias.casos`, `nce.casos`, `configuracion-gateway.casos`, ESLint e tsc limpos; auditor não reproduziu essas execuções. Sem navegador, VM, PostgreSQL, gateway ou SIFEN.
- A documentação ANTES/DEPOIS está versionada, porém **sem imagens binárias**; não é aceite visual do responsável. Captura original do erro está somente na conversa.
- NÃO reabrir MT-01/UI-01/R04-01 nem altera contrato gateway, NEX-063 ou numeração, nem etapas da NCE.
- **Solicitar somente correções R02-01/02**; testes básicos dirigidos e commit/push, parar para AUD-PRO129-UX-R03. Não autorizar aplicação de NEX-064 nem deploy por IA.
