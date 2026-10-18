# NEXIT V1 — Plano mestre de correções após auditorias por menu

**Data e corte:** 18/10/2026. **Repositório:** proceit-tech/distribuidora. **Branch exclusiva:** feature/NEXIT-2026-001-banco-demo. **Status atual (AUD-C01-R03): C01 APROVADA TECNICAMENTE EM REVISÃO ESTÁTICA; C02 AINDA NÃO AUTORIZADA.** Estado histórico: C01 foi a primeira tarefa liberada e já foi reauditorada. Cada tarefa posterior depende de nova reauditoria ChatGPT e autorização específica do responsável.
**Fonte de verdade:** documentacao/v1/auditoria-por-menu/README.md, controle de pendências na mesma pasta, os relatórios R01 dos 22 menus ativos e as fichas canônicas. O número 22 é quantidade de entradas de menu auditadas estaticamente (inclui índice de Reportes), NÃO homologações; Plataforma → Empresas não passou ainda por auditoria integral. A data de um R01 não prova deploy ou versão instalada.

## 0. Protocolo obrigatório e fronteiras

1. Claude lê integralmente CLAUDE.md e documentacao/PROTOCOLO-IA.md; lê seletivamente PROGRESSO-NEXIT-V1.md, este plano, o(s) relatório(s) de auditoria e código/SQL atuais APENAS da tarefa autorizada. Sincroniza a branch de forma segura e preserva arquivos locais. Não trabalhar com referência de conversa desatualizada.
2. **UMA tarefa Cnn por rodada**, no máximo seus IDs e regressões estritamente relacionadas, sem começar Cnn+1. Nada de refatoração geral, outros menus, redesenho não solicitado, compatibilidade móvel (produto desktop), regressão de correções históricas ou função V2.
3. Testes LOCAIS **mínimos e dirigidos ao defeito alterado**: casos positivo/negativo/limite pertinentes, permissões/empresa quando afetadas, simultaneidade simulada quando esse for o bug, cálculo fiscal/saldo/idempotência quando afetados. Preferir os casos unitários/sintéticos já versionados e adicionar somente os necessários. **NÃO rodar suite integral TS (milhares de casos), Next build geral, lint/tsc globais, PostgreSQL integral, CI manual, GitHub Actions rerun/workflow_dispatch ou outras telas**. Não monitorar GitHub Actions automático; informar não acompanhado se aplicável. Se for necessário teste com PostgreSQL real, documentar caso para o responsável, sem executá-lo por IA.
4. Se alteração estrutural for indispensável e autorizada na tarefa, Claude VERSIONA migration SQL **incremental** e scripts de preflight/aplicação/validação separados para o responsável; NÃO altera migration aplicada nem executa em banco, VM, Docker ou gateway. Usar schema_migrations e progresso; nunca presumir estado real a partir do Git. Não criar novas tabelas nem privilégios se correção pura for possível.
5. Código e UX em espanhol (PY), desktop. Preservar isolamento empresa/sucursal/depósito, ACL específica, segredo API, numeric textual e BigInt/NT13, CDC, estado SIFEN distinto da recepção gateway, histórico fiscal/estoque, idempotência e versão de registros. Não marcar HOMOLOGADO.
6. Concluir Cnn com atualização ECONÔMICA do PROGRESSO-NEXIT-V1.md e registro de casos/testes, commit+push da branch oficial e PARAR. Na saída final Claude informa apenas resultado, contagem de testes focais executados, bloqueio real e SHA completo (conforme CLAUDE.md). Não editar arquivos AUD do ChatGPT; o relatório AUD-R02 será publicado depois pelo ChatGPT.
7. ChatGPT reabre protocolos atuais, consulta SHA/diff e implementação, confronta a fonte auditada e a tarefa, emite R02 ou R03 PASSA/REPROVA/PENDENTE sem fingir browser/VM/PG, e só então prepara próxima autorização. Responsável verifica ambiente real/desdobramentos. Um R02 aprovado estaticamente nunca significa que banco/VM foi atualizado.

