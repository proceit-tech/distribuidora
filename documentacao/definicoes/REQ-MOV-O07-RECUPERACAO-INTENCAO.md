# REQ-MOV-O07 — Recuperação durável de uma intenção indeterminada de Movimientos

**Data de definição:** 19/10/2026  
**Status:** DEFINIDO / IMPLEMENTAÇÃO AUTORIZADA PELO RESPONSÁVEL — ainda não implementado nem homologado.  
**Menu:** Inventario → Movimientos / Nuevo movimiento, desktop, espanhol PY.  
**Referências:** AUD-NEXIT-MOVIMIENTOS-DESKTOP-R04 a R07; MOV-O07; PRO-79 e PRO-182; NEX-014 (`documentacao/banco/nexit/v1/migraciones/NEX-014-movimientos-operativos.sql`).  
**Projeto:** `proceit-tech/distribuidora`, branch `feature/NEXIT-2026-001-banco-demo`.  
**Responsabilidades:** Claude Code implementa, versiona código/migrations e testes no Git; ChatGPT faz auditoria independente R08; responsável humano executa quaisquer scripts na única VM/banco real e valida a operação. Nunca homologar pela mera publicação.

## 1. Problema e decisão aprovada

A chave de idempotência K1 e o snapshot de `crearControlRegistro` hoje residem somente no `useRef` de `app/(private)/movimientos/nuevo/page.tsx`. Quando há POST com COMMIT e resposta perdida, a operação fica `INDETERMINADO`. Um refresh, fechamento de aba/navegador, logout/login ou saída consentida destrói K1; nova visita cria K2 e permite repetir fisicamente a mesma entrada/saída. O aviso atual recomenda consultar o histórico, mas isso não constitui uma barreira técnica contra duplicação.

**Decisão explícita do responsável:** implementar recuperação segura e durável da intenção K1 e payload, isolados por usuário/empresa, com consulta do resultado original, retry com a MESMA chave e política de expiração/reconciliação. **Não há comprovação de duplicação passada.**

**Arquitetura aprovada como requisito:** a fonte de verdade de tentativas deve estar no **PostgreSQL**, não em `localStorage`, `sessionStorage`, IndexedDB nem cache de processo/React como única persistência. A memória da tela pode espelhar estado não autoritativo; dados de estoque/payload e credenciais não são expostos nem armazenados persistentemente no navegador.

## 2. Invariantes de integridade

**RN-01 — Preparação durável anterior ao registro:** antes de qualquer POST com capacidade de alterar estoque, gerar K1 uma única vez, validar e reservar duravelmente no servidor (COMMIT independente) K1, snapshot exato e vínculo `empresa_id + usuario_id`. Se a reserva falhar ou sua confirmação se perder, NÃO registrar estoque; ao reabrir, descobrir a intenção via servidor. Não gerar K2 para recuperar K1. Usar chave imprevisível (crypto UUID) e limites validados de payload.

**RN-02 — Registro transacional/idempotente:** registrar sempre com K1 e dados originais reservados no servidor. A execução do movimento e a marcação `CONFIRMADA` da intenção devem ser atômicas quando possível, usando o motor `inventario_registrar_movimiento` e a unicidade atual `(empresa_id, clave_idempotencia)` da NEX-014. Uma perda de resposta após COMMIT não pode gerar novo estoque nem K2. Revisitar a tela deve mostrar o número original ou oferecer retry seguro com K1.

**RN-03 — Corrida/cross-tab:** não permitir reserva de segunda intenção para o mesmo `empresa_id + usuario_id` enquanto a anterior puder ter sido executada e ainda estiver sem resultado conclusivo. O bloqueio deve ser autoritativo no backend/banco (índice/lock/transação), NÃO só disabled na UI. POSTs simultâneos da mesma K1 são serializados; o resultado é único. Reavaliar caminhos existentes `POST /api/movimientos` para que o fluxo novo não possa ser contornado inadvertidamente pela própria UI, sem quebrar rotas já contratadas. Não alterar NEX-014 aplicada: qualquer evolução exige migration **incremental**.

**RN-04 — Recuperação na abertura:** antes de habilitar novo registro, buscar no servidor as tentativas do usuário/empresa atuais. Se há pendência, reconstruir estado `RECUPERANDO/INDETERMINADO` com K1 e snapshot canônico, formular dados bloqueados e mostrar em espanhol contexto do movimento. Controles: `Consultar resultado` (GET somente leitura), `Reintentar el mismo registro` (POST idempotente, só após regra de autorização), `Ver movimientos`. Nunca revalidar o payload original a partir de um formulário que mudou, nem trocar silenciosamente K1.

**RN-05 — Confirmação e ausência de confirmação:** verificar no backend pela combinação `empresa_id`, `clave_idempotencia`, `creado_por` e permissão/escopo vigentes, usando `movimientos_inventario`, sem confiar em IDs ou empresa fornecidos pelo browser. Só comprovar `CONFIRMADA` com evidência do movimento correspondente (e compatibilidade do payload). `Não encontrado` em leitura isolada NÃO prova que não está em transação em voo. GET não registra nem anula estoque. Se houver prova de rejeição definitiva sem COMMIT, liberar correção/nova intenção; se resultado incerto, reter K1 e bloquear K2, inclusive após 400/401/403/409 posteriores (conforme PRO-185).

