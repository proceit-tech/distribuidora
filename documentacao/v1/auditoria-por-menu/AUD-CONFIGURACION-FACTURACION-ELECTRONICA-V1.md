# Auditoría por menú — Administración → Facturación electrónica

**Ruta:** /configuracion/facturacion-electronica. **Rama:** feature/NEXIT-2026-001-banco-demo.
**Estado al 18/10/2026:** AUDITORÍA ESTÁTICA INDIVIDUAL R01 DOCUMENTADA — **3 MEDIAS + 1 BAJA ABIERTAS — NO HOMOLOGADO**. En curso la auditoría general NEXIT; Claude no autorizado a corregir ni se permite inferir despliegue.

**Informe canónico detallado con archivos, líneas, casos y propuestas:** [AUD-NEXIT-CONFIGURACION-FACTURACION-ELECTRONICA-DESKTOP-R01](../../testes/AUD-NEXIT-CONFIGURACION-FACTURACION-ELECTRONICA-DESKTOP-R01-2026-10-18.md).

## Función exclusiva

Gestionar credenciales de la API del gateway fiscal de la empresa de la sesión, comprobar login y mostrar última prueba. No es el formulario para EMITIR Facturas (/facturas/nueva), no gestiona documentos, eventos ni numeración. Empresa/URL de prueba son readonly; usuario API RUC, contraseña y estado de última conexión constituyen el formulario. Se mantiene permiso FACTURACION_ELECTRONICA.CONFIGURAR, la ausencia de secretos en GET/log, las funciones SQL SECURITY DEFINER y la política de credenciales NEXIT_DB exclusivamente por empresa. Probar conexión llama solo a login, no emite ni aprueba SIFEN. NEX-061 está versionada; estado de aplicación en VM no verificado.

## Cobertura R01 estática

Pantalla 233 líneas + CSS 134; layout y navegación, GET/PUT /api/facturacion/configuracion, POST /api/facturacion/configuracion/probar, servicios gateway/credenciales/servidor, preflight Facturas, migración NEX-061 de 249 líneas, reversión, prueba SQL T25 y casos TypeScript 336 líneas ya versionados (NO ejecutados). Se comparó la implementación vigente con correcciones históricas PRO-133 UI-R01-01/02, sin reabrir dichas correcciones.

## Hallazgos

- **CFG-D01 / MEDIA, riesgo de concurrencia SQL:** en NEX-061:178–183, si la primera fila del rate limit por empresa aún no existe, solicitudes simultáneas pueden entrar en INSERT ON CONFLICT y RETURN 0 sin reevaluar 3 s/5 intentos. Requiere test real concurrente para confirmar comportamiento operativo y futura migration incremental autorizada si la NEX-061 ya fue aplicada.
- **CFG-D02 / MEDIA, mezcla de prueba:** al cambiar RUC y dejar password vacío, configuracion-gateway.ts:148–156 combina nuevo usuario con clave guardada anterior; el operador no ve claramente que la prueba usa pareja híbrida.
- **CFG-D03 / MEDIA, ediciones en curso:** page.tsx:82–120 bloquea botones pero no inputs; respuestas de Guardar/Probar/refresco pueden sobrescribir un RUC editado mientras el HTTP estaba pendiente.
- **CFG-D04 / BAJA, estado de refresco:** page.tsx:56–76, falla GET de refresco después de la prueba y sigue mostrando conf previa sin marcar claramente datos obsoletos.

**Observaciones y decisiones, no bugs nuevos:** «CONFIGURADO» significa credenciales locales presentes y NO prueba de login OK; eventual exigencia de última prueba exitosa para emitir es decisión comercial pendiente. URL fija de gateway de prueba aprobada para esta fase. Almacenamiento de contraseña sin cifrado es decisión explícita con ACL restrictiva; no cambiarla sin autorización. Permiso administrativo/roles, NEX-061 realmente aplicada, y prueba de navegador desktop quedan pendientes de confirmación humana. Controles anteriores que evitan fallback a variables globales para NEXIT_DB y vinculan prueba a versión de credenciales siguen preservados.

**Matriz de aceptación:** CFG-T01…CFG-T16 en informe técnico. **Ejecución real: 0**; sin browser, PostgreSQL, VM, gateway, build, migrations ni CI manual. No homologación.

## Estado del plan global

Siguientes menús V1 sin auditoría individual actual: Facturación → Facturas, Facturación → Puntos de expedición, Facturación → Notas de crédito. Plataforma → Empresas tiene flujo propio. Menús ocultos fuera de V1 requieren decisión de alcance. No liberar correcciones Claude hasta decisión expresa del responsable.
