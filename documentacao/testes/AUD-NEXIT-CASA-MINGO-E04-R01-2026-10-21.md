# AUD-NEXIT-CASA-MINGO-E04-R01 — Direcciones de entrega en FE

**Fecha de revisión:** 21/10/2026  
**SHA funcional del Claude:** `cf7b9055e0dbdb56f4a0cdf09b09c929455a2372`  
**Alcance:** E04 / PRO-200 y PRO-93; NEX-068 (schema, permisos, funciones SQL), UI de Facturas, cliente, controlador de carga, servidor, scripts y tests. 
**Evidencia:** commit/diff y archivos versionados en GitHub; contratos de `NEX-005-clientes.sql`, `lib/clientes/relacionados.ts`, `NEX-067`, `NEX-052`, `CLAUDE.md`, `PROTOCOLO-IA.md`, `HANDOFF-CLAUDE-NEXIT-CASA-MINGO-2026-10-20.md` y progreso pertinente.
**Modalidad:** auditoría estática; **SIN ejecución de PostgreSQL, scripts, VM, pruebas Node, navegador, Docker, SIFEN ni CI por ChatGPT**. Los 38 tests E04 y las regresiones son resultados **informados por Claude, no reproducidos**.

## Dictamen
**E04-R01 — CORRECCIÓN SOLICITADA. NO APROBAR MIGRACIÓN/DEPLOY; NO INICIAR E05.**

Hallazgos:
- **F-001 MEDIA — FK bloquea eliminar direcciones ya utilizadas en FE.** Contradice CRUD previo de `Clientes → Direcciones` y crea error al borrar. Conservar el snapshot histórico sin impedir mantenimiento del catálogo.
- **F-002 MEDIA — filtro excluye direcciones COMERCIAL registradas como sucursales.** Con cero `ENTREGA/SUCURSAL/default`, el sistema considera al cliente «sin destinos», permite emitir sin selección y oculta filiales válidas. La clasificación heredada `COMERCIAL` existe como opción válida y tipo predeterminado en el modelo NEX-005. Requisito aprobado: mostrar las filiales **ya registradas**, no solo las etiquetadas con tipos específicos.

### Matriz RN/CA → implementación → prueba → resultado

| Regla | Código | Resultado |
| --- | --- | --- |
| Destinos solo del cliente y empresa actual | `fe_entrega_opciones(p_empresa,p_usuario,p_cliente)`, GET autenticado, comprobación en `prepararFactura` | Conforme en el recorte estático |
| Predeterminado automático y cambio de filial | `entrega-control.ts` elige `esDefault` y acepta `elegir` válido | Conforme estructural; navegador no probado |
| Cambio/quitar cliente y respuestas tardías | secuencia+AbortController y `entregaVigente.clienteId === clienteIdActual` | Conforme estructural; pruebas simuladas |
| Sin destinos se factura y muestra aviso | `pendienteEntrega` y `EntregaCliente` | Conforme **solo cuando de verdad no hay destinos**; F-002 puede ocultar destinos existentes |
| Destino no altera dirección fiscal ni emisor | `prepararFactura` resume por separado; no altera `payload-fe.ts` ni KuDE | Conforme |
| Emisión con stock y destino atómicos | `fe_documento_crear_fe_con_stock_entrega` llama wrapper NEX-067, luego valida y guarda snapshot | Conforme en diseño; transacción real PG no verificada |
| Snapshot histórico inmutable | `documento_electronico_entregas` + trigger de inmutabilidad | Conforme parcialmente; F-001 impide eliminar direcciones del catálogo |
| Reutilización idempotente | `IF NOT v_reutilizado` no reescribe destino | Conforme estructural |
| Seguridad y permisos | función SECURITY DEFINER con permiso FE.CREAR, empresa de sesión, grants helper posterior a NEX-067 | Coherente estaticamente; roles/GRANT reales no verificados |
| Reversión / preflight / verificación | tres scripts nuevos + procedimiento | Versionados; no ejecutados |
| Lista de 5 filiales ya cadastradas | `WHERE tipo IN ('ENTREGA','SUCURSAL') OR es_entrega_default` | **F-002**: omite COMERCIAL y OTRA no predeterminada aunque sea filial real |

## F-001 — MEDIA — bloqueo no previsto de CRUD histórico de direcciones

**Evidencia exacta:**
- NEX-068, líneas 32–43: `documento_electronico_entregas.direccion_id uuid NOT NULL` y `CONSTRAINT fe_entregas_direccion_fk FOREIGN KEY (empresa_id, direccion_id) REFERENCES direcciones_cliente (empresa_id, id)`. **Sin ON DELETE**, PostgreSQL aplica NO ACTION/RESTRICT; un destino referenciado no puede borrarse de la tabla maestra.
- `lib/clientes/relacionados.ts`, líneas 319–322: proceso estándar de edición de Clientes usa `DELETE FROM direcciones_cliente WHERE ... id = ANY(...)` y cuenta los borrados. Después de la primera FE con destino, borrar esa dirección da violación de FK, con rollback de la edición. No existe tratamiento UX específico del caso.
- NEX-068 ya almacena `snapshot jsonb` inmutable, pensado para conservar el destino original aunque cambie el catálogo. Un FK obligatorio al registro maestro impide el borrado aunque la fotografía sobreviva.

