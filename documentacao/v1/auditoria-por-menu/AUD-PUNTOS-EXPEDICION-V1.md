# Auditoría por menú — Facturación → Puntos de expedición

**Ruta:** /facturacion/puntos. **Fecha:** 18/10/2026. **Estado:** AUDITORÍA ESTÁTICA INDIVIDUAL R01 DOCUMENTADA — 1 ALTA, 1 MEDIA y 1 BAJA ABIERTAS — NO HOMOLOGADO. **Branch:** feature/NEXIT-2026-001-banco-demo.

**Informe técnico detallado** (fuentes/lineas, evidencias, matrices y 18 pruebas futuras): [AUD-NEXIT-PUNTOS-EXPEDICION-DESKTOP-R01](../../testes/AUD-NEXIT-PUNTOS-EXPEDICION-DESKTOP-R01-2026-10-18.md).

## Función del menú

Administrar puntos de expedición por empresa, establecimiento, sucursal y tipo de documento FE/NCE/NRE/NDE/AFE. Crear punto administrativo y primera secuencia en una llamada/una transacción (NEX-064, ajustada NEX-065); reutilizar mismo punto para tipos adicionales. Confirmar serie y último número real, ver próximo número referencial, activar/desactivar únicamente el tipo FE o NCE, filtrar y ver el estado sin perder ni reiniciar numeración. Sólo FE/NCE cuentan con emisión; configurar NRE/NDE/AFE NO habilita emitirlos. La reserva fiscal efectiva es del SQL con lock, el primer rango va SIN SERIE 0000001…9999999, pasa AA…ZZ, último ZZ-9999999 agota. No introducir timbrado como nueva dimensión automática del contador ni presumir integración gateway.

## Hallazgos R01

- **PUN-D01 ALTA — opción de estado engañosa al configurar:** la UI page.tsx:231–246 abre «Configurar» con activar=false incluso para FE/NCE activo y la casilla «Dejar este tipo activo» queda desmarcada; :212–228 manda false. NEX-063:536–537 interpreta false como MANTENER, no desactivar. Resultado: el usuario puede confirmar/guardar y el tipo sigue emitiendo pese a su expectativa. Mantener acción separada Desactivar por tipo, definir semantics del checkbox/estado y verificar resultado real.
- **PUN-D02 MEDIA — «Activo · disponible para emitir» aunque serie ZZ agotada:** la UI page.tsx:345,359 y filtro Activos :127–131 sólo comprueban tipo emitible+activo. El helper puntos.ts:146–151 sabe que proximo «Agotada» en ZZ-9999999 y la reserva SQL rechaza; debe distinguir estado administrativo de disponibilidad efectiva.
- **PUN-D03 BAJA — tabla antigua tras fallo GET:** page.tsx:80–105 conserva sucursales y muestra acciones tras fallo de recarga; el error de carga sí aparece. Marcar datos obsoletos/bloquear acciones hasta refresco confiable.

**Balance:** 1 ALTA + 1 MEDIA + 1 BAJA, 9 observaciones y 18 tests dirigidos futuros. Sin bug comprobado de número duplicado/rollback; concurrencia SQL real no ejecutada en esta rodada.

## Controles anteriores preservados

- PUNTOS en layout/API/SECURITY DEFINER; empresa y usuario de sesión, sucursal en alcance.
- Alta tipo única NEX-064 con advisory lock de empresa+establecimiento+punto, una sola confirmación, no duplicación ni puntos huérfanos, conservación de identidad fiscal.
- NEX-065 versionada sustituye estado global del punto por estado de cada tipo FE/NCE, y revoca las funciones heredadas en el rol runtime. FE sólo revisa FE y NCE sólo NCE. Activar/desactivar tipo no modifica otra secuencia.
- Serie inicial NULL/«Sin serie», rollover AA…ZZ, comparación monotónica, reserva transaccional por tipo, numeración referencial distinta de definitiva, logs.
- La UI anterior con formulario en dos etapas y botón físico global ya no corresponde al código actual; no reabrir sus defectos sin regresión.

## Dependencias y observaciones no contabilizadas como defectos

**Principal bloqueo operativo de evidencia:** PROGRESSO-NEXIT-V1.md:1259–1268 registra intento de aplicar NEX-065 en VM que falló por validación textual de índice, seguido de corrección del archivo y verificadores; **no se constató aplicación real posterior**. Para saber si la emisión actual efectivamente ignora el estado físico del punto, responsable humano debe verificar migration instalada, definición de funciones FE/NCE, grants y snapshot de NEX-065 (sin tocar VM con la IA). Sin ello no prometer independencia real instalada.

Además: toggles directos sin diálogo extra son mejora sujeta a decisión; filtro «Inactivos» incluye NRE/NDE/AFE que están «configurados, emisión no disponible» por semántica deliberada, no regresión; fallback de esquema pre-NEX063 presume estado para solo lectura, riesgo condicionado; coordinación con ERP externo y GATEWAY-SERIE-01 (null/ausencia) sin confirmar; evidencia visual DESPUÉS y foco de diálogos desktop pendientes de validación humana. No exigir soporte móvil en este sistema desktop.

## Estado y continuación

**Auditoría estática individual completada; NO HOMOLOGADO.** ChatGPT ejecutó **0 tests, 0 SQL, 0 VM, 0 Docker, 0 gateway, 0 browser/build/CI, 0 cambios funcionales**, Claude no autorizado. La auditoría general continúa. Después de este menú, **21 entradas V1** documentadas estáticamente, resta el menú activo **Facturación → Notas de crédito** para revisión individual. Plataforma → Empresas permanece por flujo separado; menús ocultos no forman entrega operativa sin decisión.
