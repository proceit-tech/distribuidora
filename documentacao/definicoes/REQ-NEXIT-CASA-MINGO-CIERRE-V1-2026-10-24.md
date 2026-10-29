# REQ-NEXIT-CASA-MINGO-CIERRE-V1 — Decisiones de responsabilidad y plan de entregas

**Fecha:** 24/10/2026. **Fuente:** documento del cliente *PENDIENTES AJUSTES CASA MINGO - Sistema Nextit 22-10-2026.docx* (páginas 1–2) y decisión posterior explícita del responsable. **Branch:** `feature/NEXIT-2026-001-banco-demo`.
**Seguimiento:** Linear proyecto `P-PRO-2`, tareas `PRO-91`, `PRO-93`, `PRO-94`, `PRO-109`, `PRO-72`, `PRO-108`, `PRO-79` y `PRO-115`. No homologado.

## Distribución de responsabilidades definitiva

| Tema | Responsable | Criterio |
| --- | --- | --- |
| Cabecera KuDE (RUC/emisor, email, dirección, teléfono, WhatsApp) | Responsable humano en portal/proveedor API | Se configura fuera de NEXIT; validar RUC/certificado y PDF real. NO codificar en NEXIT. |
| Diseño estándar del PDF FE (A4, una vía, 23–25 líneas, sin columna Cod. de Barra, Código ancho) | Responsable humano/proveedor API | No implementar HTML, CSS, impresión ni posprocesamiento PDF alterno en NEXIT. |
| Diseño estándar del PDF NCE (Código ancho, ocultación de bloque fijo vacío y ubicación visual de vendedor) | Responsable humano/proveedor API | El proveedor dispone el diseño. NEXIT suministra texto al campo de información. |
| Información adicional FE/NCE dentro del JSON de emisión | Claude / NEXIT | Contrato fiscal J003 `dInfAdic`; composición automática ver E1. |
| Fecha de emisión FE editable (−30/+5 días) | Claude / NEXIT | Validación fiscal/servidor/gateway en E3, no modificar fechas sin revisar impacto CDC. |
| Usuarios = Vendedores | Claude / NEXIT | Gestión segura de cuentas en E2; vendedor de emisión = usuario autenticado, no crear master duplicado. |
| Movimientos mostrar enteros sin decimales innecesarios | Claude / NEXIT | Cambio de formato E4; conservar cantidades fraccionarias reales. |
| Informe de Ventas, Informe de Compras | Claude / NEXIT | E5 y E6; compras requiere fuente documental real, no datos DEMO. |
| Informe gerencial costo/margen | Etapa posterior opcional | Cliente dijo «si es posible», fuera del gate V1 salvo autorización. |
| Reposicionar Resumen (guaraníes) abajo | Ya versionado FE-UX-C03 | No reimplementar; solo homologar el navegador real. |

## Base normativa de Información de interés

**SIFEN Manual Técnico v150**: Grupo J `J003 / dInfAdic` (longitud 1–5000, 0-1), sección 13.4.5 y regla de validación 282/2503. **J003 no forma parte del XML enviado a SIFEN ni del documento firmado.** Es información adicional para el documento/KuDE entregado al receptor; se envía por el contrato JSON específico del proveedor, que el responsable confirma que reconoce el **mismo nombre `dInfAdic`**. No crear sinónimos ni ponerlo en el XML firmado.
Referencia oficial: https://ekuatia.set.gov.py/documents/20123/420592/Manual%2BT%C3%A9cnico%2BVersi%C3%B3n%2B150.pdf/e706f7c7-6d93-21d4-b45b-5d22d07b2d22?t=1687362295907.pdf.

## E1 — Primera entrega Claude autorizada: dInfAdic FE/NCE (PRO-93/94)

**Código existente comprobado (HEAD 1762725557bcf51b366ac61be0ee34785cb53adc):** `lib/facturacion/payload-fe.ts` emite `dInfAdic: nulo(e.infoAdicional)`; `emision.ts` valida `direccionEntregaId`, recupera `destino.opcion`, prepara el resumen y persiste la selección; `lib/facturacion/payload-nce.ts` ya emite `dInfAdic` desde `observacion`; `lib/auth/session.ts` trae `usuario.nombre`, `apellido`, `usuario` y `empresa_id` desde sesión. No inventar campo adicional.

