# ORDEM AUTORIZADA AO CLAUDE — PRO-322-R05 — FE fiscal sem misturar controles internos

**Data:** 25/10/2026. **Repositório:** `proceit-tech/distribuidora`. **Branch:** `feature/NEXIT-2026-001-banco-demo`. **Último commit funcional revisado:** `831773fb0dbb8e585f75c113295c23d6958921f8`. A branch contém depois desse SHA commits DOCUMENTAIS do ChatGPT; sincronizar sem descartar nada.

## 0. Ordem de negócio — PREVALECE

**NEXIT é ERP/sistema de gestão comercial, logística, estoque, movimentações e financeiro. SIFEN é um PADRÃO de DOCUMENTO FISCAL usado por uma integração; NÃO é a finalidade nem a fonte de verdade das operações internas.** Domínios e IDs internos não derivam de `dInfAdic` ou do JSON SIFEN.

Ler ANTES de editar:
- `CLAUDE.md` e `documentacao/PROTOCOLO-IA.md`;
- `documentacao/definicoes/DEC-NEXIT-SEPARACAO-DOMINIOS-NEGOCIO-SIFEN-2026-10-25.md` (decisão canônica);
- `documentacao/definicoes/REQ-NEXIT-FE-DIRECCION-RECEPTOR-INFO-ADICIONAL-2026-10-25.md` (REQUISITO atualizado, não usar trechos históricos superados);
- `documentacao/testes/AUD-NEXIT-FE-DIR-PRO-322-R04-2026-10-25.md`, somente como evidência de riscos no código da R04;
- `PROGRESSO-NEXIT-V1.md` apenas trechos relevantes.

## 1. ÚNICO ESCOPO ATIVO: PRO-322 / DIRECCIÓN FISCAL DEL RECEPTOR

Revisar os arquivos completos reais `lib/facturacion/payload-fe.ts`, `lib/facturacion/emision.ts`, `lib/fiscal/campos-receptor.ts` e o caminho da FE desde `receptorDe` até `construirPayloadFE`, distinguindo **nova emissão fiscal** de histórico.

**Contrato funcional para operações nacionais B2B/B2C/B2G:**
- `cPaisRec` sempre `PRY` (código do país).
- Se endereço fiscal legalmente opcional estiver AUSENTE, todos os dados do domicílio devem estar realmente vazios: `dDirRec` e `dNumCasRec` nulos conforme contrato atual; NENHUM dos códigos `cDepRec/cDisRec/cCiuRec`; nunca descartar silenciosamente bloco parcial.
- Se algum dado do endereço fiscal PRY foi informado: exigir **todos** rua `dDirRec`, número de casa `dNumCasRec` com 1–6 dígitos reais, `cDepRec`, `cDisRec` e `cCiuRec`. **DISTRITO OBRIGATÓRIO na política NEXIT**. Validar pertença e hierarquia no catálogo. Erro 422 claro antes de reservar número em dados parciais/incompatíveis; jamais inventar `0`, códigos ou descrições.
- `dDirRec` é ENDEREÇO FISCAL de Clientes. `direccionEntregaId` é destino LOGÍSTICO separado; não copiar entrega para endereço receptor.
- **B2F:** preservar política aplicável a cliente estrangeiro, sem exigir/serializar geografia paraguaia e com direção obrigatória quando cabível.
- Enviar `cDepRec`, `cDisRec`, `cCiuRec` SOMENTE COMO CÓDIGOS no JSON que NEXIT entrega à API. NÃO enviar `dDesPaisRe/dDesDepRec/dDesDisRec/dDesCiuRec`; descrição deve ser resolvida pelo fornecedor de acordo com seu contrato. **A interpretação do fornecedor AINDA NÃO foi homologada.**
- Não alterar a função de geografia compartilhada com Clientes/Proveedores sem defeito específico comprovado. Sem refazer o que R04 já implementou corretamente.