**Critério de passagem entre tarefas:** todas as alterações de Cnn estão rastreáveis no commit; testes focalizados efetivamente executados e numerados; nenhuma regressão direta conhecida; ChatGPT reaudita; o responsável decide o avanço. Em falha R02, nova rodada Cnn-R02 somente, SEM iniciar Cnn+1.

## 1. Fila executável em ordem de prioridade

Cada linha é um pacote local por funcionalidade; títulos de menu em espanhol seguem a UI. IDs correspondem aos documentos originais, e referências compartilhadas não devem ser corrigidas duplicadamente.

### Onda A — impedir emissão/edição com contexto divergente (prioridade máxima)

| Ordem | Tarefa | Local e achados | Objetivo de aceite essencial |
| --- | --- | --- | --- |
| **C01** | **Facturas — confirmar exatamente o revisado** | Facturación → Facturas; **FAT-D02 ALTA** | Capturar body e versão de prévia; impedir que modal A autorize POST B; invalidar resultado obsoleto, preservar numeração e idempotência; **PRIMEIRA E ÚNICA AUTORIZADA AGORA** |
| C02 | Facturas — resultado seguro de busca rápida | Facturas; FAT-D01 ALTA | A→B antes de 300ms, Enter/flechas/GET atrasado nunca elegem cliente/produto A |
| C03 | NCE — trocar cliente durante GET detalhe | Notas de crédito; NCE-D01 ALTA | Resposta/error de FE A não altera formulário ao mudar para B; preservar busca R02 |
| C04 | Movimientos — congelar intenção e chave de movimento | Inventario → Movimientos; MOV-D01 ALTA | Mesmo movimento/UUID enquanto POST pendente; não sobrescrever intenção nem duplicar por retry |
| C05 | Productos — concorrência de edição | Maestros → Productos; PRD-D03 ALTA | Versão/409 ou política equivalente sem lost update; nenhum dado da edição concorrente sobrescrito silenciosamente |
| C06 | Depósitos — formulário durante mutação | Inventario → Depósitos; DEP-D01 ALTA | Nem troca de depósito/aba/fecho nem campo editado durante POST/PATCH aplicam resposta ao registro errado |
| C07 | Catálogos de productos — mutação x troca de aba | Maestros → Catálogos de productos; CAT-D01 ALTA | Resultado de POST/PUT anterior não destrói aba/formulário atual |
| C08 | Catálogos comerciales — mutação x troca de aba | Maestros → Catálogos comerciales; CC-D02 ALTA | Resposta tardia não sobrescreve outro catálogo ou formulário novo |
| C09 | Documentos electrónicos — dados antigos acionáveis | Facturación → Documentos; DOC-D01 ALTA | Digitar filtro B invalida imediatamente ação/lista A, inclusive durante debounce e resposta atrasada |
| C10 | Reportes — contrato de filtros compartilhado | **5 reportes**, corrigir motor compartilhado uma única vez; RPT-D01 ALTA + RPT-D02 MEDIA | Normalizar termo digitado/aplicado/API/CSV/XLSX/PDF igualmente; durante digitação impedir ver/exportar A como B; 5 testes locais focados, um por reporte, sem suite geral |

**Prioridade:** não iniciar um bloco amplo de correções por menu enquanto uma divergência de confirmação/idempotência crítica estiver aberta. A ordem poderá ser revista por achado novo, nunca antecipada pelo Claude sem decisão.

### Onda B — permissões corretas, segurança e operações persistentes

