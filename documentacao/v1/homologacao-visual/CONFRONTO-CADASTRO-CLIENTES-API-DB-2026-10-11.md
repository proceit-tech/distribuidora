# Nexit V1 — Confronto campo a campo: formulário Nuevo cliente × API × banco (NEX-005 + NEX-021)

**Data:** 2026-10-11 · **Método:** leitura estática de `app/(private)/clientes/nuevo/page.tsx`, `app/api/clientes/route.ts` (POST), `lib/geografia/referencia.ts` e `documentacao/banco/nexit/v1/migraciones/NEX-005-clientes.sql` (+ NEX-021). **Nenhum teste foi executado** (determinação do responsável): o confronto é de código e esquema, não de comportamento em execução. **Nada foi corrigido nesta etapa**: as divergências abaixo aguardam decisão/autorização específica (Etapa B).

## Resultado geral
Os 6 conjuntos de dados (fiscal, comercial e crédito, contatos, endereços, entrega e vendas, documentos) estão ligados ao POST e às tabelas `clientes`, `cliente_contactos`, `direcciones_cliente` e `cliente_documentos`. O código `CLI-NNNNNN` é atribuído pelo trigger `clientes_asignar_codigo` (com *advisory lock* por empresa, sem corrida) e **não** é enviado pelo formulário; a regra foi mantida. Validação de país × operação (`validarPaisPorOperacion`) e de localização PRY em cascata/opcional (NEX-021) são feitas no backend; empresa e usuário vêm sempre da sessão.

## Divergências e pontos de decisão

| ID | Gravidade | Onde | Constatação | Decisão necessária |
|---|---|---|---|---|
| DIV-CLI-01 | Alta | Não contribuyente B2F | O rótulo exibe "Número de documento (opcional)" para B2F, mas o POST exige `numeroDocumento` para todo não contribuyente e a coluna é `NOT NULL`. Sem número, o envio é recusado. | Tornar de fato opcional (valor padrão acordado) ou corrigir o rótulo para obrigatório. |
| DIV-CLI-02 | Alta | Innominado | A UI mostra e envia `0`. O POST faz uma checagem prévia de duplicidade que **não exclui** `INNOMINADO`, enquanto o índice único do banco exclui (`WHERE tipo_documento <> 'INNOMINADO'`). Resultado: só é possível um cliente Innominado por empresa ("Ya existe un cliente con esa identificación"). | Confirmar se deve existir um único "consumidor final" (então documentar) ou vários (então ajustar a checagem). |
| DIV-CLI-03 | Alta | Endereço FISCAL | Em `cambiarTipoDireccion`, ao marcar um segundo endereço como tipo FISCAL, o anterior mantém `tipo = FISCAL` com `esFiscal = false`; o POST força `es_fiscal = true` quando `tipo = FISCAL`, e o índice `direcciones_cliente_uno_fiscal_key` rejeita as duas. A mensagem devolvida (23505) fala de "identificación o código externo", o que engana. | Corrigir o tratamento no formulário (Etapa B) e mensagens por índice violado. |
| DIV-CLI-04 | Média | Mensagens de erro 23505 | Qualquer violação de unicidade (identificação, código externo, contato principal, endereço fiscal, entrega padrão) devolve a mesma mensagem fixa sobre identificação/código externo. | Mapear por nome de restrição/índice. |
| DIV-CLI-05 | Média | Combinações natureza × operação | A UI restringe (contribuyente: B2B/B2C/B2G; não contribuyente: B2C/B2F), mas o POST aceita qualquer natureza com qualquer operação, desde que o país respeite PRY/≠PRY; o banco não restringe. | Definir a matriz oficial e validar também no backend. |
| DIV-CLI-06 | Alta (regra fiscal) | DV do RUC | O DV é texto livre (até 5) sem cálculo nem validação (frontend, API e banco só exigem não vazio). | Aprovar o algoritmo DNIT e um conjunto de vetores de teste antes de implementar. |
| DIV-CLI-07 | Média | GLN | Campo `varchar(13)`; a API corta silenciosamente em 13 e não valida dígitos nem dígito verificador. | Definir se o GLN deve ser validado (13 dígitos + GS1) ou apenas armazenado. |
| DIV-CLI-08 | Média | Truncamento silencioso | `texto(valor, máximo)` corta valores longos sem erro (razão social 200, documento 30, etc.). A UI limita só alguns campos. | Preferir erro explícito a corte silencioso. |
| DIV-CLI-09 | Baixa | Número de casa | O rótulo mostra "Nro. de casa *" para endereço fiscal, mas nem a UI nem a API nem o banco o exigem. | Decidir se é obrigatório (e permitir "s/n") ou retirar o asterisco. |
| DIV-CLI-10 | Baixa | Moeda × limites | "Límite de crédito (Gs.)" e "Límite temporal (Gs.)" não acompanham a "Moneda predeterminada"; não há regra de compatibilidade moeda × lista de preços. | Decisão comercial. |
| DIV-CLI-11 | Baixa | Dia de cobro | A API aceita decimais entre 1 e 31 (a coluna é `smallint`); a UI usa `type=number` sem passo inteiro. | Exigir inteiro. |
| DIV-CLI-12 | Baixa | Itens parciais descartados | O envio filtra silenciosamente contatos sem nome/e-mail/telefone/celular, endereços sem texto e documentos sem nome/URL. | Avisar o usuário em vez de descartar. |
| DIV-CLI-13 | Baixa | Referências | `condicion_pago_id` e `moneda` não passam por `validarReferenciaEmpresa` (tabelas globais; o banco tem FK). Lista de preços não é validada por moeda/vigência. | Regra de negócio. |

## Etapa A (implementada nesta entrega, só apresentação)
Redesenho visual do formulário `Nuevo cliente` sem alterar campos, estados, regras, API ou dados: cabeçalho único com *breadcrumb* `Maestros / Clientes / Nuevo cliente`, remoção do cabeçalho duplicado, da descrição genérica e do aviso visual de código automático (a geração automática continua), rótulos fixos acima dos campos (sem rótulo flutuante), abas com estado ativo evidente e rolagem controlada, rodapé de ações fixo, alerta de erro único com `role="alert"`, estados vazios compactos e grade responsiva. Os demais formulários **não** foram alterados.

Estado: **não homologado**; sem captura DEPOIS. Nada foi executado no notebook.
