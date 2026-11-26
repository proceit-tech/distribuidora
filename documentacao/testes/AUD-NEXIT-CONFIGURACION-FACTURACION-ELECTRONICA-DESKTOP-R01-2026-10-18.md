# AUD-NEXIT-CONFIGURACION-FACTURACION-ELECTRONICA-DESKTOP-R01 — Auditoría funcional individual

**Fecha:** 18/10/2026. **Menú exacto:** Administración → Facturación electrónica, ruta /configuracion/facturacion-electronica. **Rama:** feature/NEXIT-2026-001-banco-demo. **Estado:** AUDITORÍA ESTÁTICA DOCUMENTADA — HALLAZGOS ABIERTOS — NO HOMOLOGADO. No confundir con Facturación → Facturas, cuya pantalla es /facturas/nueva y se auditará separadamente.

**Método y fuentes:** código GitHub actual: CLAUDE.md, documentacao/PROTOCOLO-IA.md, PROGRESSO-NEXIT-V1.md, navegación; page.tsx (233 líneas), page.module.css (134), layout.tsx, GET/PUT app/api/facturacion/configuracion/route.ts y POST app/api/facturacion/configuracion/probar/route.ts; lib/facturacion/configuracion-gateway.ts (167), gateway-credenciales.ts, gateway.ts, servidor.ts, envio.ts, prueba sintética configuracion-gateway.casos.ts (336 líneas), migración NEX-061-facturacion-gateway-credenciales-empresa.sql (249), reversión y prueba SQL T25. Blob de pantalla: f70bb1c45e798b531f8245742b6243521aba415d; blob servicio: 544dc942ba94b4ef5018383eed75a4f2ec9b01f2; blob migración: ac55fd43ba71ee533f50b8d613a74f5f6dd29516. Los blobs no demuestran la versión instalada. **0 pruebas ejecutadas por ChatGPT, sin PostgreSQL/VM/gateway/browser/build/lint/tsc/CI/deploy.** Históricos de tests solo inspeccionados.

## 1. Función específica y límites

Configurar las credenciales de la API fiscal de LA EMPRESA DE LA SESIÓN, probar la autenticación con el gateway, cambiar usuario (RUC) o contraseña, observar si hay configuración y el resultado/fecha de última prueba. La pantalla NO sirve para emitir factura, modificar CDC, administrar puntos, confirmar SIFEN, descargar KuDE/XML ni reconsultar documentos.

**Contratos preservados:**
- Menú, layout y APIs GET/PUT/POST exigen FACTURACION_ELECTRONICA.CONFIGURAR; SQL SECURITY DEFINER revalida usuario/empresa, sin confiar en empresaId enviada por el cliente.
- Empresa y URL de gateway de PRUEBA son readonly. Usuario 1–60 caracteres; contraseña 1–200 cuando se informa; en blanco conserva la guardada, pero no puede darse de alta una nueva sin clave.
- GET nunca devuelve contraseña ni token, solo indicador tienePassword, nombre empresa, URL, usuario, activo, ultimaPruebaAt y estado. Cache-Control: no-store. Contraseña permanece en estado temporal del formulario y se limpia después de guardar.
- PUT guarda en tablas de empresa, invalida caché de tokens local y la versión de credenciales, y limpia el resultado de la última prueba cuando cambian.
- Probar conexión solo hace POST /api/login, NO recepcion_de, consulta_de, numeración, documento ni estado SIFEN. Respuestas OK/CREDENCIALES_INVALIDAS/NO_DISPONIBLE/TIMEOUT. Resultado INFORMADAS de inputs no guardados NO actualiza el estado de la configuración; GUARDADAS sí y ANTERIORES se descarta por versión.
- NEXIT_DB solo lee credenciales guardadas de la empresa en PostgreSQL; NO recurre a variables globales NEXIT_FE_NEXIT_DB_*. Referencias legadas distintas conservan compatibilidad existente sin compartir empresa.
- NEX-061 contiene tabla de claves separada, sin acceso directo del rol runtime, función de lectura con permisos, bitácora inmutable y control de intentos. La decisión del responsable de almacenar claves sin cifrado en reposo está documentada; no reabrirla unilateralmente.
- CONFIGURADO en la pantalla de emisión significa credenciales presentes y configuración local válida, NO login remoto reciente, aceptación del gateway ni aprobación SIFEN. Los indicadores de la página administrativa distinguen guardado de última prueba.

