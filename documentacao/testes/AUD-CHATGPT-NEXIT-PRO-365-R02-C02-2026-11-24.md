# AUD-CHATGPT — PRO-365-R02-C02 — Documentos electrónicos / lenguaje de usuario — 24/11/2026

**DICTAMEN: CONFORMIDAD TÉCNICA PARCIAL (CI VERDE) / DOS OBSERVACIONES UX PENDIENTES / HOMOLOGACIÓN VISUAL NO ACREDITADA.** No iniciar R03, no desplegar ni hacer merge. La auditoría es de diff y fuente, más GitHub Actions automático; no se ejecutaron tests manuales, SQL, navegador ni VM.

## 1. Alcance y commits auditados

- Repositorio: `proceit-tech/distribuidora`; PR [#7](https://github.com/proceit-tech/distribuidora/pull/7) **DRAFT, no merge**; rama `feature/NEXIT-2026-001-banco-demo`.
- Baseline orden/autoría `9e18ddad19929e7e9acf61d874d82fe80c1ef650`.
- Commit principal Claude `5d64e41efc623a7ced020347776ed11631d28943`.
- Correctivo focal de caso `715ce6051b1795afc9ce05d6d4900f2aa8fb2da0`: solamente `lib/facturacion/eventos-fe-pro313.casos.ts` (matcher `P313-11c`, `motivo={eventosVista.operacion}` tras separar el copy de operador). La comprobación conserva instante del servidor `generadoMs`, restricción `disponible` y apertura solo cuando corresponde; no se cambió código funcional en este segundo commit.
- `compare_commits` respecto a la base: **2 commits, 15 archivos en total**. UI: `app/(private)/documentos/page.tsx`, `page.module.css`, `kude-modal.tsx`; presentación PURA `lib/facturacion/documentos-copy-operador.ts`; 9 archivos de casos existentes, 1 suite nueva `documentos-c02-lenguaje-pro365.casos.ts`, runner y documento de entrega. **No** hay archivos SQL, migrations, API, gateway, SIFEN, permisos, stock, `kude-visor.ts` ni generador PDF modificados.
- Entrega Claude: `documentacao/analises/PRO-365-R02-C02-ENTREGA-LENGUAJE-USUARIO-2026-11-24.md`.

## 2. CI automático confirmado para el SHA funcional final

- [NEXIT app CI 45455956086](https://github.com/proceit-tech/distribuidora/actions/runs/45455956086): **SUCCESS, 7/7 jobs**, incluidos runner de regresión, typecheck, lint, Next build, Docker build y puerta de liberación.
- [NEXIT app CI 45455940282](https://github.com/proceit-tech/distribuidora/actions/runs/45455940282): **SUCCESS, 7/7 jobs**.
- [NEXIT banco CI 45455956092](https://github.com/proceit-tech/distribuidora/actions/runs/45455956092): **SUCCESS**, 83 migraciones en CI efímero, T01 OK (8), **1.125 PASS / 0 fallos**.
- Log job App `138665315344`: **PRO-365-C02 38 comprobaciones**, total **6.829 PASS / 0 fallos / 0 errores inventario**; 100 archivos `*.casos.ts`, 102 suites y funciones. La ejecución anterior del commit `5d64e41` tenía **1 fallo** (`P313-11c`, matcher anticuado); el segundo commit lo corrigió y el CI final está verde.
- Los casos comprueban funciones puras y presencia estructural en fuentes; **no prueban la apariencia renderizada ni flujos reales del usuario**.

## 3. Confirmaciones del código

1. **Iconos de fila / texto claro:** `lib/facturacion/documentos-copy-operador.ts:20–35, 62–74` devuelve `ENVIADO → «Enviado»` exactamente, `ENVIO_INDETERMINADO → «No se pudo confirmar el envío»`, error separado; XML/CDC y Correo tienen etiquetas propias. En `page.tsx:1052–1054`, las cuatro fases de `iconosEstado(d)` se conservan en orden y la función inyecta `texto` breve para tooltip y `etiqueta` con el eje para accesibilidad (`page.tsx:161–175`). El historial técnico continúa mostrando el texto técnico original `i.texto`.
2. **Detalle fiscal:** `encabezadoFiscal` `documentos-copy-operador.ts:82–112` presenta APROBADO, RECHAZADO, PENDIENTE, SIN RESULTADO CONFIRMADO, CANCELADO, INUTILIZADO, ENVIANDO, ERROR AL ENVIAR y SIN ENVIAR, sin derivarlos de un mensaje de error. `page.tsx:1084–1093` muestra pastilla con texto, símbolo y tono. En `page.tsx:1118–1127` la línea genérica `Mensaje` se reemplazó por `Motivo del rechazo` condicionado a `fiscal.rechazo`; conserva código y mensaje literal de SIFEN para rechazo 1109 y alternativa `Motivo no informado`. Lote, CDC y fecha de firma permanecen visibles y copiables.
3. **Caso APROBADO y CANCELADO:** con aprobación persistida y evento de cancelación correlacionado ya proyectado, la cabecera presenta `Cancelado` y la nota de aprobación original, sin cambiar datos; el tooltip de SIFEN indica `Aprobado, luego cancelado`, pero su icono permanece verde por contrato original. Eventos queda separado.
4. **Mensajes de acciones:** las ayudas de KPI, consulta, envío, eventos y avisos pasan a una primera capa más simple, con aviso de seguridad para envíos sin confirmación. El servidor `app/api/documentos/[id]/enviar/route.ts:23–25` devuelve `estadoLocal` desde `enviarDocumento` (en `lib/facturacion/envio.ts:207`), por lo que `textoEnvioOperador(j)` no depende de una propiedad inventada. Los XML/correo sin API siguen inactivos.
5. **KuDE:** únicamente cambió `kude-modal.tsx:87` de `Obteniendo el KuDE del gateway…` a `Cargando el KuDE…`. El `iframe`, identificación de pertenencia, bloqueo de respuesta tardía, nombre de archivo no verificado y advertencia crítica siguen exactamente en `kude-modal.tsx` y `kude-visor.ts` (sin cambios).

## 4. Observaciones abiertas — impiden cerrar la experiencia UX como 100 % aprobada

### UX-C02-F01 — APROBADO con mensaje de rechazo antiguo sin aviso de posible discrepancia

`lib/facturacion/documentos-copy-operador.ts:125–130`: para `estadoSifen=APROBADO`, `respuestaFiscal` retorna siempre `{motivo:null, notaHistorial:null}`, aunque `fiscal.mensaje` tenga un código como **1109**. En `lib/facturacion/documentos-c02-lenguaje-pro365.casos.ts:179–184`, el escenario `APROBADO + codRespuesta=1109` se **acepta explícitamente sin motivo y sin nota**.

Esto acierta al **no presentar un rechazo histórico como resultado vigente**, pero deja sin aviso al usuario de que hay una respuesta registrada potencialmente inconsistente, a pesar del mandato de la orden `C02 ampliada §8.B`: «Contradicción entre estado persistido y código/mensaje: no ocultar/falsificar para conseguir Aprobado; mostrar aviso neutro de revisión y conservar evidencia». **No afirmar que esos campos contradicen necesariamente el estado** sin conocer correlación/fecha: se requiere una indicación neutra de que hay datos adicionales a revisar, sin clasificar un estado por el código ni afirmar rechazo actual. Mantener crudo/correlación en historial y, si ese aviso no puede ser seguro con campos disponibles, documentar dependencia de contrato, no asumir.

**Decisión:** observación funcional de copy/primera capa, no CI. Resolver en correctivo focal **solo si es autorizado**.

### UX-C02-F02 — El aviso crítico del KuDE continúa con jerga técnica en primera capa

`lib/facturacion/kude-visor.ts:17–20`, intacto en C02, aún produce:

- Título `PDF devuelto por el gateway — pertenencia NO verificada (...)`.
- Banner rojo largo: `El gateway devolvió este PDF… NEXIT no puede comprobar… CDC informado por la API…`.

Es un aviso de seguridad **necesario** porque la identidad/correspondencia con factura/empresa no fue comprobada. **NO debe retirarse, suavizarse hasta desaparecer, ni titular ese PDF como KuDE verificado.** Sin embargo, no satisface la petición de un texto comprensible para el personal de facturación ni la revisión integral de los elementos del visor. Se recomienda texto breve del tipo `No se pudo verificar que este PDF corresponda a esta factura`, seguido de una instrucción operacional clara que conserve la cautela de revisar emisor, fecha e importes y no entregar un PDF no concordante; dejar detalle de gateway/CDC/API en segunda capa o soporte. Cambiar solo presentación, nunca pertenencia, PDF, descarga, validación ni endpoints.

**Decisión:** UX pendiente; requires alcance/autoría focal posterior, no retirar advertencia por motivos estéticos.

### UX-C02-F03 — Riesgo visual heredado con APROBADO + evento CANCELADO (no bloquea el CI)

`textoSifen` dice `Aprobado, luego cancelado`, `encabezadoFiscal` dice `Cancelado`, pero el símbolo SIFEN permanece check VERDE porque refleja el estado persistido `APROBADO` y el cambio de clasificación no estaba autorizado. Una persona podría interpretar ese verde como vigencia activa. **Verificar en render con datos reales**, sin decidir por texto ni mutar el estado; cualquier cambio de eje/contrato requiere decisión explícita del responsable.

## 5. Otros límites

- El documento de entrega reconoce etiquetas técnicas residuales en el filtro (`Sin consultar` y `Estado no reconocido`), no tocadas para no alterar semántica del servidor. No afirmar que todas las palabras técnicas fueron eliminadas.
- Sin navegador, capturas del NEXIT C02 renderizado ni pruebas reales de KuDE/consulta/e-mail, no hay certificación visual al 1366/1920/320–720. Las capturas de la competencia están versionadas en `documentacao/referencias-visuais/PRO-365/`.
- El reporte de Claude no fue tomado como prueba de ejecución; ChatGPT cotejó commits, archivos y CI automático. **La VM no recibió estas modificaciones en esta auditoría.**

## 6. Dictamen y siguiente puerta

- **ACEPTAR la implementación principal de C02 en revisión estática**: lenguaje llano, tooltip exacto `Enviado`, encabezado fiscal por estado, motivo 1109 solo en RECHAZADO, HTML/CSS de UI, pruebas automáticas verdes y alcance sin SQL ni cambio funcional de KuDE.
- **NO marcar PRO-365 como Done/homologada** por F01, F02, F03 y ausencia de validación visual real. Mantener **PRO-365 In Review**, PR #7 Draft sin merge.
- Una próxima corrección **C02-C01** puede limitarse a aviso neutro por posible discrepancia en `APROBADO` y copy claro del aviso KuDE no verificado, siempre preservando las protecciones; **no autorizar ni ejecutar por esta auditoría**. Requiere orden nueva/autorización del responsable, commit + CI + reauditoría. No abrir R03 por iniciativa.
- **No desplegar** C02 a la VM sin revisar F01/F02 y comprobar visualmente el resultado. No ejecutar SQL ni scripts, ni alterar facturación, SIFEN, stocks, ACL o documentos históricos.

**Esta auditoría añade exclusivamente un archivo documental.**