**Obrigação da etapa R05:** confirmar no código inteiro se cada ponto acima já está aplicado. Se SIM: **NÃO inventar novo patch, não criar commit funcional, não repetir correções feitas.** Entregar matriz de rastreabilidade `campo SIFEN → origem interna de Cliente → validação → regra JSON` e sinalizar **implementado estaticamente, NÃO homologado externamente**. Se encontrar UM erro novo e comprovável dentro desse mapeamento fiscal, corrigir SOMENTE esse erro no(s) arquivo(s) necessários, fazer commit/push e informar SHA; se depender de contrato externo não provado, documentar o bloqueio, NÃO inventar comportamento.

## 2. Separação explícita das outras áreas (NÃO IMPLEMENTAR nesta ordem)

- **PRO-205 / PRO-324:** integridade da `direccionEntregaId` e snapshot logístico histórico em `documento_electronico_entregas`; a NEX-068 mantém identidade por ID, não por `dInfAdic`. O defeito R04 é REAL: `equivalente` atual pode aceitar **ID diferente com o mesmo texto**. Registrar como risco ABERTO de reintento e impedimento para liberar produção insegura; **não corrigir por parsing do texto, não criar SQL, GRANT ou migration, não declarar resolvido**. É outra frente; PRO-324 foi movida para PRO-205. Não iniciar trabalho dessa frente automaticamente.
- **PRO-323:** editor assistido de `dInfAdic` e seleção de vendedor/destino comercial. NÃO IMPLEMENTAR. `dInfAdic` é informativo, não fonte de verdade para entregas/estoque.
- **Estoque/Kardex/Financeiro:** não modificar movimentos, saldos, reservas, entregas ou lógica NEX-067/068 como consequência de campos fiscais SIFEN.
- **R04 histórico/idempotência:** não alterar `equivalente`, snapshots, `payloadHistorico`, ACL, `crearFacturaElectronica`, ou políticas de histórico para conseguir 'passar' a correção fiscal. Se identificar defeito de segurança adicional, relatar com arquivo/cenário, sem aumentar escopo.
- **PRO-298** KuDE/PDF, NCE, E03-A2/B, E08/E09, `NEX-072`, deploy e outras tarefas: fora do escopo.

## 3. Revisão estática por cenários (SEM criar/rodar testes)

1. FE PRY com rua, número `125`, departamento/distrito/cidade válidos: prepara código de três níveis + país no JSON.
2. FE PRY sem domicílio, quando opcional: só país, sem dados geográficos; nada 'meio preenchido'.
3. FE PRY com rua mas distrito vazio, ou códigos sem rua: 422; zero reserva de numeração.
4. Distrito/cidade incompatíveis: 422; zero reserva de numeração.
5. B2F com endereço estrangeiro: não recebe geografia paraguaia; respeitar suas exigências próprias.
6. Destino comercial distinto da direção fiscal: `dDirRec` continua FISCAL, sem substituição.
7. A emissão fiscal não altera por essa correção o movimento de inventário, o endereço comercial ou o texto `dInfAdic`.
8. Um reintento existente NÃO deve ser rotulado 'seguro' enquanto permanecer a comparação textual insegura de `direccionEntregaId`; documentar separadamente em PRO-205/324, sem fazer migration por conta própria.

## 4. Limites técnicos ABSOLUTOS

Sem criar ou executar testes, lint, typecheck, build, CI manual, SQL/migration, PostgreSQL, VM, gateway/SIFEN ou emissão real, conforme o gate do responsável. NÃO iniciar PRO-205/324/323, PRO-298 nem outras etapas. NÃO declarar homologação nem PRO-322 Done sem contrato/evidência externa.

## 5. Entrega esperada para o ChatGPT auditar

Responder APENAS:
- checklist factual dos 8 cenários com arquivos/linhas e `OK estático / defeito comprovado / depende fornecedor`;
- confirmação de que o JSON usa endereço fiscal e códigos e NÃO depende de entrega/stock como modelo fiscal;
- relação precisa dos arquivos de código alterados e motivo — **nenhum arquivo se a implementação fiscal já está correta**;
- SHA funcional atual (ou SHA novo completo se algum erro fiscal mínimo foi corrigido e publicado);
- bloqueios independentes: fornecedor JSON não homologado e risco operacional/idempotência de entrega em PRO-205/324, SEM fundi-los;
- testes/SQL/VM/gateway não executados.

**PARAR PARA AUDITORIA DO CHATGPT. Não avançar para outra tarefa.**