## 2. Matriz campo por campo / API / SQL

| Función | Evidencia | Evaluación estática |
| --- | --- | --- |
| Menú/layout | lib/navigation/menu.ts:334–339 y layout.tsx:4–7 | Permiso CONFIGURAR |
| Carga GET de empresa | page.tsx:56–76; API GET route.ts:7–17; configuracion-gateway.ts:93–119 | Solo empresa y usuario de sesión; contraseña no devuelta |
| Empresa/URL readOnly | page.tsx:174–184; gateway-credenciales.ts:12–15 | No permite modificar endpoints desde UI |
| Usuario y contraseña | page.tsx:182–218; configuracion-gateway.ts:39–53 | Entrada/longitud/forma y retención opcional de clave |
| Guardar PUT | page.tsx:82–102; API PUT route.ts:20–47; NEX-061:95–145 | SECURITY DEFINER, empresa de sesión, versión incrementada y prueba anterior invalidada |
| Probar POST | page.tsx:103–120; API probar/route.ts:7–34; configuracion-gateway.ts:136–167 | Solo login, fuente GUARDADAS/INFORMADAS/ANTERIORES y no SIFEN |
| Seguridad SQL | NEX-061:39–50,82–93,148–160,224–249 | ACL segregada, función segura, audit log sin clave |
| Rate limit compartido | NEX-061:169–197 | 5 intentos/5 minutos, intervalo 3s en estado existente; **CFG-D01** sobre creación concurrente |
| Prueba de credenciales efectivas | configuracion-gateway.ts:150–160 | **CFG-D02** mezcla RUC no guardado y clave anterior si campo password vacío |
| Edición durante actividad | page.tsx:45–54,82–120,182–218 | **CFG-D03** campos siguen editables durante guardado/probar |
| Recarga error | page.tsx:56–76,113–116 | **CFG-D04** conf previa permanece visible sin foto reciente |
| Prontitud emisión FE | envio.ts:43–85 y gateway.ts:34–59 | CONFIGURADO comprueba presencia, no login exitoso; decisión de política |
| Pruebas anteriores | configuracion-gateway.casos.ts; T25-nex061-gateway-config.sql | Cubren clave aislada, versión, roles, 429 secuencial y gateway falso; sin prueba first-row concurrente |
| Experiencia escritorio | page.module.css y page.tsx | Caja 820px, dos columnas, estados/acciones; falta captura y prueba real a 1440/1920 |

## 3. Hallazgos nuevos del menú

### CFG-D01 — MEDIA — control de intentos puede exceder 5/ventana si las primeras pruebas son concurrentes

**Evidencia:** NEX-061:178–183 hace SELECT ... FOR UPDATE por empresa. Cuando la fila aún no existe, dos o más solicitudes simultáneas pueden ver NOT FOUND. Todas pasan a INSERT ... ON CONFLICT DO UPDATE SET intentos=intentos+1 y **RETURN 0** sin reevaluar cantidad máxima ni la espera de 3s en rama ON CONFLICT. Una vez creada la fila, :184–196 serializa y limita como previsto.
**Riesgo:** un usuario autorizado a CONFIGURAR podría ejecutar una ráfaga concurrente inicial mayor que el límite nominal, produciendo llamadas adicionales al login. **No se reprodujo en PostgreSQL; análisis lógico del SQL, no incidente de seguridad operativo probado.**
**Aceptación:** crear y bloquear la fila ANTES de decidir el intento, o UPSERT atómico que evalúe después cantidad/tiempo efectivos; con 2, 5, 6 y 10 conexiones iniciales simultáneas, jamás superar la política (3 s y 5/5 min), 429 sin llamar al gateway. Una futura corrección solo por migration incremental si NEX-061 ya fue aplicada en el ambiente real: verificar schema_migrations antes.