| Ordem | Tarefa | Origem | Aceite e proteção |
| --- | --- | --- | --- |
| C11 | Clientes: CREAR-only e botões por permissão | CLI-D01 ALTA, CLI-D02 MEDIA | Listagem/edição exigem VER/EDITAR; alta e catálogos mínimos devem permitir CREAR sem expor lista alheia |
| C12 | Proveedores: CREAR-only e VER-only | PRV-D01 ALTA, PRV-D02 MEDIA | Alta e recuperação com permissão CREAR, ficha/lista VER; operador VER não recebe ação editável |
| C13 | Productos: CREATE-only e controles por papel | PRD-D01 ALTA, PRD-D05 MEDIA | Alta e catálogos mínimos com CREAR, edição só EDITAR; evitar vazamento de catálogo/ficha sem VER |
| C14 | Listas de precios: alta e ações | LPR-D01 ALTA, LPR-D02 MEDIA | CREAR-only pode cadastrar; GET mínimo; VER-only não edita |
| C15 | Catálogos comerciales: CREAR-only | CC-D01 ALTA | Alta de cotização/canal/zona legítima sem VER amplo; proteger API/lista |
| **C16** | **Depósitos: política de permissão — GATE** | DEP-D02 ALTA, DEP-D04 MEDIA | **Antes de implementar**, responsável confirma se VER é pré-requisito formal de CREAR/EDITAR ou se alta/edição isoladas são permitidas. Aplicar política consistente menu/layout/API/SQL |
| C17 | Dashboard e Sidebar: destinos autorizados | F-DASH-04/F-DASH-05, NGM-R01-02, NGM-R02-01 | Links Dashboard, Stock e Movimientos só com permissão real; plataforma aponta direto a Empresas; sem impor suporte móvel |
| C18 | Productos: completar alta/anexos e recuperação | PRD-D02 ALTA, PRD-D04 MEDIA | Após POST criado, falha de imagem/anexo não cria produto em duplicata; retomada por ID com CREAR-only e falha HTTP |
| C19 | Listas de precios: erro de catálogo financeiro | LPR-D04 MEDIA | Não assumir PYG provisória nem liberar salvar se faltou catálogo obrigatório |
| C20 | Gateway — limitador de tentativa de login | CFG-D01 MEDIA | Concorrência first-row 5/5min/intervalo 3s atomicamente; migration incremental versionada se necessária, jamais aplicar por IA |
| C21 | Puntos — semântica ativar/desativar NCE/FE | PUN-D01 ALTA | Checkbox e resultado dizem verdade: false não aparenta desativar quando SQL só mantém; preservar ação por tipo |
| C22 | Productos — bloqueio de rascunho ao trocar aba | PRD-D06 MEDIA | Documento não salvo conserva dados/avisa perda ao trocar aba |
| C23 | Depósitos — atualizar ficha e auditoria | DEP-D05/D06/D07 MEDIAS | Evitar versão de acesso obsoleta, editar com versão/409, indicar paginação/truncamento de histórico; podem ser subtarefas C23a/b/c se código divergir |

### Onda C — estoque, documentos fiscais e números: decisões e consistência

