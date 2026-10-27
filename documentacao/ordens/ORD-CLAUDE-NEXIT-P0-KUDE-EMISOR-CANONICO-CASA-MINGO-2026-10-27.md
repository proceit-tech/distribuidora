# ORDEM FOCAL DE CORREÇÃO — P0 / KuDE FE de CASA MINGO: validação pelo RUC do emissor
**Data:** 27/10/2026. **Branch oficial:** `feature/NEXIT-2026-001-banco-demo`.
**Fonte obrigatória de análise:** `documentacao/analises/ANA-NEXIT-CASA-MINGO-KUDE-FE-EMISOR-RUC-2026-10-27.md`.
**Contexto:** `documentacao/definicoes/REQ-DOC-KUDE-PDF-GATEWAY-2026-10-20.md`, `documentacao/definicoes/INC-NEXIT-NCE-KUDE-GATEWAY-2026-10-21.md`, NEX-002 / NEX-019, PRO-194, `CLAUDE.md`.
**Objetivo único:** corrigir nossa validação de emissor ao buscar KuDE, preservando isolamento multiempresa e todas as proteções contra documento de terceiro. Não implementar ajustes no provedor KuDE.

## 0. Evidência e bug comprovado em leitura estática
A FE CASA MINGO `001-003-0009011` foi aberta com sucesso no portal do provedor (PDF da empresa RUC `80003314-0`), mas o NEXIT mostra o erro **emitido por `shared.ts`** «El KuDE recibido pertenece a un emisor distinto del de los documentos aprobados de esta empresa…». Ocorre quando `!doc.cdc` e o código compara CDC retornado com `SELECT DISTINCT substr(cdc,3,9) ... LIMIT 10` dos OUTROS documentos APROBADOS da empresa. Essa amostragem histórica não representa o emissor fiscal canônico; documentos antigos/de testes podem negar PDF correto, e documentos com CDC local sequer passam pela conferência contra RUC da empresa.

**Não assumir** sem a resposta real que o CDC retornado pertence à CASA MINGO. A comparação com o PDF do portal é evidência de apresentação, não prova criptográfica da identidade de cada resposta do gateway. O fix deve BLOQUEAR se o emissor realmente for diferente, por exemplo `80020653-3`.

## 1. Procedimento de Claude
1. Sincronizar HEAD, ler INTEIROS `CLAUDE.md`, análise, requisitos KuDE, `lib/facturacion/shared.ts`, `gateway.ts`, `gateway-credenciales.ts`, `kude.casos.ts`, `app/api/documentos/[id]/kude/route.ts`, NEX-002 e NEX-019; checar o esquema atual de `empresas.ruc` / `empresas.dv` e reutilização de helpers existentes para RUC/DV. Não inventar o estado do PostgreSQL real.
2. **Mudar somente a regra incorreta:** substituir o veto histórico `SELECT DISTINCT substr(cdc,3,9) ... LIMIT 10` pela validação do **CDC retornado ↔ RUC + DV do EMISSOR da empresa ativa do documento**. Ler campos do próprio registro `empresas WHERE id = empresaId`, no servidor, sem confiar em browser/param e sem misturar sessão de outro tenant. Verificar RUC de 3–8 dígitos e DV 1 dígito ou representações oficiais específicas do cadastro; compor os 8 dígitos fiscais e o DV e comparar com `cdc.slice(2,11)` de 9 posições, sem usar login `empresas.codigo`, dados de receptor, histórico APROBADO ou RUC da credencial API como substitutos de identidade fiscal.
3. **Aplicar proteção em todos os casos:** tanto `doc.cdc !== null` quanto `doc.cdc === null`. Manter `doc.cdc === retorno CDC` quando persistido; sem CDC persistido, exigir o CDC completo e coerente (tipo, estabelecimento, ponto e número, usando `cdcCoherente`) + emissor igual ao da empresa. PDF deve ser válido e não armazenado.
4. CDC cujo emissor DIFERE do RUC/DV da empresa -> HTTP 502 ou erro equivalente já adotado, com mensagem adequada em espanhol «El emisor del KuDE no corresponde a la empresa del documento», **sem retornar PDF nem divulgar o RUC completo, CDC, JWT, senha ou Base64**. Atenção ao caso histórico de emissor `80020653-3` vs CASA MINGO `80003314-0`: NÃO mostrar e não aceitar pelo fato de mesmo número/estabelecimento.
5. Se `empresas.ruc` e/ou `dv` forem nulos, malformados, conflitantes ou impossíveis de verificar, **não relaxar o controle e não permitir PDF de emissor desconhecido**. Responder com erro claro de configuração do RUC da empresa e manter bloqueio; não preencher dados automaticamente nem modificar cadastro. Não exigir emissão FE APROBADO nem CDC pré-existente, conforme decisão E08.
6. **Preservar integralmente** o contrato POST gateway FE com cinco campos (`tipoDoc:'FE'`) e NCE (`tipoDoc:'ncr'` e `tipOpe:'4'`), HTTPS/SSRF, login/token da empresa, timeout, 401-refresh único, PDF limitado/verificado, download novo e isolamento empresa/sucursal/permissão VER. **NÃO** tocar emissão FE/NCE, timbrado, payload fiscal, consultas de estado, CDC persistido, banco/migrations, documentos aprovados, estoque, preços, outras telas ou provedor externo.
7. Corrigir somente `shared.ts` e casos focalizados em `kude.casos.ts` e auxiliares usados diretamente se **absolutamente necessário**. O mock DB de testes atualmente intercepta `substr(cdc,3,9)`; adaptar os fixtures para devolver `empresas.ruc/dv`, sem conservar cenários que validem historicamente critério INC-06 antigo. **NÃO executar testes/lint/build** por restrição atual; revisão estática e cenários documentados.