**Impacto:** regresión real para Clientes → Direcciones tras emitir FE; catalogo e históricos acoplados innecesariamente.

**Corrección al Claude:** ajustar **NEX-068 aún no aplicada** para preservar snapshot/destino histórico y permitir eliminación futura de dirección maestra de manera controlada. Preferir referencia histórica UUID sin FK rígida a `direcciones_cliente`, manteniendo validación de pertenencia/elegibilidad bajo lock en la emisión y snapshot inmutable; o adoptar política de borrado lógico si el sistema ya la soporta de punta a punta (no inventar flujo nuevo). Mantener FK de empresa/documento y protección cross-tenant. Ajustar `verificar`, procedimiento y tests (antes/después, borrar dirección usada, historial sigue íntegro). **No modificar NEX-005 aplicada ni código de Clientes salvo estricta justificación.** Verificar coherencia del campo `cliente_id` con la FE y su referencia histórica.

## F-002 — MEDIA — sucursales COMERCIAL invisibles

**Evidencia exacta:**
- NEX-068, líneas 73–75 y 93–101: solo son elegibles `ENTREGA`, `SUCURSAL` o `es_entrega_default`. `lib/facturacion/entrega.ts` copia esa lista y `resolverEntrega` decide que no hay destinos si se devuelve vacía.
- `NEX-005-clientes.sql`, dirección tipo `text NOT NULL DEFAULT 'COMERCIAL'`; la UI/Catálogo `Clientes → Direcciones` permite guardar `COMERCIAL` sin marcar default. Cliente con cinco direcciones de sucursales heredadas clasificadas `COMERCIAL` → `fe_entrega_opciones` devuelve **cero**. FE se emite sin destino y el operador no puede elegir las cinco filiales, contrariamente al pedido.
- `entrega-e04.casos.ts` EN-50/52 revalida el mismo filtro SQL y no cubre un cliente con cinco filiales de tipo COMERCIAL.

**Corrección al Claude:** definir elegibilidad operacional **sobre todas las direcciones de sucursal/entrega ya registradas**, sin excluir injustificadamente las filiales cuya clasificación histórica sea COMERCIAL. Como mínimo, incluir `COMERCIAL` no fiscal, manteniendo el domicilio `FISCAL` solamente como dato fiscal salvo que esté explícitamente marcado para entrega; evaluar `OTRA` usando el contrato existente y el requisito del usuario, sin pedirle reetiquetar cinco filiales. La lista GET, validación servidor, NEX-068 y tests deben aplicar **idéntica regla**. Sin modificar datos del cliente ni cambio de domicilio fiscal/SIFEN. Añadir casos con 5 direcciones COMERCIAL, solo FISCAL, predeterminado y mezcla de tipos.

## Otros límites operativos sin bloqueo nuevo

- NEX-067 sigue no aplicada; NEX-068 depende de 067. No implantar nueva aplicación ni correr migraciones sin respaldo, preflight y autorización humana.
- SQL NEX-068 usa `SECURITY DEFINER`, snapshot y restricciones; concurrencia, rollback, permisos y trigger necesitan prueba real de PostgreSQL para homologación.
- `entrega-e04` reportó **38** verificaciones, 0 fallas; regresiones declaradas por Claude sin fallos (facturacion 271, ajuste-fiscal 41, fat-e2 44, monedas 84, credito 91, pagos 77, rediseno 90, revision-factura 42, stock-e02 61, descuentos-e03 47, cantidad-e01 16, visual-v1 29, nce 205, kude 96, buscador-rapido 40); TypeScript/ESLint puntuales reportados limpios. No ejecución independiente.
- No se solicitó usar el destino en gateway/SIFEN/KuDE; mantenerlo exclusivamente logístico e interno según requisito.
- No declarar «aprobado visualmente» sin navegador real, capturas y aceptación del responsable.

## Gate E04-R02

Claude corrige **solo F-001 y F-002** en E04 y sus verificaciones/scripts, respetando `CLAUDE.md`, `PROTOCOLO-IA.md`, progreso vigente y especificación. Tests dirigidos que demuestren mantenimiento de un domicilio antes/después de FE sin pérdida de snapshot y lista de cinco filiales COMERCIAL. Commit/push con SHA, resultados y limitaciones; detenerse para nueva auditoría E04-R02. No E05, SQL real, deploy ni homologación.