| Ordem | Tarefa | Origem | Aceite e dependência |
| --- | --- | --- | --- |
| **C24** | **Visibilidade de produtos e «Sin stock» — GATE** | STK-D01 ALTA, F-DASH-01 ALTA, reflexo Stock general | Responsável confirma se usuário limitado a depósito pode ver produto da empresa sem saldo em depósitos autorizados; depois corrigir classificação e Dashboard sem revelar saldo de outro depósito, sem inventar política |
| C25 | NCE — prévia tardia | NCE-D02 MEDIA | Resposta antiga não abre modal após mudar valores/FE; conservar bloqueio atual de body revisado exato |
| C26 | FE — recuperar operação original | FAT-D03 MEDIA | POST com mesma chave e resposta perdida recupera documento persistido mesmo que cadastro mudou, sem double-send e conflito para outro conteúdo |
| C27 | NCE — recuperar operação original | NCE-D03 MEDIA | Buscar operação idempotente autorizada antes do preflight que exige credenciais apenas para novo envio, sem reenviar indeterminado |
| C28 | NCE — localizar documento emitido | NCE-D04 MEDIA | Referência por documentoId autorizado ou identidade fiscal completa, não somente 0000001 |
| C29 | Puntos — estado operacional de série esgotada | PUN-D02 MEDIA; mesma observação NCE-O04 | ZZ-9999999 aparece «Agotada», não «disponible», sem reset nem número inventado |
| C30 | Documentos — precisão monetária | DOC-D04 MEDIA | Eliminar Number para numeric de documentos; PYG e USD longos sem arredondamento silencioso |
| C31 | Stock general — agrupar por identidade de unidade | SG-D03 ALTA NUEVA | Não somar UUIDs de unidades diferentes que compartilham rótulo |
| C32 | **Presentaciones comerciales fiscais — GATE técnica/contratual** | FAT-G01/FAT-X03, DEC-PRD-U03/U09 (ALTA preexistente) | Implementar por entregas sucessivas somente após desenho de fator/preço/versionamento: (a) snapshot da apresentação no produto; (b) seleção e conversão fiscal exata na FE; (c) compatibilidade histórica NCE/devolução. Preservar 1 Bandeja×6 UNI → 6 UNI fiscais com total/IVA idêntico e representação oficial SIFEN. Não implementar baixa de Stock por emitir |
| C33 | Banco/consistência de leitura — riscos condicionais | FAT-D04, STK-D03, DOC-D05, REP-D04 (MÉDIAS, não reproduzidos) | Primeiro especificar e testar concorrência focal por módulo; só implementar transação/snapshot quando confirmada necessidade e preservadas APIs/locks; **uma funcionalidade por rodada** |
| C34 | Atualização de status de NCE/FE na VM — **VERIFICAÇÃO HUMANA** | NEX-065; NEX-062/NEX-063 | O responsável confirma schema_migrations, funções/grants e resultado de NEX-065 corrigida após falha inicial. **Não é tarefa de Claude para rodar SQL/VM**, não bloquear correções puras de front até ser necessária homologação |
| C35 | **Eventos e movimentação física FE → Stock — GATE negocial** | FAT-G02/contrato de integração Movimientos/Documentos | Definir evento físico que baixa, depósito/lote, remissão/entrega, cancelamento/estorno, barreira de idempotência; só então projeto próprio. NÃO executar baixa ao confirmar FE automaticamente por suposição |

### Onda D — completar problemas médios/baixos específicos de cada menu

O objetivo é eliminar **todos os IDs residuais** sem abrir funcionalidades não aprovadas. Pacotes podem ser divididos se envolverem partes independentes, mas nunca misturar dois menus na execução do Claude sem liberação posterior.

