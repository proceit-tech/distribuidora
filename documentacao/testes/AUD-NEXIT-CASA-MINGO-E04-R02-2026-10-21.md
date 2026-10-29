# AUD-NEXIT-CASA-MINGO-E04-R02 — Dirección de entrega en la factura

**Auditoría:** 21/10/2026
**SHA funcional:** `7d42e64e6e9acb6c83abbfd298be4b16084b2980`
**Anterior:** `cf7b9055e0dbdb56f4a0cdf09b09c929455a2372`
**Referencia:** `AUD-NEXIT-CASA-MINGO-E04-R01-2026-10-21.md` / PRO-205 / PRO-206 / PRO-93 / PRO-200.

## Dictamen

**E04-R02 CONFORME ESTÁTICAMENTE — PRO-205 y PRO-206 corregidos.** Se permite avanzar a **E05 únicamente como desarrollo aislado**, siguiendo el protocolo de una entrega, tests puntuales, commit/push y parada para auditoría. **No implica homologación**, ni ejecución o autorización de migraciones NEX-067/NEX-068 en la VM real.

Auditoría de código/diff, migraciones, permisos, contratos y tests versionados; **el auditor NO ejecutó PostgreSQL, pruebas Node, navegador, API SIFEN, CI, SQL ni deploy**.

## PRO-205 — Corregido en revisión estática

- NEX-068: `documento_electronico_entregas.direccion_id` ahora es UUID histórico **sin FK rígida** contra `direcciones_cliente`; conserva PK por (empresa, documento), FK hacia empresa y documento, snapshot JSONB con disparador de inmutabilidad. La validación de propiedad de cliente/empresa y elegibilidad del destino sigue en emisión con `FOR SHARE`.
- `Clientes → Direcciones` usa `DELETE FROM direcciones_cliente` (`lib/clientes/relacionados.ts`) y la NEX-068 no lo impide después de facturar. El snapshot/UUID histórico quedan preservados. La eliminación efectiva y el trigger solo se comprobarán en PostgreSQL real.
- `crearFacturaElectronica`: nueva consulta perezosa `documentoExiste()` por `empresa_id + clave_idempotencia` evita consultar nuevamente el destino una vez que la FE existe; también omite replantear/rebajar stock en ese caso. La función SQL de base (`fe_documento_crear_fe` de NEX-065) **continúa validando el hash del contenido fiscal y alcance al reutilizar**, por lo que no se acepta cambiar el payload fiscal con la misma clave.
- La consulta directa a `documentos_electronicos` es compatible **en los grants versionados**: NEX-047 `nex_aplicar_grants_facturacion` concede SELECT a `nexit_runtime` y NEX-013/base reaplica lectura. Esto no sustituye el test de permisos real.
- Las consultas de datos originales en `prepararFactura` (receptor, productos y punto) todavía se ejecutan en reintentos; el cambio de E04 elimina la revalidación del destino y del reparto, **no promete reintentos cuando otros catálogos hayan quedado indisponibles**. Sin nuevo hallazgo bloqueante en el alcance del patch.

## PRO-206 — Corregido en revisión estática

- `fe_entrega_elegible(tipo, es_fiscal, es_default)` define una regla única: `es_default OR (NOT es_fiscal AND tipo <> 'FISCAL')`. Usada exactamente en `fe_entrega_opciones`, comprobación `EXISTS` y selección bajo `FOR SHARE` del wrapper de emisión.
- Tipos no exclusivamente fiscales incluidos: `ENTREGA`, `SUCURSAL`, `COMERCIAL` y `OTRA`. Un domicilio fiscal único sin `es_entrega_default` no se propone como destino; un fiscal expresamente principal sí.
- El endpoint HTTP utiliza `fe_entrega_opciones` de empresa y usuario de sesión; la UI exhibe todas las opciones devueltas, preseleccionando la principal y limpiando las anteriores al cambiar cliente. La dirección logística no modifica domicilio fiscal ni JSON SIFEN, KuDE o establecimiento emisor.

## Matriz de aceptación

| Caso | Resultado estático | Límite |
| --- | --- | --- |
| Cinco filiales COMERCIAL | Regla SQL y prueba EN-60/61 incluyen las cinco y preselección de default | Sin navegador |
| Cliente solo FISCAL | Regla niega destino y permite factura con aviso | Sin navegador |
| Editar/borrar dirección después de FE | NEX-068 sin FK al catálogo, snapshot inmutable en diseño | Sin ejecución PG (E-10) |
| Reintentar misma FE después de borrar dirección | Consulta previa por idempotencia y wrapper SQL no reescriben entrega | Prueba simulada, sin concurrencia PG |
| Nueva FE con dirección eliminada/ajena | Lista y validación servidor/SQL rechazan; previa no reserva numeración | Sin PG real |
| Roles, transacciones e idempotencia concurrente | Contratos revisados, sin contradicción nueva evidente | Validar grants y locks de NEX-067/068 al aplicar |

## Testes e limitações

**Relatados pelo Claude, não reexecutados pelo ChatGPT:** `entrega-e04` **49 verificações, 0 falhas**, 11 novas; regressões facturacion 271, ajuste-fiscal 41, stock-e02 61, descuentos-e03 47, fat-e2 44, monedas 84, credito 91, pagos 77, rediseno 90, revision-factura 42, cantidad-e01 16, visual-v1 29, nce 205, kude 96, buscador-rapido 40, todas com 0 falhas; TypeScript e ESLint pontuais sem erros. Os novos casos SQL usam simulador/asserções estruturais, não execução do trigger e das FK reais.

As migrations `NEX-067` e `NEX-068` permanecem **não aplicadas**; a aplicação com esses wrappers falha fechada antes da aplicação. Os testes de homologação E-01…E-10, pré-verificação e grants reais serão executados somente pelo responsável após decisão de deploy, com backup e preservação dos dados.

## Gate

1. **PRO-205 e PRO-206: correções tecnicamente aceitas no Git; não marcar Homologado/Done por ausência de teste operacional.**
2. **E04 concluída somente para gate de desenvolvimento estático.** E05 (visual PYG, rótulo estabelecimento e preservação de zeros à esquerda de códigos) pode ser iniciada pelo Claude **como tarefa separada**, com teste dirigido, commit/push e parada para auditoria E05-R01.
3. **Não aplicar migrations, SQL, Docker ou app na VM por ação de IA.** Validar E04 em navegador, com cliente de cinco endereços e exclusão posterior, somente quando o responsável autorizar atualização no ambiente único.