**RN-E1-01 FE:** desde entrega validada por el servidor y autorizada para cliente/empresa, incluir texto de **Dirección de entrega:** identificando la sede y la dirección que efectivamente seleccionó el operador. En FE sin destino, omitir esa línea. Nunca substituir domicilio fiscal del receptor ni tomar una dirección sin validar del navegador.

**RN-E1-02 FE y NCE:** usar nombre/apellido de cuenta autenticada que ejecuta efectivamente la emisión como **Vendedor:**, con origen de datos autoritativo y empresa de la sesión. Persistir la representación del vendedor en el snapshot de la emisión para que un cambio posterior de nombre no modifique documentos históricos. NCE usa su emisor real, no copiar vendedor de la FE original. Reusar esquema/snapshot ya presente, y crear migration incremental solo si estrictamente imprescindible y documentada sin aplicarla.

**RN-E1-03 Composición:** preservar `Observaciones` introducidas por el operador (FE/NCE), incluidas observaciones de corrección de NCE rechazada. Añadir líneas automáticas en orden estable, separadores inequívocos, eliminar duplicados y conservar la misma cadena en previa, confirmación, reintento y payload persistido. Nunca concatenar repetidamente por una segunda revisión o resend.

**RN-E1-04 Longitud:** contar sobre el texto final hasta 5000 caracteres (límite del proveedor J003); validar en el servidor **antes** de reservar número o hacer llamada; error explícito ante exceso, no truncar silenciosamente. Sin datos reales ni observaciones puede seguir nulo sólo si no hay ningún bloque aplicable.

**RN-E1-05 Aislamiento/fiscalidad:** no modificar `iTiDE`, `CDC`, liquidación de IVA, secuencia, stock, condición de pago, identidad del receptor ni contrato de KuDE `POST /api/kude`; no insertar J003 en XML firmado. Proteger datos personales de logs y respuestas ajenas.

**CA-E1-01..10:**
1. FE con dirección A vs B: JSON `dInfAdic` usa exactamente A/B, sin variar domicilio fiscal;
2. FE sin dirección no fabrica destino;
3. FE con observación conserva el texto más dirección y vendedor;
4. NCE con observación conserva el texto más vendedor de NCE;
5. Usuario A emite FE, usuario B emite NCE: vendedor distinto y correcto;
6. Multitenancy/permiso: no exponer nombre de otro usuario;
7. 5000 permitido / 5001 rechazado con error claro antes de reservar;
8. Múltiples previews/retries son idempotentes y el snapshot histórico es inmutable;
9. Corrección de NCE rechazada preserva la observación más los datos correctos;
10. JSON de gateway usa **la misma clave exacta `dInfAdic`** tanto FE como NCE, sin cambiar contrato de KuDE/CDC/SIFEN; el PDF real pertenece a homologación humana.

**Tests:** focales de composición real y rutas FE/NCE, casos de regresión de emisión, corrección NCE, ACL y límites, TypeScript/ESLint puntual. Sin CI manual ni suites globales; sin VM, SQL aplicado, deploy, gateway real o homologación por Claude.

**Entrega:** commit/push, pruebas y SHA completo, atualizar `PROGRESSO-NEXIT-V1.md` economicamente; no editar AUD-* del ChatGPT; PARAR para auditoría E1-R01 independiente.

## E2..E6 — Tareas siguientes en Linear, sin iniciar hasta auditoría E1

- **E2 / PRO-109 + PRO-72**: página real Usuarios de empresa, permisos/credenciales, equivalencia vendedor=usuario y pruebas tenant; sin master independiente de vendedores.
- **E3 / PRO-93**: fecha FE editable 30 días atrás y 5 futuros, con zona PY, restricciones de transmisión normal/extemporánea, coherencia de firma/CDC, límites/rechazo SIFEN y pruebas en extremos.
- **E4 / PRO-79**: sólo presentación de cantidades enteras sin ceros decimales; conservar exactitud de cantidades fraccionarias.
- **E5 / PRO-108**: Informe de Ventas fiscal conciliable y basado en FE/NCE según estados; filtros y exportación.
- **E6 / PRO-108**: localizar fuente real de Compras; si no existe en alcance V1, no inventar o mostrar datos ficticios. Proponer decisión de fuente mínima antes del informe.

**Gate V1 operativo** (PRO-115, PRO-113, PRO-114, PRO-198): evidencia de migrations, certificado/RUC SIFEN, KuDE provedor configurado, carga 561 productos y stock actual, pruebas integradas y autorización humana. Ningún código equivale a homologación o despliegue.