| Ordem | Tarefa / menu | IDs remanescentes e aceite |
| --- | --- | --- |
| C36 | Dashboard | F-DASH-02 KPIs antigos após erro de filtro, F-DASH-03 anulações/contrapartidas sem estado; F-DASH-04/05 já em C17 |
| C37 | Clientes | CLI-D03 geografia: resposta atrasada de departamento/distrito não atualiza lista do contexto atual |
| C38 | Proveedores | PRV-D03 distinguir catálogo geográfico vazio de erro HTTP |
| C39 | Catálogos de productos | CAT-D02 manter erro de ativação/inativação após recarga |
| C40 | Listas de precios | LPR-D03 distinguir vigência de situação administrativa e contagem |
| C41 | Catálogos comerciales | CC-D03 exigir moedas no contrato de Tipos de cambio, sem impor aos outros catálogos |
| C42 | Stock | STK-D02 remover estado global de moeda-base em cargas/usuários diferentes; STK-D03 tratado em C33 |
| C43 | Movimientos | MOV-D02 filtro/página antiga durante GET; MOV-D03 proteger edição durante virada de dia Paraguay |
| C44 | Depósitos | DEP-D03 guardar aviso de mudança «Asignarme», DEP-D08 colspan VER-only; D04 em C16, D05/D06/D07 em C23 |
| **C45** | Reposición — regra de simulação GATE | REP-D01 quantidades mostradas não batem com simulação; REP-D03 retry usa foto anterior. **REP-D02** origem compartilhada exige decidir se simulação é individual ou replanejamento global ANTES de alterar distribuição; REP-D04 vai a C33 |
| C46 | Documentos electrónicos | DOC-D02 estados pendentes vs erro/indeterminado; DOC-D03 escopo KPIs filtrados/globais; DOC-D06 datas inválidas; DOC-D07 «Sin e-mail» duplica não informado; DOC-D08 detalhe anterior após filtros. DOC-D04 em C30; DOC-D05 em C33 |
| C47 | Configuração gateway | CFG-D02 combinação RUC novo+senha guardada na prova, CFG-D03 edição em PUT/POST, CFG-D04 refresh antigo após erro. CFG-D01 em C20 |
| C48 | Facturas | FAT-D05 data Paraguay na sessão longa. FAT-D01/D02/D03/D04 em ondas anteriores |
| C49 | Puntos | PUN-D03 GET falho deixa tabela antiga operável. PUN-D01/D02 em C21/C29 |
| C50 | Reportes — índice | RPT-D03 descrição «En punto de reposición» ausente. Não criar sexto relatório |
| C51 | Valorización de inventario | VZ-D03 «Costo registrado» x quantidade valorizada, VZ-D04 KPI ALCANCE não é todo depósito autorizado |
| C52 | Kardex de movimientos | KDX-D03 distinguir proprietários terceiros com igual rótulo, KDX-D04 lista usuários de movimentos sem alcance, KDX-D05 mensagem de conciliação mais precisa |
| C53 | Stock crítico y reposición | SC-D03 avisos «sin meta» perdidos na exportação, SC-D04 valor referência zero sem dado valorizável, SC-D05 delimitar «Disponible» na vista PRODUCTO |
| C54 | Lotes y vencimientos | LOT-D03 contador «0 lotes» antes de sucesso e após erro |
| C55 | Transversal UX desktop e alertas nativos | NGM-R01-04: substituir confirmações críticas nativas somente nos fluxos atuais onde necessário, em **subtarefas por menu**; não fazer redesign global, não exigir móvel, não reabrir correções UX passadas sem evidência |

**Reportes compartilhados:** SG-D01/02, VZ-D01/02, KDX-D01/02, SC-D01/02 e LOT-D01/02 são **espelhos de RPT-D01/02**, tratados uma única vez em C10, com teste dirigido por reporte. PUN-D02 citado na NCE é o MESMO achado, não criar outro. Navegação Dashboard F-DASH-04/05 e NGM-R01-02/R02-01 em C17 não deve gerar dois PRs independentes. STK-D01 e F-DASH-01 exigem uma política única e testes por papel, mas correções podem sair em commits isolados. NCE D01 não é FAT D01: ambos lidam com buscas distintas.

## 2. Funcionalidades novas identificadas nas capturas da concorrência — outro conjunto de entregas

O responsável pediu em Documentos electrónicos “tudo isso e mais um pouco”, mas as capturas são referências de **requisitos a implementar**, não defeitos de código nem autorização para inventar funções externas. O relatório [AUD-NEXIT-DOCUMENTOS-ELECTRONICOS-DESKTOP-R01](../../testes/AUD-NEXIT-DOCUMENTOS-ELECTRONICOS-DESKTOP-R01-2026-10-18.md) mapeia C01…C28, E01…E15 e GAP-01…07. **Desenhar separadamente por fatia e somente implementar o que tiver base/campos/contrato confirmado**:

| Ordem futura | Subprojeto | Entregáveis e bloqueios |
| --- | --- | --- |
| X01 | Central fiscal desktop mais clara | painel estados Fiscal SIFEN / gateway / e-mail separados, incidentes «Requieren atención», SLA, métricas com escopo declarado. Fonte de estado real obrigatória |
| X02 | Pesquisa e tabela avançada | filtros por lote, assinatura, data, sucursal/ponto, múltiplos tipos/estados, ocultações, colunas operacionais, tabela e detalhe por doc, histórico e requestId |
| X03 | Exportações e ações em lote | CSV/XLSX de TODOS os filtrados autorizados com precisão, seleção por linha, revalidação status/permissão/empresa sob lock, resultados parciais auditados; sem disparar evento fiscal não autorizado |
| **X04 — GATE fornecedor** | XML e KuDE/PDF | primeiro confirmar endpoint real, auth, MIME, hash, CDC, tipo XML, limites e evidência. **Sem simular botões funcionais nem URLs** |
| **X05 — GATE fornecedor/legal** | Eventos SIFEN, cancelación, inutilización | contrato/legalidade, atores, elegibilidade, idempotência e histórico reais antes de criar ações |
| **X06 — GATE fornecedor** | E-mail, reenvio e blacklist | confirmar fonte de entrega, status real, destinatário/plantilla/anexo, segurança e retry idempotente; não inventar SMTP/retorno |
| **X07 — GATE fornecedor** | NRE/NDE/AFE | não ativar envio/consulta por mero cadastro dos tipos sem endpoints/CDC/testes do provedor |
| **X08 — GATE regra fiscal/stock** | ligação entre FE/NCE e movimentos | implementar só após C32/C35 e evento físico aprovado, sem baixar duas vezes |

**Observação sobre plataforma e menus ocultos:** Plataforma → Empresas ainda exige auditoria estática própria antes de criar tickets de correção. Vendedores/Zonas y rutas, Compras, Ventas, Finanzas, Notas de remisión, Monitor SIFEN e menus de Administração declarados/ocultos NÃO são V1 ativa. Não abrir módulos automaticamente a partir desta lista. Se o responsável decidir expandir V1, auditar/definir individualmente e inserir novas tarefas após o planejamento vigente.

## 3. Decisões prévias e blockers de natureza diferente

- **Sem código até decisão de negócio:** C16 política DEPÓSITOS CREAR/EDITAR vs VER; C24 visibilidade de «Sin stock» para usuário limitado ao depósito; C45 REP-D02 simulação local vs redistribuição global de origem; C32 esquema/versionamento de apresentações fiscais; C35 evento físico de baixa/estorno. Claude deve **parar somente nessas tarefas** se a regra ainda não existir no Git, reportar questão específica, nunca adivinhar.
- **Sem acesso de IA ao ambiente real:** confirmar NEX-062/NEX-065 e migrations instaladas, grants/runtime, snapshots/CDC/serialização e gateway via responsável; scripts prontos e backup sob controle humano. Arquivo versionado não prova banco instalado.
- **Dependências externas do gateway:** XML/KuDE, e-mail/blacklist, eventos, NRE/NDE/AFE, contrato de série/CDC. Não declarar falha de recurso que não foi homologado, nem ligar função fictícia.

## 4. Modelo de reauditoria por ChatGPT após cada commit

1. Receber SHA completo de Cnn e ramo oficial. Ler CLAUDE.md, PROTOCOLO-IA.md, progresso relevante e relatório R01 vigente; comparar diff e código real após push.
2. Confirmar que **só Cnn** foi alterada; arquivos/autorizações/empresa/locale/SQL e cálculo fiscal não foram ampliados indevidamente.
3. Conferir teste dirigido (nome e quantidade efetivamente executada; sem chamar suíte grande), positivos, negativos, corrida/permiso quando pertinente. Dizer explicitamente o que não foi executado.
4. Publicar AUD-Cnn-R02 no Git e atualizar progresso/ficha canônica sem alterar histórico R01. Classificar PASSOU ESTATICAMENTE / CORREÇÃO R02 / BLOQUEADO POR DECISÃO OU AMBIENTE. Não homologar sem verificação humana.
5. Encaminhar **uma** tarefa seguinte após aceite do responsável, priorizando erro residual da mesma Cnn em vez de saltar fases.

