# NEXIT V1 — evidências fiscais de 13 XMLs de Factura Electrónica (14/10/2026)

**Finalidade:** referência auditável para concluir o fluxo de Facturación / FAT-E2; **não** é comprovação independente de homologação ou autorização dos oito novos DE. A origem são 13 XMLs enviados pelo responsável nesta conversa. A análise foi efetuada **fora do Git** com XML/Decimal de precisão arbitrária; os originais NÃO foram publicados para não divulgar dados pessoais de receptores, certificados, assinaturas, CDCs ou dados comerciais individualizados. Os vetores abaixo são **sanitizados**, sem RUC, nome, CDC, protocolo, endereço, e-mail, GTIN ou assinatura.

**Escopo da evidência:** todos os 13 XMLs são FE em PYG com um ou mais itens tributados integralmente pelo IVA 10% (iAfecIVA=1, dPropIVA=100). **Nenhum** comprova IVA 5%, gravado parcial (iAfecIVA=4), moeda estrangeira, remissão ou nota de crédito. Cinco pertencem ao conjunto A (serviços, um item, outubro 2026); oito ao conjunto B (distribuidora, múltiplos itens e descontos). Os exemplos são **XMLs de saída SIFEN**, não exemplos de JSON de entrada do gateway: campos homônimos não devem ser confundidos.

## 1. Vetores documentais sanitizados

| ID | Itens | Total comercial PYG (F014) | Base 10% (F019) | IVA 10% (F016) | Itens com desconto | Condição |
|---|---:|---:|---:|---:|---:|---|
| A01 | 1 | 13.800.000 | 12.545.455 | 1.254.545 | 0 | Crédito |
| A02 | 1 | 4.300.000 | 3.909.091 | 390.909 | 0 | Contado |
| A03 | 1 | 250.000 | 227.273 | 22.727 | 0 | Contado |
| A04 | 1 | 10.000.000 | 9.090.909 | 909.091 | 0 | Crédito |
| A05 | 1 | 1.500.000 | 1.363.636 | 136.364 | 0 | Contado |
| B01 | 4 | 631.000 | 573.636,36363637 | 57.363,63636363 | 0 | Contado |
| B02 | 3 | 154.185 | 140.168,18181819 | 14.016,81818181 | 3 | Contado |
| B03 | 5 | 199.100 | 180.999,99999999 | 18.100,00000001 | 0 | Contado |
| B04 | 2 | 161.880 | 147.163,63636364 | 14.716,36363636 | 2 | Contado |
| B05 | 2 | 234.240 | 212.945,45454546 | 21.294,54545454 | 2 | Contado |
| B06 | 10 | 241.000 | 219.090,90909090 | 21.909,09090910 | 0 | Contado |
| B07 | 20 | 1.435.280 | 1.304.800 | 130.480 | 20 | Contado |
| B08 | 1 | 4.496.760 | 4.087.963,63636364 | 408.796,36363636 | 0 | Contado |

IDs A/B são **identificadores artificiais apenas para regressões**. Para cada linha, F019 + F016 = F014 na precisão publicada. Contagem: conjunto B = **8 faturas, 47 itens, 27 itens com desconto**; conjunto A = 5 faturas, 5 itens; total = 13 faturas, 52 itens.

## 2. Achados matemáticos reproduzidos dos XMLs

**[XML-A] Precisão de moeda:** nas 13 faturas, F014 e os pagamentos a contado estão em guaranis inteiros (sem centavos). Todas as faturas a contado conciliam a soma de dMonTiPag com F014. Nas duas a crédito não há obrigação de informar pagamento a contado. Esse padrão observado não prova que todo campo monetário de um XML PYG deva ser inteiro.

**[XML-B] IVA de saída:** conjunto A tem base e IVA como inteiros em PYG (ex.: total 1.500.000 → base 1.363.636 + IVA 136.364); conjunto B possui base e IVA com até **8 casas**, e a composição por item coincide com arredondamento decimal **metade para cima** na 8ª casa.

**[XML-C] Teste numérico B:** nos **47/47** itens do conjunto B, base = valor líquido / 1,1 arredondado a 8 casas; IVA = valor líquido / 11 arredondado a 8 casas; base + IVA = valor líquido do item. Truncamento independente dos dois campos a 8 casas NÃO reproduz as 47 conciliações: base truncada coincide em 21/47 e IVA truncado em 26/47, mas **nenhum item tem ambos os resultados truncados que coincidam simultaneamente**. Portanto, a afirmação «a 9ª casa simplesmente se descarta em todo IVA» **não é confirmada** por esses XMLs e contraria as saídas observadas. Não substituir globalmente a função decimal do NEXIT sem análise/aceite.

