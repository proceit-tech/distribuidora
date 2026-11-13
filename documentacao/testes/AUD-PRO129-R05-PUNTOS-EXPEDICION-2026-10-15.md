# AUD-PRO129-R05 — aceptación técnica de PRO-129

**Fecha:** 2026-10-15. **SHA auditado:** `d968c83e31bb579df62b351447c06aa059b711c7`. **Branch oficial:** `feature/NEXIT-2026-001-banco-demo`. **Dictamen:** **ACEPTADA TÉCNICAMENTE** la implementación de PRO-129 para pasar a homologación operacional controlada. No equivale a homologación de VM/navegador/gateway.

## Comprobación

- Se consultaron `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, avance `PROGRESSO-NEXIT-V1.md`, `AUD-PRO129-R04`, SHA/diff, `T20-concurrencia-puntos.sh` y ejecución automática de GitHub Actions.
- El commit modifica solamente `T20-concurrencia-puntos.sh` (dos expectativas de texto booleano) y `PROGRESSO-NEXIT-V1.md`. Las expectativas ahora son `7/false` y `10/true`, coherentes con la concatenación SQL `ultimo_numero || '/' || activo`. No toca NEX-057/058/059, APIs, permisos, funciones ni triggers.
- **CI automático [run 38773310510](https://github.com/proceit-tech/distribuidora/actions/runs/38773310510), job 116554449829: completed/success**. Log comprobado: `M1` **59 migrations aplicadas** en un PostgreSQL descartable, `T19` **78 verificaciones OK**, `T20` **24 verificaciones OK** (concurrencia de altas/activaciones y las dos carreras nuevas UPDATE de establecimiento contra alta de punto), resumen **689 PASS, 0 fallas**. Restauración y análisis SQL del CI también pasaron. Ningún SQL/VM operativo fue ejecutado por ChatGPT. Las pruebas básicas locales `bash -n` y suite PRO-129 fueron reportadas por Claude, no reejecutadas por el auditor.
- **AUD-PRO129-R01/R02/R03/R04:** todos los hallazgos corregidos. Se preservan numeración monotónica, aislamiento por empresa/sucursal, confirmación explícita del último número, grants sin acceso directo a bitácora, bloqueo de identidad fiscal, protección posterior del establecimiento, orden de locks y no creación de puntos órfanos bajo las carreras probadas.

## Puerta operacional pendiente (a cargo del responsable humano)

**No ejecutar automáticamente en VM.** Antes de migrar hay que obtener el inventario exacto de `public.schema_migrations` con versiones y checksums. La NEX-057 original fue editada en Git tras su publicación; si se aplicó una variante antigua a la VM, no es seguro continuar con NEX-058/059 sin una reconciliación incremental aprobada. Comprobar también la aplicación de NEX-056/058/059, hacer backup, preflight y solo entonces aplicar mediante el runner oficial con autorización. El último número realmente emitido por otros sistemas/gateway debe ser confirmado por el administrador fiscal; la API no concilia esos números automáticamente. La pantalla de puntos y el envío SIFEN siguen sin homologación operacional en navegador/gateway.

**Estado recomendado en Linear:** mantener PRO-129 `In Review` hasta la verificación y aceptación operacional humana; actualizar comentario con cierre técnico R05. No abrir nuevas tareas al Claude por esta auditoría ni iniciar PRO-128 sin autorización del responsable.