**RN-06 — Isolamento e autorização:** empresa e identidade derivadas apenas da sessão autenticada (não do cliente); `MOVIMIENTOS.CREAR` para criar/repetir, `MOVIMIENTOS.VER` e regras de depósitos para visualizar detalhes. Nunca revelar tentativa, payload, número, custos ou existência de outro usuário/empresa; usar resposta neutra 404 quando apropriado e aplicar limites de acesso server-side. Login de OUTRO usuário no mesmo navegador nunca herda K1. Mesmo usuário com nova sessão **deve** recuperar a intenção; não vincular persistência ao ID efêmero de sessão. Evitar vazamento em logs, query string, métricas, local storage e mensagens de erro. Os privilégios de `nexit_runtime` seguem modelo de funções SECURITY DEFINER/grants mínimos do projeto; não conceder acesso direto irrestrito à nova tabela.

**RN-07 — Retenção/expiração segura:** diferenciar *prazo de atenção operacional* de *liberação de chave*. Após **7 dias** sem resolução, sinalizar `REQUIERE_REVISION` e restringir reenvio automático se for necessário por segurança; **NÃO apagar, expirar para liberar K2 ou marcar rejeitado por tempo**. Uma intenção incerta só sai da condição bloqueante após confirmação conclusiva ou reconciliação administrativa justificada, auditada e provada sem COMMIT. Tentativas confirmadas/rejeitadas podem ser arquivadas conforme política de retenção, sem apagar a unicidade/auditoria do movimento. Não adicionar cron, job de limpeza de pendência nem scheduler autônomo.

**RN-08 — UX e saída:** texto espanhol PY claro: `El movimiento PUEDE haberse registrado` quando incerto; não informar `cancelado`, `no registrado` nem `revertido` sem prova. Sair/fechar a tela não cancela a operação nem elimina o checkpoint. Substituir o `Descartar este intento` atual como mecanismo de liberar K2 sob incerteza; bloquear esse atalho até resolução inequívoca, sem permitir reativá-lo via reload. No erro de recuperação (API offline, sessão inválida, timeout), mostrar erro e `Reintentar`, mantendo o registro novo bloqueado: falhar fechado, não voltar a modo `LIBRE`.

**RN-09 — Credenciais, dados e governança:** nenhum token/segredo, contexto completo do usuário, credencial SIFEN ou password no snapshot. Ser conservador sobre campo livre de motivo/observação e retenção PII. Sanitizar erros e evitar logs de payload. Aplicar proteções de concorrência, limites, validação do formato e origem, sem usar dados fictícios nem DEMO_MODE para autorização real. A API jamais deve confiar em K1 como uma credencial de acesso.

## 3. Estados sugeridos (ajustar à arquitetura real do repositório, documentando decisão)

`RESERVADA` (checkpoint confirmado, sem conclusão) → `EN_PROCESO` (pode ser somente transiente) → `CONFIRMADA` (movimento e número resolvidos), ou `RECHAZADA_DEFINITIVA` se não houve operação, ou `INDETERMINADA` e eventualmente `REQUIERE_REVISION` após prazo de atenção. Qualquer timeout/crash/5xx/4xx depois de indeterminado **preserva** possibilidade de COMMIT e chave K1. Estados duráveis não devem mentir sobre ausência de COMMIT, e sua transição deve ser verificável por banco/transações. Não marcar `CONFIRMADA` só por uma resposta HTTP sem referência persistida.

Na primeira chamada, uma reserva sem movimento confirmado continua recuperável; retry usa K1 original. Após COMMIT e resposta perdida, consulta retoma número original. Para mensagens de 401/403 após perda de conexão, não liberar nova intenção. Se token/permissão expirou, mostrar restrição e exigir nova sessão/acesso legítimo, nunca aprovar por credencial K1.

## 4. Arquitetura de integração e SQL

Claude deve inspecionar **estado mais recente do Git antes de escolher numeração**. Neste momento a pasta de migrations contém NEX-001…NEX-065, portanto o candidato natural é **NEX-066**, mas não presumir se novos commits surgirem.

Projetar migration incremental para armazenar tentativas por empresa + usuário com K1, payload/snapshot canônico, status, carimbos, hash/versão e referências de resultado, chaves/índices/constraints de isolamento e exclusão de pendências duplicadas. A implementação de backend deve estabelecer transações/locks e expor endpoints autenticados apenas para reservar, recuperar, consultar e confirmar/repetir, reutilizando validações e motor existentes.