## 5. C01 autorizada para Claude Code neste momento

**Escopo exato:** reparar FAT-D02 da auditoria de Facturas. Evitar que uma previa do body A seja mostrada como autorização para enviar body B. Ler relatório AUD-NEXIT-FACTURAS-DESKTOP-R01-2026-10-18.md e fonte atual /facturas/nueva, API previa e emitir. Capturar body imutável da revisão e proteger edits/versionamento/respostas tardias; no POST Emitir só enviar o body revisado e confirmar igualdade vigente, ou invalidar a revisão e exigir novo resumo. Manter validação fiscal no servidor, idempotência e número apenas após Emitir.

**Mínimo de casos para C01 (não uma bateria geral):** (1) revisar A e emitir A; (2) modificar cliente, linha ou valor enquanto PREVIA A aguarda — A não pode autorizar B; (3) mudança após resumo exige nova revisão; (4) resposta de PREVIA anterior chegando fora de ordem não substitui a atual; (5) Cancelar não cria/numera documento; (6) duplo clique ou envio em curso não duplica tentativa. Usar testes puros/controlados locais apropriados para a implementação. Sem browser real/PG/VM, sem inventar teste de gateway. Não tocar FAT-D01 nem alterações relacionadas a NCE ou fiscal sem evidência obrigatória para FAT-D02.

**Status atual:** C01 AUTORIZADA pelo responsável para ser enviada a Claude; C02…C55 e X01…X08 são PLANO, NÃO EXECUÇÃO AUTOMÁTICA. Reauditoria de C01 obrigatória antes de qualquer próxima tarefa.

## 6. Estado C01 tras reauditoría R02 (18/10/2026)

Implementación de Claude commit `aeaec74baa70d789ab966e51d643f4d64a3da1b5` auditada por ChatGPT: [AUD-C01-FAT-D02-R02](../testes/AUD-NEXIT-C01-FAT-D02-R02-2026-10-18.md). **El núcleo FAT-D02 ALTA (body enviado === body revisado) pasó confrontación estática; no se cierra C01 por hallazgo MEDIA C01-R02-01:** una PREVIA invalidada/cancelada sin iniciar otra mantiene versión y su error HTTP tardío aún se publica al usuario. **Autorización de continuación estrictamente C01-R02-01**, tests mínimos y reauditoría R03. Todo C02…C55/X01…X08 continúa pendiente de autorización específica; el equipo no debe saltar a C02. **NO HOMOLOGADO**, sin pruebas operacionales/VM/banco por IAs.

## 7. Estado C01 após AUD-C01-R03 (18/10/2026)

**Esta seção substitui como estado vigente o «C01 em correção» das seções históricas 5 e 6; elas permanecem como cronologia imutável.** A implementação Claude `ab4cb5d8e30664be07acc519702cdbc6a8ce7f86` passou reauditoria do ChatGPT: [AUD-NEXIT-C01-FAT-D02-R03](../testes/AUD-NEXIT-C01-FAT-D02-R03-2026-10-18.md). **C01 FAT-D02 e seu residual C01-R02-01 resolvidos tecnicamente em leitura estática**, sem achados médios/altos bloqueantes na tarefa. 42 asserts focais e ESLint reportados por Claude sem falhas, não reexecutados por ChatGPT.

**Próxima da fila C02 = FAT-D01, busca rápida de clientes/produtos, ainda NÃO AUTORIZADA**. Claude permanece parado até autorização do responsável; enviar uma tarefa por vez, teste mínimo e reauditoria após commit. C01 não está homologada nem aplicada no único ambiente real, o que exige verificação humana futura. Os outros achados do menu Facturas permanecem abertos.

## 8. Autorização C02 — FAT-D01: busca rápida de clientes e produtos (18/10/2026)