## 2. Verificações por raciocínio de código a registrar (não afirmar testes executados)
- Empresa CASA MINGO RUC `80003314-0`; CDC retornado com emissor `800033140`, tipo FE, dEst=001, dPunExp=003, dNumDoc=0009011; documento sem CDC local; outros aprovados históricos RUC `80020653-3` → PDF ACEITO porque emissor canônico é CASA MINGO.
- Mesmo documento com retorno `800206533` → PDF BLOQUEADO; mesma numeração de documento não basta.
- Com `doc.cdc` persistido igual ao retornado MAS emissor não coincide com empresas.ruc/dv → BLOQUEADO; proibir aprovação automática pelo CDC local histórico.
- Dois documentos de mesmo número em empresas A/B → acesso ACL + emissor específico por empresa, sem fuga.
- Sem RUC/DV ou DV errado no cadastro → erro de configuração seguro, nunca aceitar documento no escuro.
- Sem documentos aprovados históricos e com RUC empresarial válido → permitir se CDC casa. Com histórico misto no mesmo tenant → permitir somente o emissor canônico.
- NCE com contrato `ncr` + `tipOpe` intacto; FE com cinco campos intacto. Sem regressão nos controles de PDF, reintentar/descargar e 401/404.

## 3. Entrega e STOP
- Apenas código focal e mocks/casos de teste existentes **sem execução**, revisão completa dos arquivos alterados, commit e push na branch oficial.
- Relatar SHA completo, paths, predicado anterior/novo, normalização fiscal dos campos RUC/DV, como a alteração bloqueia terceiro e permite legítimo, limitações se cadastro fiscal real não tiver dados e confirmação de nada executado.
- **Não acessar** VM/PostgreSQL, executar SQL/migrations, scripts, testes, lint, typecheck, build, CI, navegador, deploy, Postman externo, tokens ou PDF real; tudo depende de autorização do responsável.
- Claude **não altera Linear, CLAUDE.md ou PROGRESSO, documentos de análise/auditoria nem tarefas paralelas**. Não prosseguir E6-B, FE/estoque, MASTER, visual de KuDE do fornecedor.
- **PARAR PARA REAUDITORIA INDEPENDENTE DO CHATGPT**; não declarar problema resolvido no ambiente até abrir o KuDE da FE real, com CDC do emissor correto, após versão instalada e verificada por pessoa autorizada.
