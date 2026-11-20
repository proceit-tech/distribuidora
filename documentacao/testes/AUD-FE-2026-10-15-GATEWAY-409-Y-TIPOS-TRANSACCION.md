# AUD-FE-2026-10-15 — Falha real de envio (HTTP 409) e catálogo iTipTra incompleto

**Analista:** ChatGPT · **Referência:** capturas fornecidas pelo responsável em 15/10/2026 (capturas **não foram versionadas no GitHub**)  
**Produto:** NEXIT V1 · **Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Controle:** [PRO-133](https://linear.app/proceit/issue/PRO-133) e [PRO-134](https://linear.app/proceit/issue/PRO-134); relacionados com [PRO-131](https://linear.app/proceit/issue/PRO-131) e [PRO-61](https://linear.app/proceit/issue/PRO-61).  
**Estado:** DIAGNÓSTICO ESTÁTICO CONFIRMADO NO CÓDIGO; ESTADO DO GATEWAY OPERACIONAL NÃO INSPECIONADO; NÃO HOMOLOGADO.

## A. Fatos verificados

1. Captura com **POST /api/facturas HTTP 409** e banner `La empresa no tiene configurado el gateway de facturación electrónica.`. `lib/facturacion/envio.ts` consulta `fe_gateway_config WHERE empresa_id = $1 AND activo` e lança **exatamente** esse HTTP 409 quando não existe linha ativa. `emitirFactura` chama `configuracionGateway` **antes** de `crearFacturaElectronica`. Portanto, nessa hipótese a própria aplicação não reserva número nem envia `recepcion_de`. A captura não mostra a resposta JSON da requisição, mas o banner coincide literalmente com o erro de preflight. Não classificar esse 409 como rejeição SIFEN ou como HTTP do provedor.
2. `app/(private)/facturas/nueva/page.tsx` permite abrir `Resumen de la factura` e clicar `Enviar factura` apesar de a configuração de gateway não estar disponível; o fluxo atual só descobre a falta no POST. Exibe `Borrador sin guardar` mesmo após revisão; prévia `POST /api/facturas/previa` não grava.
3. `lib/facturacion/payload-fe.ts` já contém `CATALOGO_TIPOS_TRANSACCION` de 1 a 13, mas exporta `TIPOS_TRANSACCION` somente com 1–4; `validarEntradaFE` rejeita 5–13; a UI é abastecida pela API de catálogo e não pode mostrar os demais. É decisão de escopo documentada no progresso, mas deixou uma demanda comercial explícita sem implementação.
4. O código de `gateway.ts` contém contrato real de envio `POST /api/recepcion_de` com Bearer, confirmado por documentação do projeto. O erro mostrado **não permite inferir que o endpoint do gateway falha**; ele nem é alcançado se falhar o preflight.

## B. Referência normativa correta

Fonte oficial: [Manual Técnico SIFEN v150, DNIT, tabela D011/D012](https://www.dnit.gov.py/documents/20123/420592/Manual%2BT%C3%A9cnico%2BVersi%C3%B3n%2B150.pdf/e706f7c7-6d93-21d4-b45b-5d22d07b2d22?t=1687351495907). A tabela do código atual coincide com o manual nestes 13 valores:

| iTipTra | D011 |
|---|---|
| 1 | Venta de mercadería |
| 2 | Prestación de servicios |
| 3 | Mixto (venta de mercadería y servicios) |
| 4 | Venta de activo fijo |
| 5 | Venta de divisas |
| 6 | Compra de divisas |
| 7 | Promoción o entrega de muestras |
| 8 | Donación |
| 9 | Anticipo |
| 10 | Compra de productos |
| 11 | Compra de servicios |
| 12 | Venta de crédito fiscal |
| 13 | Muestras médicas (Art. 3 RG 24/2014) |

**Cuidado:** iTipTra D011 é TIPO DE TRANSAÇÃO; iTiDE C002 é TIPO DE DOCUMENTO; `11` = Compra de servicios, `12` = Venta de crédito fiscal. A aplicabilidade e campos condicionais dependem do tipo DE e das notas técnicas vigentes. Não habilitar 5–13 mediante simples expansão do seletor sem integração do backend; não inventar operação de compra como FE normal.

## C. Matriz de achados / requisitos

| ID | Severidade | Causa no código | Correção e critério de aceite |
|---|---|---|---|
| **FE-OPS-01** | **CRÍTICA para a emissão** | `envio.ts` 43–46: ausência de configuração **ativa** de gateway para a empresa, no banco/ambiente da sessão; estado REAL não verificado. | **Responsável humano, operação read-only primeiro:** identificar a empresa da sessão e verificar se existe linha ativa em `fe_gateway_config` e se o container da aplicação dispõe das credenciais via referência de ambiente **sem imprimir valores**. Não criar linha, credencial ou URL por suposição; gateway precisa ser corretamente provisionado, com backup/autorização se envolver escrita. Após configuração, enviar somente sob autorização. |
| **FE-UX-02** | **ALTA** | UI permite `Enviar factura` mesmo sabendo que o gateway está ausente/inativo; sem estado de prontidão por empresa. | PRO-133: endpoint autorizado de status **sem segredos**, estado `SIN_CONFIGURAR/INVALIDA/SIN_CREDENCIALES/CONFIGURADO`; bloquear ação `Enviar` enquanto não pronto, permitir revisão sem gravação; explicar que 409 não consumiu número. Backend permanece soberano com preflight contra corrida de estado. |
| **FE-CAT-03** | **ALTA** | `TIPOS_TRANSACCION` 1–4 / `validarEntradaFE` rejeita 5–13. | PRO-134: expor corretamente a referência 1–13 e tratar suporte **por operação/tipo de documento**, campos condicionais e cálculos; separar disponibilidade normativa de possibilidade de emissão. Não permitir opção transmitível sem payload válido. Critério: listagem completa conforme manual, indicação clara do suporte e testes de cada cenário liberado; sem emissão indevida. |
| **FE-UX-04** | MÉDIA | Resumo mostra IVA `8.272,72727273` diretamente como valor de leitura; é necessário distinguir precisão fiscal interna de apresentação comercial. | Na revisão visual posterior, formatar importes para leitura em PYG sem alterar resultado exato usado no payload, mantendo rastreabilidade das parcelas tributárias. Sem mudar motor fiscal neste escopo. |

## D. Plano de restauração da emissão — sem misturar deploy, programação e configuração

1. **Diagnóstico operacional de SOMENTE leitura:** confirmar NEX-047/048/060 instaladas ou não em `schema_migrations`, versão/SHA realmente em execução, empresa da sessão, `fe_gateway_config.activo`, consistência de `base_url`/referência (não expor URL se sensível), existência de env vars no container por **presença booleana**; não copiar senha/token/RUC para ticket/log.
2. **Provisionamento (responsável humano):** cadastrar/corrigir configuração da empresa e as variáveis privadas conforme contrato comprovado, em janela segura e seguindo backup/preflight; credenciais nunca no Git. Não supor que o gateway de outro cliente aceita CASA MINGO.
3. **PRO-133 / Claude:** programar controle de estado e mensagens, porém nenhuma mudança de tela sozinha resolve ausência de configuração real; teste unitário de 409 sem consumo de número, status sem segredo, estados de recepção/sucesso/indeterminado.
4. **PRO-134 / Claude:** implementação de todos os tipos e aplicabilidade, tratando operações especiais e validações específicas. Separar os códigos que são válidos para FE de fluxos que exigem AFE ou tratamento próprio; completar suporte, não apenas dropdown.
5. **PRO-131 / implantação:** NEX-060 precisa evidência SQL e inventário das migrations anteriores antes de publicar novos leitores no único banco operacional. Não ordenar `aplicar-migraciones.sh --permitir-banco-real` sem a pré-inspeção — executaria TODAS as pendentes, não apenas a NEX-060.
6. **Homologação humana real:** teste controlado de autorização por empresa, emissão número único, recepção pelo gateway e posterior estado SIFEN; registrar identificadores/status sem segredos. O NEXIT tem UM ambiente operacional, com dados reais; não executar testes destrutivos nele.

## E. Limites e prioridade

A configuração ativa de gateway **não pode ser inferida com 100% de certeza de uma captura sem checar o banco/response body**, mas a mensagem da tela corresponde literalmente ao preflight. O catálogo 1–4 está comprovado no Git. Os novos casos não foram implementados nem homologados. Nenhum acesso à VM, banco real, autenticação do gateway ou envio foi realizado por ChatGPT.

**Decisão analítica:** priorizar restaurar a capacidade de emissão FE existente e o diagnóstico seguro da configuração; em paralelo especificar as 13 transações sem habilitar caminhos fiscais incorretos. O bloqueio de PRO-131 deve impedir a **publicação conjunta**, não a análise e programação independentes de PRO-133/134.