**Caminho preferido:** reserva prévia no servidor, consulta de pendências na abertura e POST de execução usando dados persistidos; resultado do movimento e estado da intenção confirmados dentro da mesma transação. Verificar se é necessário adaptar o POST atual; não manter bypass funcional que gere K2 sem consultar pendências. Em todas as leituras e mutações, verificar `creado_por = session.user.id` e `empresa_id = session.user.empresaId`; somente chave K1 não autentica. Não mover controles de estoque para o frontend. O hash da NEX-014 não inclui todos os metadados como dono, motivo/observação; checar autoria e compatibilidade do snapshot pelo registro da intenção em vez de inferir titularidade do mero match de K1.

Se surgirem necessidades de funções `SECURITY DEFINER`, grants e rollback, criá-las na nova migration; não reescrever migrations já aplicadas. Preparar scripts de **pré-verificação somente leitura, aplicação explicitamente separada/autorizada, validação e rollback/reversão segura quando possível** para execução futura exclusivamente pelo responsável na VM. Sem acessar VM, Docker, banco, `.env` ou CI manual. Não executar migrations nem deploy.

## 5. Casos obrigatórios de teste dirigido

- **T01:** reserva K1 commitada antes do POST; falha na reserva NÃO dispara movimentação.
- **T02:** resposta perdida após reserva → recarregar página → recuperar K1 e payload; jamais K2.
- **T03:** POST K1 COMMIT mas resposta perdida → refresh/logout/login do mesmo usuário → servidor confirma número original sem duplicar.
- **T04:** POST K1 sem COMMIT confirmado → retry com K1 original, `repetido`/registro único.
- **T05:** GET devolve movimento apenas com empresa, dono, permissões/depósitos autorizados; outra empresa/usuário recebe ausência neutra/negação sem payload nem número.
- **T06:** sessão expirada e login posterior do mesmo usuário recuperam a intenção; 401/403 depois de indeterminado não liberam K2.
- **T07:** operador de outra empresa e outro usuário da mesma empresa não podem acessar/reexecutar K1 da origem.
- **T08:** duas abas tentam reservar novos movimentos simultaneamente para o mesmo usuário/empresa: somente uma intenção incerta ativa; guardas no banco.
- **T09:** dois POSTs concorrentes da K1 usam mesmo snapshot, uma única linha movimento e efeito de estoque, com serialização segura e repetido.
- **T10:** logout, refresh, browser fechado, navegação via link e Back preservam o checkpoint no servidor; frontend falha fechado se recuperação não carregou.
- **T11:** estado incerto ultrapassa 7 dias: não há descarte/unlock automático, exibir revisão e preservar trilha.
- **T12:** 400/401/403/409/timeout/5xx/corpo ilegível em retry após indeterminado não convertem em RECHAZADA_DEFINITIVA nem liberam K2.
- **T13:** conclusão confirmada limpa bloqueio para nova operação e mantém rastreabilidade/número; rejeição definitiva comprovada libera edição sem apagar audit trail.
- **T14:** data local America/Asuncion e snapshot persistido: retry nunca altera data original; mudança de dia ainda valida novas intenções com hoje atual.
- **T15:** precarga URL, catálogos e rascunho não são sobrescritos por restauração ou GET tardio; preservar PRO-183/184/187.
- **T16:** permissões/depósitos revogados: nega repetição e leitura indevida, preserva K1 e não gera efeito de estoque.
- **T17:** DEMO_MODE/sessão ausente e falta de DB: nunca criar checkpoint falso nem apresentar sucesso.
- **T18:** casos de migração em banco simulado/funções via mocks locais conforme política; documentos preflight/rollback e grants auditáveis, sem executar no banco operacional.

Testes devem exercer **funções reais com adaptadores simulados/concorrência controlada**, além de verificações estruturais da página e SQL. Não alegar React real nem PostgreSQL/VM real. Tipos/lint pontuais e regressões diretamente pertinentes, nunca suíte global sem pedido.

## 6. Aceite e entrega

**CA-01:** toda operação de estoque iniciada pelo formulário tem checkpoint durável e idempotência K1 recuperável entre sessões/abas.  
**CA-02:** nenhum segundo movimento novo é habilitado com pendência indeterminada do mesmo operador, inclusive após refresh e em duas abas.  
**CA-03:** confirmação do original ou retry com mesmo K1; 0 duplicações nas corridas simuladas, com contrato PostgreSQL documentado.  
**CA-04:** isolamento usuário/empresa/permissões executado no backend, com testes negativos.  
**CA-05:** expiração não significa perda da proteção.  
**CA-06:** scripts SQL versionados mas NÃO executados; procedimento operacional claro.  
**CA-07:** regressões PRO-182/183/184/185/186/187 preservadas.  
**CA-08:** entrega em commit/push na branch oficial; atualizar PROGRESSO-NEXIT-V1.md e Linear sem Done; parar para nova auditoria independente **AUD-NEXIT-MOVIMIENTOS-DESKTOP-R08**. Não homologar nem avançar para outro menu ou STK-D03.

**Critério de falha obrigatória:** armazenamento apenas client-side, restauração que aceita K1 como identidade/autorização, expiração que desbloqueia K2 sem prova, GET que registra estoque, ou sequência em que o POST acontece antes de persistir o checkpoint.
