# Nexit V1 — decisões do responsável sobre Clientes — 2026-10-11

**Estado:** decisões de negócio aprovadas para especificação e implementação **após autorização de etapa**; não homologação do código, não autorização automática de migration, VM ou deploy.
**Referências:** P0 `MATRIZ-COMPORTAMENTO-CONDICIONAL-CLIENTES-P0-2026-10-11.md`, AUD-R04, MT SIFEN v150 e NTs arquivadas. Registrar distinção entre cadastro ERP e campos enviados em XML SIFEN.

## Decisões vinculantes

**DEC-CLI-01 — B2F.** Cliente B2F é **sempre No contribuyente**. No cadastro ERP, **Tipo de documento e Número de documento sempre obrigatórios**. Se Tipo de documento = **OTRO**, exigir e armazenar **Descripción del documento**. UI e API devem aplicar a regra, independente de como se omitem D208/D210 no XML B2F segundo a norma discutida. B2F exige país exterior de acordo com regras já existentes. Não alterar mapeamento XML V2 nesta tarefa. Não aceitar documento vazio nem inventar número. A restrição de Innominado em B2F permanece.

**DEC-CLI-02 — Contribuyente.** É obrigatório selecionar **Persona física ou Persona jurídica**; RUC é obrigatório e **DV deve ser calculado automaticamente com base no RUC**, usando algoritmo oficial aplicável da DNIT, validado com vetores confiáveis. Backend deve verificar coerência RUC/DV para não confiar só na UI. A implementação do cálculo fica **bloqueada até documentar algoritmo e vetores verificáveis**, sem inventar fórmula nem usar algoritmo do CDC. Preservar zeros à esquerda e RUC como texto. A forma de apresentar Tipo de persona para No contribuyente permanece decisão separada D-01 (a regra aprovada aqui é apenas para contribuinte).

**DEC-CLI-03 — Innominado.** **Um único registro oficial de cliente Innominado por empresa.** Preservar pré-checagem de unicidade da API e impedir duplicações em concorrência real; não alterar para vários. A exceção do índice de identificação existente no banco não garante essa política; antes de pensar em migration, documentar estratégia de unicidade robusta, sem alterar SQL aplicado sem autorização. Um registro existente pode ser reutilizado pela empresa; não criar novo a cada venda. Regras NT para tipo/valor de DE aplicam-se na emissão, não devem bloquear genericamente o cadastro.

## Decisão ainda aberta — notificações (D-12)
`recibeNotificaciones` existe no estado do contato, começa como `true` e é enviado/persistido pela API, **sem checkbox exposto na UI**. Significa preferência genérica de receber notificações, distinta de `recibePedidos`, `recibeFacturacion`, `recibeCobranzas` e `recibeDocumentosElectronicos`. Não presumir canal, evento, funcionamento de envio ativo ou finalidade específica sem confirmar a implementação real. **O responsável ainda não aprovou mostrar a opção ou alterar o valor padrão.** Até nova decisão, preservar valor/comportamento existente e não prometer envio operacional.

## Regras de execução
Claude deve ler protocolos e matriz atualizados, preparar correções por etapas P1 (UI) e P2 (API/regras), **somente após autorização expressa do responsável**. O cálculo de DV requer fonte oficial e vetores antes de codificar. Não alterar Banco/migrations por conta própria; preservar V1 e seis seções, tenant por sessão, código CLI automático; proibidos notebook build/testes/Docker/PG e acesso VM/deploy conforme orientação do responsável.
