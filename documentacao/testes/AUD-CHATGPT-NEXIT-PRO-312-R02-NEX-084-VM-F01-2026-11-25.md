# Diagnóstico F-VM-084-01 — controle 63 — 25/11/2026

**Causa identificada: política geral de EXECUTE em funções trigger, sem revogação direta posterior no helper R05. NEX-084 instalada, imutável. Correção incremental recomendada, não autorizada ainda.**

## Evidência real VM (terminal fornecido pelo responsável)
Diagnóstico read-only, BEGIN/ROLLBACK, sem alterações. As três leituras R05 têm EXECUTE=true: fe_e03_conexion_referencia_r05(uuid,uuid,uuid), fe_e03_estado_operacion_r05(uuid,uuid,uuid,uuid), fe_e03_operacion_por_correlacion_r05(uuid,uuid,uuid,uuid).
Três auxiliares internos com EXECUTE efetivo indevido:
- fe_e03_r05_evidencia_guarda()
- fe_e03_r05_operacion_inicio_guarda()
- fe_e03_r05_post_grande_guarda()
Proprietário de cada função nexit_app, ACL literal {nexit_app=X/nexit_app,nexit_runtime=X/nexit_app}. pg_default_acl para funções: 0 linhas. pg_auth_members para membro nexit_runtime: 0 linhas. Concessão direta confirmada. Controle 63 falha pela segunda condição, não pelas leituras. Evidência anterior: NEX-084 SHA-256 38d45ea661ed5d8f1dc3d43dc6b0f727f8872c6bdd0fbab5745cc7802f5b6854, 84 migrations, 40/41 controles, R05 vazio, app vigente ativa.

## Rastreabilidade estática
NEX-014-movimientos-operativos.sql:530–536 concede EXECUTE a todas as funções trigger de public que não sejam extensão; NEX-037:114–122 renomeia base e a chama no wrapper; NEX-052-productos-cambio-unidad-base-stock.sql:146–154 chama nex_aplicar_grants_runtime_base() e depois descobre helpers em ordem de nome. aplicar-migraciones.sh ao final reaplica nex_aplicar_grants_runtime(). NEX-084-facturacion-e03-envio-r05.sql:2284–2350 helper R05 revoga PUBLIC dos auxiliares, não revoga EXECUTE direto de nexit_runtime nos auxiliares. A cadeia explica precisamente os três grants observados. CI efêmero pode tolerar ausência de runtime, portanto verde não prova este ACL real.
Reserva: o diagnóstico/controle 63 filtrou prefixo fe_e03_r05_; não examinou nex_e03_r05_estado_guarda() (também trigger criada em NEX-084), nem todos os auxiliares de outro prefixo. Não afirmar que só existem três grants fora desse conjunto. Não há evidência de uso indevido, alteração de dados ou emissão; trigger não é função fiscal de chamada ordinária.

## Correção focal proposta — PRO-312-R02-C03 / NEX-085 (número candidato livre no PR)
Exige autorização expressa antes de ordem ao Claude. NEX-084 aplicada: NEX-001..084 intocáveis; preservar checksums. Nova migration incremental para corrigir helper R05 de forma persistente após concessão base, não apenas REVOKE avulso que volta no próximo runner. Preferir redefinição focal do helper R05 existente preservando exatamente ACTIVO/REVERTIDO, tabelas, 7 escrituras e 3 leituras; revogar EXECUTE explícito de nexit_runtime nos auxiliares NEX-084 (inventário completo de funções internas, inclusive 4 guardas trigger e classificador/helpers fora de prefixo). Não alterar política geral de grants de outros módulos nem funções fiscais, stock, KuDE, FE/NCE, app, código HTTP. Preservar execução automática dos triggers por PostgreSQL e DEMO. Verificar dependências/roles e NEX-085 livre no catálogo antes de aplicação. Preflight, verificar e reversão protegida específicos da correção; reversão não deve reintroduzir indevidamente privilégios sem decisão explícita. Preservar script verificar-NEX-084 e controle 63; verificação nova distingue 3 leituras, 7 escrituras conforme modo, auxiliares sem EXECUTE efetivo, PUBLIC, reaplicação de wrapper e gatilhos, sem alterar NEX-084. Se necessário para validar reaplicação, caso escrito e homologação separada em ambiente descartável com runtime real (CI atual não comprova); não mudar runner/CI sem autorização. Não criar migração nem aplicar SQL nesta auditoria.

## Estado
PRO-312/321 In Review; gate PRO-309 mantido. F-VM-084-01 diagnosticado, correção pendente. Não ativar B/C, não executar REVOKE manual, não reaplicar NEX-084 nem grants como tentativa de correção. Sem ordem ativa.