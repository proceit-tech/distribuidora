# Auditoria por menu — Movimientos

**Rota principal:** `/movimientos`  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Estado:** ABERTA — NÃO AUDITADA INTEGRALMENTE — NÃO HOMOLOGADA  
**Responsável pela auditoria estática:** ChatGPT. **Implementação:** Claude Code somente mediante tarefa autorizada. **Homologação operacional/visual:** responsável na VM.

## Escopo e rastreabilidade

Este arquivo é a fonte única da auditoria do menu **Movimientos**. Registrar, com caminho e linha, cada página/subtela, componente, API, serviço, permissão de menu/servidor, tabela, trigger, migration, testes e dependências com outros módulos. Não confundir inventário com execução ou homologação. Ver `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e `documentacao/v1/AUDITORIA-GERAL-NEXIT-V1-2026-10-12.md`.

## Itens obrigatórios da auditoria completa

- [ ] Todas as rotas e subtelas: navegação, abas, ações, modais, estados de erro e vazio.
- [ ] Campos: origem, exigência, máscara, validação client/server, persistência e retorno.
- [ ] APIs: métodos, status HTTP, consultas, filtros, paginação, transação, concorrência e tratamento de exceções.
- [ ] Autenticação, permissões de ação, isolamento multiempresa e alcance de sucursal.
- [ ] SQL: relações, constraints, índices, FK, trigger, integridade e scripts vinculados.
- [ ] Integrações e dependências entre menus; compatibilidade de dados.
- [ ] Casos de teste: positivos, negativos, limites e regressões; evidências de execução.
- [ ] UX: responsividade 1440/768/375, foco, acessibilidade, textos, confirmação de ações, screenshots reais.
- [ ] Conclusão com todos os achados numerados, severidade, evidência e critério de aceite.

## Achados confirmados até agora (parciais)

Nenhum defeito deste menu documentado ainda nesta ficha. Isso NÃO significa ausência de defeitos.

## Pendências

Auditoria exaustiva deste menu ainda não executada. Não atribuir percentual de cobertura sem inventário de arquivos e linhas revisadas.

## Regra de migrations

O responsável mostrou NEX-001…051 já aplicadas na VM. Proibido editar scripts aplicados, checksums ou reexecutar SQL histórico como se fosse nova migration. Qualquer nova alteração estrutural exige justificativa, aprovação e migration incremental a partir de NEX-052.

## Auditoria transversal do Inventario (13/10/2026)

**Revisão estática conjunta de Stock, Movimientos, Depósitos e Reposición.** Fonte canônica transversal: [AUD-INVENTARIO-INTEGRADA-V1-2026-10-13.md](./AUD-INVENTARIO-INTEGRADA-V1-2026-10-13.md). SHA-base: `02d730e6e13ed2b0183563835e27757c18b50259`. **Não homologado; nenhuma implementação, PostgreSQL, VM, Docker ou navegador executados nesta revisão.**

**Movimientos** permanece proprietário único das gravações, histórico e anulação; agrupamento visual dos tipos é proposta. Regras de autorização nos atalhos e integração documental futura em INV-02/07.

**Estado:** propostas de simplificação pendentes de decisão do responsável; achados técnicos numerados e critérios de aceite no contrato compartilhado. Não interpretar este registro como autorização automática para o Claude alterar o menu.


## Auditoria atual — Movimientos DESKTOP (18/10/2026)

**Corte oficial de código:** `eaa10106dfb273ddd57079ddab5c978dc6d28009`. **Relatório de auditoria por menu:** [AUD-NEXIT-MOVIMIENTOS-DESKTOP-R01](../../testes/AUD-NEXIT-MOVIMIENTOS-DESKTOP-R01-2026-10-18.md). ERP **somente desktop**, sem escopo mobile. Relatório de **inspeção estática**: não houve execução de testes, APIs reais, CI, navegador, SQL, PostgreSQL ou VM. **NÃO HOMOLOGADO**. Histórico INV-R02…R05 permanece com correções presentes no código, não reabrir sem regressão.

| ID | Prioridade | Evidência do código neste corte | Situação |
|---|---|---|---|
| **MOV-D01** | **ALTA** | `nuevo/page.tsx:94–111,119–150,225–468`: `saving` bloqueia só botão Registrar, não bloqueia campos e Cancelar; editar limpa `clave.current` enquanto POST K1 está em voo. COMMIT com resposta perdida seguido de nova tentativa K2 permite segundo movimento real apesar do índice UNIQUE por chave (`NEX-014:333–345`). Testar sequência com promessa controlada, manter chave e payload após resposta indeterminada. | **ABERTO** |
| **MOV-D02** | **MÉDIA** | `movimientos/page.tsx:80–115,135–143,280–355`: indicador `cargando` usa diferença entre `resultado.clave` e `claveConsulta`, mas `datos` continua resultado anterior; filtros/página novos mostram linhas e links de consulta antiga enquanto carregam. | **ABERTO** |
| **MOV-D03** | **MÉDIA** | `nuevo/page.tsx:35–76`: `hoyAsuncion()` muda ao virar a data local e está na dependência do efeito que recarrega catálogos e sobrescreve `setForm`, `setBase` e quantidade mesmo com rascunho sujo. | **ABERTO** |

**Preservar decisões e regras do sistema:** registro só por `inventario_registrar_movimiento` em transação; 9 tipos técnicos e 4 grupos visuais, motivo e custo contextual, estoque PROPIO/TERCERO e lotes; anulação só com `MOVIMIENTOS.ANULAR` e movimento inverso único, SQL NEX-014 e, se aplicada, NEX-052; autorização de depósitos para registrar, história invisível fora de escopo e transferência visível só se ambos depósitos no alcance; `MOVIMIENTOS.VER + CREAR` para entrar na tela novo por layouts é **decisão histórica explícita**, não bug deste menu; toast de registro só após confirmação real. Referência de documento é texto livre: integração física FE/NC/entrega continua fora de escopo.

**Observações não bloqueantes:** GET de catálogos entrega metadata de depósitos não autorizados com `permitido=false` por contrato/teste anterior (requer decisão de privacidade antes de classificar); histórico com 3 SELECTs sem snapshot único (risco transitorio); `Number`/float8 para quantidades/custos limites merece teste focal; modal nativo já confirma anulação; motivo da anulação continua editável durante POST, mas SQL evita duas inversões; estoque de catálogo é orientativo, função valida saldo vigente; V1 transferencia é imediata. Nenhum bug adicional confirmado nestas observações.

**Estado:** Auditoria do **Menu 9 Movimientos** documentada com **1 ALTA + 2 MÉDIAS ABERTAS**, **NÃO HOMOLOGADA**. Não alterar código nem mandar comando ao Claude sem autorização; somente testes básicos localizados em intervenção futura, nunca suite/build/tsc/lint global/VM/PG por iniciativa IA. **Próximo menu: Inventario → Depósitos** quando solicitado.
