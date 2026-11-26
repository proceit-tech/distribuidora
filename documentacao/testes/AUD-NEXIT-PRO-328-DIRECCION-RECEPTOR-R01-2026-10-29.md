# AUD-NEXIT-PRO-328-R01 — Auditoría independiente de código de dirección seleccionada como receptor SIFEN

**Fecha:** 29/10/2026 · **Analista/auditor:** ChatGPT · **Desarrollador:** Claude  
**Commit auditado:** [`e551943d9742212d1b85b0f4a841d058f33be9c4`](https://github.com/proceit-tech/distribuidora/commit/e551943d9742212d1b85b0f4a841d058f33be9c4) · **branch:** `feature/NEXIT-2026-001-banco-demo`.  
**Requisito:** [PRO-328](https://linear.app/proceit/issue/PRO-328), paquete [PRO-329](https://linear.app/proceit/issue/PRO-329).  
**Especificación:** [ORD-CLAUDE-NEXIT-CM-PRO-328-DIRECCION-SELECCIONADA-2026-10-29.md](../ordens/ORD-CLAUDE-NEXIT-CM-PRO-328-DIRECCION-SELECCIONADA-2026-10-29.md) + [AUDITORÍA DE SOLICITUDES 29/10](../analises/AUD-NEXIT-CASA-MINGO-SOLICITUDES-2026-10-29.md).

## 1. Dictamen

**CONFORME ESTÁTICAMENTE EN EL ALCANCE DEL COMMIT. Sin nuevo defecto correctivo probado al comparar diff, código íntegro y contratos de migrations preexistentes. NO HOMOLOGADO.**

- El commit modifica **7 archivos**: `app/(private)/facturas/nueva/entrega-cliente.tsx`, `page.tsx`, `lib/facturacion/emision.ts`, `lib/facturacion/payload-fe.ts`, `lib/facturacion/info-adicional.ts`, `lib/facturacion/entrega-e04.casos.ts` y crea `documentacao/banco/nexit/v1/migraciones/NEX-076-facturacion-fe-direccion-receptor-seleccionada.sql`.
- Casos automatizados identificados en el código: **50 identificadores PRO328-xx**; **ninguno ejecutado**. Ocho son aserciones estructurales de código/SQL, NO pruebas reales de PostgreSQL.
- **NEX-076 solo versionada**, no aplicada; sus funciones no existen de manera acreditada en el PostgreSQL real en este turno. El nuevo caso con dirección elegida se bloquea intencionalmente con **422** hasta instalación autorizada. Este dictamen **no autoriza** aplicar la migration o emitir FE reales.
- El documento auditado y la migration son potencialmente fiscales: una revisión estática, aun sin defectos evidentes, no demuestra ejecución correcta, pertenencia de roles, compilación, orden de grants, tratamiento de concurrencia en PostgreSQL real ni respuesta visual del gateway/KuDE.

## 2. Reglas verificadas por inspección

| ID | Regla de negocio / invariante | Código y evidencia | Dictamen |
|---|---|---|---|
| CA-01 | FE nueva usa dirección seleccionada en campos del receptor, sin mezclar domicilio fiscal | `emision.ts::receptorSeleccionado` lee `fe_direccion_receptor_elegida` por empresa, usuario, cliente, UUID; `payload-fe.ts` serializa `cPaisRec,dDirRec,dNumCasRec,cDepRec,cDisRec,cCiuRec` | CONFORME CÓDIGO |
| CA-02 | Sin destinos elegibles, se mantiene dirección fiscal; con destinos y sin elegir, se rechaza | `resolverEntrega` preservado; `emision.ts`; casos 20–25 | CONFORME CÓDIGO |
| CA-03 | Dirección no elegible, de otro cliente/empresa, sin número o jerarquía geográfica invalida; no se completa con fiscal | `fe_direccion_receptor_elegida` + `validarGeografiaReceptor` + `erroresDomicilioReceptor` + casos 23–36 | CONFORME CÓDIGO |
| CA-04 | B2F país extranjero/calle/número, sin campos PY | `domicilioFiscalJSON` y `NEX-076` condicionan `cDepRec,cDisRec,cCiuRec`; casos 40/41 | CONFORME CÓDIGO |
| CA-05 | En FE nueva, `dInfAdic` no añade línea de entrega; preserva observación y vendedor | `emision.ts` usa `componerInfoAdicional({observaciones,vendedor})`; parser de `info-adicional.ts` legado no removido; casos 10–14 | CONFORME CÓDIGO |
| CA-06 | La revisión presenta exactamente el domicilio del receptor y exige huella en nueva FE con dirección | `resumen.receptorDomicilio/receptorHuella`, `page.tsx` transmite hash al confirmar; `crearFacturaElectronica` exige coincidencia | CONFORME CÓDIGO |
| CA-07 | Dirección cambia luego de previa: impedir nueva FE; lock en transacción SQL antes de emitir | `NEX-076::fe_documento_crear_fe_receptor`: `FOR SHARE OF d` + comparación payload + verificación snapshot de NEX-068; `NEX-068::fe_documento_crear_fe_con_stock_entrega` usa `FOR SHARE` también | CONFORME DISEÑO ESTÁTICO; NO PROBADO BAJO CONCURRENCIA |
| CA-08 | Idempotencia: conservar FE y `dInfAdic` histórico; comparar destino por UUID, no por texto | `emision.ts::equivalente` conserva payload histórico verificado; `NEX-076` compara `documento_electronico_entregas.direccion_id`; `NEX-048` conserva `entrada_hash` como invariante de contenido | CONFORME DISEÑO ESTÁTICO |
| CA-09 | Seguridad: tenant, cliente, permiso y grants mínimos | Lectura `SECURITY DEFINER` con `usuario_tiene_permiso`, join cliente/empresa, predicado de elegibilidad; `NEX-076` revoca `PUBLIC` e incorpora helper de grants después de NEX-074 | CONFORME DISEÑO ESTÁTICO; REQUIERE VALIDAR ROL REAL |
| CA-10 | No modificar NCE, KuDE PRO-326, CDC, stock, numeración o migrations antiguas | Diff de 7 archivos, sin modificar rutas de NCE/KuDE ni NEX-005/068/074; wrapper se apoya en funciones instaladas | SIN REGRESIÓN DIRECTA COMPROBADA POR DIFF |
| CA-11 | Ausencia de NEX-076 bloquea FE con dirección seleccionada, sin fallback fiscal silencioso | `receptorSeleccionadoSoportado` y error `MENSAJE_RECEPTOR_SIN_MIGRACION` 422 | CONFORME CÓDIGO |

## 3. Contratos SQL y supuestos comprobados en Git (no ejecutados)

1. `NEX-068`: `fe_entrega_elegible(tipo,es_fiscal,es_entrega_default)`; `documento_electronico_entregas` guarda `direccion_id` y snapshot JSON keys `direccion`, `numeroCasa`, `pais`. La migration nueva compara exactamente esas keys; no confunde los nombres descriptivos con los códigos.
2. `NEX-074`: `fe_documento_crear_fe_vendedor(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid)` envuelve NEX-068 y preserva registro de vendedor independiente.
3. `NEX-048`: `fe_documento_crear_fe` verifica `entrada_hash` en reintentos y no reasigna numeración con la misma clave. En esta ruta el código TS reenvía el payload histórico verificado y NEX-076 añade comparación del destino UUID.
4. `NEX-052`: el envoltorio `nex_aplicar_grants_runtime()` descubre helpers `nex_aplicar_grants_*` por nombre y los aplica en orden. `nex_aplicar_grants_facturacion_vendedor_receptor` se ordena después de `..._vendedor`, revocando su acceso directo y dejando solo el wrapper nuevo para runtime.
5. `NEX-076` no redefine las migrations antiguas. No se ha comprobado contra catálogos, estados ni roles del banco real.

## 4. Límites, riesgos y gate de aceptación

**No ejecutado por Claude ni ChatGPT en esta entrega:** 0 tests, 0 lint, 0 typecheck, 0 build, 0 SQL, 0 migration, 0 gateway, 0 navegador, 0 despliegue, 0 pruebas de simultaneidad. Contar los 50 casos fuente no equivale a que pasen. No calificarlo como homologación.

**Validaciones necesarias antes de liberar operación real**, en ambiente/ventana humana autorizada:
- Comprobar backup verificable y permisos/roles de los objetos; ejecutar el preflight NEX-076 y validar CREATE FUNCTION, dependencias, grants y su reaplicación. **No aplicar por este informe.**
- Pruebas dirigidas: FE nueva con destino válido/diferente del fiscal, FE sin destino, destino ajeno, incompleto y B2F; verificar JSON fiscal devuelto y `dInfAdic`, no solo vista previa. 
- Test de edición concurrente de destino entre revisión/emisión, rollback íntegro, numeración/stock/vendedor/snapshot; reintento de FE ya existente y dirección luego editada/eliminada, diferente UUID con texto idéntico, y rol sin permisos.
- PDF/KuDE real: verificar con proveedor que el encabezado usa esos campos del JSON; la plantilla es externa (PRO-298).
- Si la migration falla, **no realizar ajustes manuales ni abrir un fallback a domicilio fiscal**; registrar error y retornar al gate ChatGPT.

**Decisión:** PRO-328 a **In Review**, no Done. No nueva orden correctiva al Claude por defecto. La siguiente tarea de código del paquete PRO-329 se libera sólo bajo nueva orden explícita y manteniendo NEX-076 sin aplicar hasta autorización operacional. La vieja PRO-327 UI/API sigue pendiente/pausada, SQL 561 ya aplicado y verificado, no repetir.