**[XML-D] Resíduos:** B03 contém F019 = 180.999,99999999 e F016 = 18.100,00000001; a soma é **199.100 exatos**, sem desvio do total comercial. Esses resíduos nos componentes **não** provam a admissibilidade de F014 ≠ soma dos itens. Nenhum XML cobre a pendência P-11 de gravado parcial.

**[XML-E] Campos F013, F023, F036/F037:** nos 13 XMLs, dRedon=0, **dTotalGs não aparece**, e dLiqTotIVA5/dLiqTotIVA10 (IVA decorrente de arredondamento) aparecem como zero, mesmo com IVA 10% positivo. Contraste com JSON funcional do gateway na matriz FAT-E1: ele fornece dTotalGs e dLiqTotIVA10 como IVA do tramo. **Não trocar campos do JSON de entrada sem prova de como o gateway os converte em XML.** A observação normativa relativa a F023 em PYG foi corroborada no Manual v150; a diferença JSON→XML continua questão contratual P-02/P-12.

**[XML-F] Descontos:** conjunto B: 27/47 itens com descontos comerciais; dTotOpeItem é líquido do desconto e a tributação usa esse líquido. Isso constitui evidência para funcionalidade FUTURA: o payload FE V1 do NEXIT ainda não implementa desconto e **não deve inventá-lo na FAT-E2**. O total de 47/47 itens foi confrontado com líquido e decomposição IVA.

## 3. Limites de procedência e aprovação

- O conjunto A contém **dProtAut** nos XMLs; não foi realizada consulta independente ao serviço DNIT nem validação criptográfica da assinatura.
- O conjunto B consiste em DEs assinados, mas **sem dProtAut** no arquivo XML recebido; aprovação foi **informada pelo responsável**, não verificada neste exame. Não declarar «aprovado pela SIFEN» só porque há assinatura, CDC, resposta HTTP 2xx ou arquivo XML.
- Conjunto B: dFecFirma indica **14/10/2026**, mas dFeEmiDE aponta **15/10/2026** em sete XMLs e **16/10/2026** em um; datas posteriores à data desta análise. **Divergência documental a verificar**, sem corrigir nem presumir erro de timezone.
- Não publicar nem colocar nos logs os originais, certificados, RUC dos destinatários, nomes, endereços, e-mail, CDC completo, tokens, senhas ou assinatura.

## 4. Critérios de uso em regressões

1. Reproduzir os 13 vetores agregados sanitizados (F014, base, IVA), distinguindo os cinco XMLs com IVA inteiro e os oito XMLs com IVA a 8 casas. Não assumir que os dois conjuntos usam a mesma política de apresentação/arredondamento no XML.
2. Usar aritmética decimal precisa (sem float cumulativo) e confrontar item e subtotal. Cobrir caso B03: componentes com 10⁻⁸ de sinal contrário e F014 inteiro.
3. Testar IVA 10% com desconto unitário usando fixtures artificiais: por exemplo 4 × 4.000 = 16.000 → base 14.545,45454545 e IVA 1.454,54545455. O campo de desconto pertence à evolução do payload e NÃO à FAT-E2 autorizada.
4. Preservar regressão fiscal anterior de valor de referência 107.300 / IVA 9.754,54545454 e bloqueio do gravado parcial inconsistente (P-11).
5. **NÃO** usar exemplos de XML aprovado como prova do contrato de entrada `/api/recepcion_de`, das chaves `null`/omitidas, de P-02/P-12 no JSON, de resposta de consulta ou da autorização da transmissão real.

## 5. Referências internas

- `documentacao/v1/MATRIZ-FISCAL-FE-E1-2026-10-14.md` (P-01/P-02/P-03/P-11/P-12).
- `documentacao/v1/auditoria-por-menu/AUD-FACTURAS-V1.md` (AUD-FAT-E1-R02; escopo FAT-E2).
- `lib/facturacion/calculo.ts`, `payload-fe.ts`, `gateway.ts`, `envio.ts`, `estados.ts`.
- Ordem vigente: `documentacao/v1/PLANO-FAT-E2-ENVIO-SIFEN-2026-10-14.md`.

**Estado:** EVIDÊNCIA DOCUMENTAL E CÁLCULO LOCAL CONFERIDOS; não houve envio, consulta API real, modificação do código ou homologação nesta análise.