### CFG-D02 — MEDIA — probar RUC editado con campo clave vacío reutiliza contraseña guardada y forma credencial híbrida

**Evidencia:** page.tsx:103–111 envía {apiUsuario: usuario,password} incluso si solo se modificó el RUC. configuracion-gateway.ts:148–156 determina ruc=p.apiUsuario ?? guardado.ruc y password=p.password ?? guardado.password; el valor vacío se transforma en null al validar. Por tanto RUC nuevo + contraseña previa se prueba sin explicitarlo en la pantalla. El resultado queda clasificado INFORMADAS y no se guarda.
**Escenario:** guardado A/K, operador digita RUC B, no escribe clave; se llama login B/K. La prueba puede rechazar la pareja mezclada y el operador no sabe qué combinación se ensayó.
**Aceptación:** diferenciar «Probar credenciales guardadas» de «Probar datos digitados»; si cambia el RUC, exigir contraseña informada o indicar inequívocamente que se conservará la clave anterior, según decisión de UX. No divulgar password. Test A/K, B/vacío, A/K2, B/K2 y credenciales versionadas.

### CFG-D03 — MEDIA — campos editables mientras guardar/probar está en curso permiten perder cambios del operador

**Evidencia:** page.tsx:45–54,82–120 deshabilita Guardar/Probar mediante ocupado, pero los inputs y botón Mostrar/Ocultar en :182–218 permanecen activos. Tras PUT setUsuario(j.apiUsuario), setPassword("") y tras una prueba GUARDADAS/ANTERIORES setVersion fuerza refetch que ejecuta setUsuario(j.apiUsuario) sin verificar cambios hechos mientras esperaba.
**Escenario:** operador inicia Probar con credenciales guardadas y, durante la espera, escribe nuevo RUC. El GET posterior a la respuesta puede reemplazar el RUC editado y dejar la contraseña nueva escrita, mezclando versiones.
**Aceptación:** bloquear todos los controles de edición durante solicitudes o versionar el estado editado y aplicar respuesta solo a la versión enviada; no sobrescribir cambios silenciosamente. Pruebas promesas retrasadas PUT/POST/GET y cambio de sesión.

### CFG-D04 — BAJA — error de recarga mantiene ficha antigua visible sin distinguir que está desactualizada

**Evidencia:** page.tsx:56–76 recarga cuando version cambia. No limpia ni marca conf como stale en el inicio; catch establece error, pero conserva la configuración previa y botón de guardar posible si ocupado vuelve a "". Un nuevo resultado de credenciales no aplicado puede coexistir con vista anterior.
**Aceptación:** aviso inequívoco «Datos anteriores / No se pudo actualizar», retry sin pérdida de texto digitado y nunca indicar prueba OK de versión distinta como vigente. Test falla GET después de ANTERIORES y éxito posterior.

**Balance confirmado por inspección:** **0 ALTAS, 3 MEDIAS, 1 BAJA**. CFG-D01 requiere confirmación concurrente PG; D02–D04 son escenarios de UI/servidor derivados del código, no reproducidos en navegador.

## 4. Observaciones/decisiones no tratadas como nuevos defectos