**Decisão vigente do responsável:** após aprovação técnica estática C01-R03, foi autorizado prosseguir para a próxima tarefa **exclusivamente C02 / FAT-D01**. A autorização substitui a condição histórica «C02 aguardando autorização» nas seções anteriores; estas permanecem como cronologia. **C03…C55 e X01…X08 NÃO autorizadas automaticamente.**

**Escopo fechado C02:** na rota `/facturas/nueva`, corrigir `useFiltro`, `useListado` e `BuscadorRapido` ou helpers puros mínimos para garantir que nenhum cliente ou produto seja selecionado do filtro anterior por ArrowUp/ArrowDown/Enter, clique, resultados/erros tardios de GET, nem pelo atalho de busca direta Enter quando o texto muda no meio do HTTP. A invalidação da seleção/lista deve ocorrer **assim que o operador muda o texto**; manter debounce de 300ms para TRANSPORTE e o Enter direto para leitor de GTIN/código. `useListado` devolve `datos.items` embora `datos.clave` não coincida com `clave`, por isso deve proteger dados e ações de recorte antigo. A busca direta Enter deve ter token/geração/termo vigente e descartar resposta/error antigos após mudança, limpeza, fechamento do menu ou nova busca. Preservar nomes, permissão `apto/habilitado`, condições de escolha exata vs resultado único e impedimentos de produtos fiscais; nunca selecionar automaticamente o primeiro de múltiplos.

**Aceitação mínima C02:** (1) A→B antes de 300ms nunca seleciona A por teclado/click; (2) A→B já em GET ignora sucesso/erro antigo; (3) busca Enter de A pendente e texto B mostra somente resposta vigente, inclusive erro e indicador `Buscando…`; (4) leitor GTIN/código exato com resposta vigente escolhe o produto correto; (5) cliente não apto e produto fiscalmente não habilitado continuam bloqueados; (6) múltiplas correspondências não escolhem silenciosamente a primeira; (7) seletor avançado/paginação mantém contrato e evita resultados de filtro antigo; (8) seleção de produto com `mantenerAbierto` limpa termo/estado para próxima leitura; (9) C01 corpo PREVIA/EMITIR continua intacto. **Testes básicos direcionados**, simulando promessas HTTP atrasadas se possível com helpers de controle; não executar suites gerais/CI manual/build/lint/tsc global/PostgreSQL/browser/VM/gateway.

**Responsabilidades:** Claude implementa SOMENTE C02 na branch oficial, atualiza progresso pertinente, executa testes mínimos da busca e ESLint dos arquivos tocados se viável, faz commit/push e PARA para `AUD-NEXIT-C02-FAT-D01-R02` do ChatGPT. Não editar auditorias antigas, nem código de servidor/SQL/migrations salvo necessidade indispensável demonstrada e prévia autorização. Produto DESKTOP, idioma UI espanhol-PY. **C01 aprovada TECNICAMENTE, não homologada**.

## 9. Estado C02 após AUD-C02-R02 (18/10/2026)

Implementação SHA `c1d1ee47ee341223ef0a3742444ae4d80e19ae21` reauditorada: [AUD-NEXIT-C02-FAT-D01-R02](../testes/AUD-NEXIT-C02-FAT-D01-R02-2026-10-18.md). **Núcleo de FAT-D01 ALTA corrigido em auditoria estática, mas C02 permanece em CORREÇÃO SOLICITADA** por **C02-R02-01 MEDIA**: Escape ou blur fecha a lista React sem invalidar consulta direta Enter em andamento; retorno posterior ainda chama alElegir se texto/versão de busca não mudaram.

**Única continuação autorizada por esta reauditoria:** correção estritamente local C02-R02-01, testes básicos do próprio buscador (4–5 novos cenários de fechar/reabrir durante HTTP), commit/push e parar para AUD-C02-R03. Sem suites globais/722 verificações repetidas, sem SQL/API/VM, preservando leitor GTIN, permissões de cliente/produto e C01. **C03 e demais tarefas continuam não autorizadas**; aprovação estática e posterior homologação humana são coisas distintas.