- **CFG-O01:** Configurada ≠ Autenticación correcta. El usuario puede tener clave guardada pero última prueba FAIL/Sin probar; estado de emisión local muestra CONFIGURADO. Exigir último OK antes de enviar requiere aprobación de negocio y SLA, NO modificación silenciosa de envío.
- **CFG-O02:** URL gateway-bebidas-py.e-factura-hub.com está fija como ambiente de prueba por alcance PRO-133. Gestión posterior prueba/homologación/producción necesita decisión; no permitir URL arbitraria del cliente.
- **CFG-O03:** clave guardada sin cifrado en reposo por decisión aprobada; verificar en operación grants reales, secretos en backup y logs, sin exponer claves en auditoría.
- **CFG-O04:** permiso CONFIGURAR de clase ADMINISTRATIVA sin seed a perfiles normales; admin empresa lo tiene por definición. Verificar perfil/grant real en VM sin asumir asignación.
- **CFG-O05:** distinción NEXIT_DB vs credencial_ref legada y aislamiento tokens por empresa están implementados; preservar correcciones UI-R01-01/02.
- **CFG-O06:** último estado GUARDADAS usa versión bajo lock SQL; credenciales INFORMADAS no se guardan. No reabrir race UI-R01-02 corregida.
- **CFG-O07:** API valida usuario por longitud, no regex fiscal de RUC; no imponer formato con/sin DV hasta confirmar contrato del proveedor.
- **CFG-O08:** NEX-061 versionada/no aplicada según encabezado histórico; el estado real del esquema actual es DESCONOCIDO sin VM. No ejecutar ni editar migrations aplicadas.
- **CFG-O09:** CSS desktop compacto sin evidencia renderizada 1440/1920, foco/aria real ni performance; el menú no es móvil.

## 5. Pruebas básicas dirigidas futuras (0 ejecutadas)

| Caso | Criterio |
| --- | --- |
| CFG-T01 | Admin A autorizado para su empresa; operador sin CONFIGURAR y empresa B → 403 sin clave |
| CFG-T02 | GET devuelve indicador de clave, nunca password ni token; no caché público |
| CFG-T03 | Guardar primera credencial, reemplazar, cambiar usuario y mantener password en blanco: versión/auditoría correctas |
| CFG-T04 | Probar SOLO login sin crear documento/número, distinguir GUARDADAS/INFORMADAS/ANTERIORES |
| CFG-T05 | 10 pruebas SQL simultáneas de primera fila con múltiples conexiones: límite 5 y 3s efectivo |
| CFG-T06 | RUC editado solo con contraseña vacía: combinación realmente probada inequívoca |
| CFG-T07 | Campo editado durante PUT/POST: ningún cambio de formulario perdido |
| CFG-T08 | GET tras resultado ANTERIORES falla y se recupera: stale visible y botón retry |
| CFG-T09 | Cambio de versión durante prueba → resultado viejo no se aplica a clave nueva |
| CFG-T10 | Timeout, credenciales malas, fallo red/HTTP 5xx, 429 y secreto ausente sin fuga |
| CFG-T11 | NEXIT_DB sin credenciales no usa variables globales; otras empresas y refs legadas aisladas |
| CFG-T12 | Verificar real grants, SECDEF/search_path, log inmutable y ausencia de claves en logs/backups visibles |
| CFG-T13 | 1440px/1920px desktop: empresa/URL readonly, foco, errores, mensaje, contraseña oculta y fecha PY |
| CFG-T14 | Probar no cambia estado SIFEN; CONFIGURADO local sin última prueba OK no se confunde con homologación |
| CFG-T15 | UI y servidor con error de base / migration ausente → mensaje seguro, no formulario engañoso |
| CFG-T16 | Solo migración incremental autorizada si NEX-061 aplicada; no mutar scripts históricos |

## 6. Cierre

Auditoría individual del menú **Administración → Facturación electrónica** documentada, no homologada. **3 MEDIAS + 1 BAJA** y 9 observaciones; 16 casos futuros. Se preservan los cambios históricos de PRO-133, la exclusividad de credenciales por empresa y el vínculo de la prueba con la versión SQL. Ningún test real, ninguna migration, code change o tarea de implementación autorizada a Claude.

**Menús V1 que siguen pendientes de auditoría individual:** Facturación → Facturas (/facturas/nueva), Puntos de expedición (/facturacion/puntos), Notas de crédito (/notas-credito). Plataforma → Empresas está en flujo separado. No cerrar la auditoría general ni comenzar correcciones antes de autorización del responsable.