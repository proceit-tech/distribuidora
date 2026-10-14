# NEXIT V1 — Matriz fiscal da Factura Electrónica (FAT-E1) — 14/10/2026

**Escopo:** apenas Factura Electrónica (`iTiDE = 1`) da operação suportada hoje: **PYG, Contado, Efectivo**, preço comercial com IVA incluído. Etapa 1 de 4 (AUD-FAT-ETAPAS-04). Nenhum envio ao gateway, nenhum acesso a VM/Docker/PostgreSQL, nenhuma migration nova.
**Fontes consultadas:** Manual Técnico SIFEN v150 e Notas Técnicas 001–027 do pacote arquivado (`documentacao/referencias/sifen/`, texto extraído do ZIP original; **as tabelas do MT saem com colunas desordenadas na extração — a conferência página a página no PDF original continua pendente**, ver manifesto), JSON funcional do gateway (mapeado em `REQUISITOS-FACTURACION-ELECTRONICA-API-EXTERNA-2026-10-12.md`, AUD-FE-100), `payload-fe.ts`, `calculo.ts`, `emision.ts`, `NEX-047…051` (só para compreender contratos).
**Legenda de prova:** **[MT]** Manual v150 · **[NT n]** Nota Técnica n (prevalece sobre o MT no tema) · **[GW]** apenas o JSON funcional/contrato do gateway (proprietário, **não** é norma SIFEN) · **[NEX]** valor fixado por decisão do responsável ou função SQL NEX-048 · **[PEND]** não comprovado.
A NT 021 não está no pacote (lacuna conhecida). O XSD oficial não está no pacote: onde o MT diz `1-15p(0-8)` usa-se a leitura «parte inteira ≤ 15, decimais ≤ 8»; se o XSD limitar o total de dígitos, a restrição seria mais estrita [PEND].

## 1. Divergências comprovadas e corrigidas

| ID | Campo | Norma | Antes | Correção (`payload-fe.ts` / `emision.ts`) |
|---|---|---|---|---|
| E1-01 | `dMonTiPag` (E608) | [MT] `1-15p(0-4)`: no máximo 4 decimais | O pagamento era o total com até 8 decimais (`Number(monto)`); com gravado parcial o total fica p. ex. `40500.00000001` (resíduo de arredondamento da fórmula NT 13) | Pagamento = total arredondado (meio para cima) a 4 decimais (`montoPagoDe`); validação rejeita monto com mais de 4 decimais; servidor usa a mesma regra. Totais inteiros: sem mudança |
| E1-02 | `dDTipIDRec` (D209) | [MT] obrigatório se existe D208; texto do catálogo (1 Cédula paraguaya, 2 Pasaporte, 3 Cédula extranjera, 4 Carnet de residencia, 5 Innominado, 6 Tarjeta Diplomática de exoneración fiscal; 9 informa-se o tipo) | O cadastro (`clientes.descripcion_documento_identidad`) só guarda descrição para `OTRO`; para 1–6 o JSON saía `null` | Códigos 1–6: descrição do catálogo do MT; 9: descrição do cadastro (9–41 caracteres, validada) |
| E1-03 | `dCodCliente` (D217) | [MT] opcional, `A 3-15`; `clientes.codigo` é `varchar(50)` | Enviava o código interno sem limitar tamanho | Envia só se tem 3–15 caracteres; senão `null` (não corta nem inventa) |
| E1-04 | `dCantProSer` (E711) | [NT 23] `1-10p(0-8)` (a NT 23 amplia os decimais de 4 para 8) | Aceitava até 15 dígitos inteiros | Rejeita parte inteira > 10 dígitos |
| E1-05 | Serialização numérica | JSON number de JavaScript | `numeroDec` perde dígitos acima de ~15 cifras significativas e escreve `1e-8` para valores pequenos | Validação rejeita a fatura se algum valor (quantidade, preço, proporção, itens, subtotais) não é exatamente representável |
| E1-06 | `dDVRec` (D207) | [MT] `A 1`; algoritmo módulo 11 | Só exigia DV não vazio (`Number("12")` passava) | Exige exatamente 1 dígito (o cálculo módulo 11 continua no módulo Clientes/aptidão) |
| E1-07 | `iTiContRec` (D205) | [MT] obrigatório se D201 = 1 | O payload só validava RUC/DV | Contribuinte exige tipo 1 ou 2 |
| E1-08 | `dNomRec`, `dNumIDRec`, `iTipIDRec`, `dDirRec` | [MT] D211 `4-255`; D210 `1-20` (Innominado: «0», NT 23); D211 Innominado «Sin Nombre»; D208 ∈ {1–6, 9}; D213 `1-255`, obrigatório em B2F | Só o módulo Clientes validava; o payload não repetia as regras | Defesa em profundidade no payload: razão social 4–255, documento ≤ 20, tipo de documento válido, Innominado = «0» + «Sin Nombre», direção ≤ 255 e obrigatória em B2F |
| E1-09 | `cUniMed` (E709) | [MT] `N 1-5` | Só exigia não nulo | Exige inteiro de 1 a 99999 (a vigência no catálogo oficial continua verificada por `emision.ts` contra `unidades_medida_sifen`) |

## 2. Pendências e decisões que NÃO se puderam provar (não alteradas)

| ID | Ponto | Situação |
|---|---|---|
| P-01 | Chaves opcionais **omitidas versus `null`** (36 chaves de AUD-FE-100) e as enviadas como `null` (`dInfoEmi`, `dInfoFisc`, `dCondTiCam`, `dTiCam`, `dFecEmNR`, `iCondCred`, `dPlazoCre`, `dCuotas`, `dTiCamTiPag`) | **[GW]**. O MT não define o envelope JSON do gateway; só o retorno real pode decidir. Regressão fixa o conjunto atual de chaves (não muda sem decisão) |
| P-02 | `dTotalGs` (F023) em PYG | O MT exige F023 só para moeda estrangeira (validações 236–238) e uma observação extraída diz «no debe existir si D015 = PYG» (coluna desordenada, não atribuível com certeza); o JSON funcional **aceito** traz `dTotalGs = 107300`. Mantido; confirmar no PDF original/gateway |
| P-03 | Redondeo SEDECO a múltiplos de 50 Gs (Res. 347/2014, citada no MT) | Nenhuma validação do MT o impõe (F014 = F008 − F011 − F012 − F013). `dRedon = 0` mantido; aplicar arredondamento é decisão comercial do responsável |
| P-04 | Quantidade: Nexit admite só **4** decimais (NT 23 admite 8) | Restrição própria, mais estrita que a norma, sem risco fiscal; ampliar depende de decisão do responsável |
| P-05 | Fórmula da base gravada do **gravado parcial**: o MT original (validações 158/159) difere da **NT 13** | Implementa-se a NT 13 (posterior, prevalece). Para gravado integral (E733 = 100) ambas coincidem. Confirmar com o gateway se um item parcial real é aceito |
| P-06 | Limites de comprimento de `dTelRec` (6–15), `dCelRec` (10–20), `dEmailRec` (3–80) | Validados pelo módulo Clientes (`campos-receptor.ts`/`telefono.ts`), não pelo payload; não duplicados aqui |
| P-07 | GTIN: só comprimento (8/12/13/14); dígito verificador GS1 não validado | O MT não o exige em E714; não inventado |
| P-08 | `dNumCasRec = 0` quando o cadastro não traz número utilizável | Parâmetro de prova **[NEX]** (decisão 12/10/2026); a norma prevalece se o gateway rejeitar |
| P-09 | `iIndPres = 9 «Otro»` e tipos de transação 5–13 | Não oferecidos (E012 / regras fiscais próprias), conforme código e decisões anteriores |
| P-10 | NT 021 ausente do pacote; XSD ausente | Lacuna de fonte |

## 3. Matriz de campos (valores = fixture sintética `entradaFE()` do teste: cliente contribuyente PJ, 1 ítem 11.000 Gs al 10 %, pago 11.000)

### 3.1 Cabecera

| Campo JSON | Ref. | Obrigatoriedade / condição | Tipo / precisão | Origem NEXIT | Valor produzido | Estado |
|---|---|---|---|---|---|---|
| `iTiDE` | C002 [MT] | obrigatório | N | fixo 1 (FE) | `1` | OK |
| `dInfoEmi`, `dInfoFisc` | [GW] | opcional | A | não derivado (não inventar) | `null` | P-01 |
| `iTipTra` | D011 [MT] | opcional/catálogo 1–13 | N | seleção do operador; 1–4 habilitados | `1` | OK |
| `iTImp` | D013 [MT] | obrigatório | N | fixo 1 (IVA) | `1` | OK |
| `cMoneOpe` | D015 [MT] | obrigatório | A 3 | fixo `PYG` | `"PYG"` | OK |
| `dCondTiCam`, `dTiCam` | D017/D018 [MT] | só moeda estrangeira | N | PYG ⇒ não aplica | `null` | OK (P-01) |
| `iIndPres` | E011 [MT] | catálogo 1–6, 9 (9 exige E012) | N | seleção; 1–6 habilitados | `1` | OK |
| `dFecEmNR` | [GW] | só quando aplica | — | não preenchido sem regra | `null` | P-01 |
| `dInfAdic` | G002 [MT] | opcional, 1–5000 | A | texto do operador (≤ 5000; vazio ⇒ `null`) | `null` | OK |
| `iNatRec` | D201 [MT] | obrigatório | N 1 | cadastro | `1` | OK |
| `iTiOpe` | D202 [MT]/[NT 10] | obrigatório | N 1 | cadastro | `1` | OK |
| `cPaisRec` | D203 [MT] | obrigatório | A 3 | cadastro | `"PRY"` | OK |
| `iTiContRec` | D205 [MT] | obrigatório se D201 = 1; não informar se 2 | N 1 | cadastro | `2` | E1-07 |
| `dRucRec` | D206 [MT] | obrigatório se D201 = 1 | A 3-8 | cadastro (sem DV) | `"80000005"` | OK |
| `dDVRec` | D207 [MT] | obrigatório se há D206 | **N como número no JSON [GW]**, 1 dígito | cadastro | `6` | E1-06 |
| `iTipIDRec` | D208 [MT]/[NT 23] | obrigatório se D201 = 2 e D202 ≠ 4; não informar se D201 = 1 | N 1 | cadastro | `null` | OK |
| `dDTipIDRec` | D209 [MT] | obrigatório se há D208 | A 9-41 | catálogo do MT / cadastro (9) | `null` | E1-02 |
| `dNumIDRec` | D210 [NT 23] | obrigatório se D201 = 2 e D202 ≠ 4; Innominado «0» | A 1-20 | cadastro | `null` | E1-08 |
| `dNomRec` | D211 [MT] | obrigatório; Innominado «Sin Nombre» | A 4-255 | cadastro | `"EMPRESA SINTETICA SA"` | E1-08 |
| `dNomFanRec` | D212 [MT] | opcional | A 4-255 | cadastro (vazio ⇒ `null`) | `null` | OK |
| `dDirRec` | D213 [MT] | obrigatório em B2F; senão opcional | A 1-255 | direção fiscal | `"Calle 1"` | E1-08 |
| `dNumCasRec` | D218 [MT] | com D213; Innominado 0 | **N como número [GW]** 1-6 | cadastro (1–6 dígitos) ou 0 [NEX] | `123` | P-08 |
| `dTelRec`, `dCelRec`, `dEmailRec` | D214–D216 [MT] | opcionais | A 6-15 / 10-20 / 3-80 | cadastro | `null`, `null`, `"a@b.com"` | P-06 |
| `dEmailAdic`, `dEmailAdmin` | [GW] | opcionais | A | cadastro | `null` | OK |
| `dCodCliente` | D217 [MT] | opcional | A 3-15 | `clientes.codigo` | `"CLI-000001"` | E1-03 |
| `iCondOpe` | E601 [MT] | obrigatório em FE | N 1 | fixo 1 (Contado) | `1` | OK |
| `iCondCred`, `dPlazoCre`, `dCuotas`, `Cuotas` | E602… [MT] | só crédito | — | Contado ⇒ não aplica | `null`, `null`, `null`, `[]` | OK (P-01) |

### 3.2 `FormaPago[0]`

| Campo | Ref. | Condição | Tipo | Origem | Valor | Estado |
|---|---|---|---|---|---|---|
| `iTiPago` | E606 [MT] | obrigatório com contado | N 1-2 | só Efectivo [NEX] | `1` | OK |
| `dMonTiPag` | E608 [MT] | obrigatório | N `1-15p(0-4)` | total arredondado a 4 decimais (servidor) | `11000` | E1-01 |
| `cMoneTiPag` | E609 [MT] | obrigatório | A 3 | `PYG` | `"PYG"` | OK |
| `dTiCamTiPag` | E611 [MT] | não deve existir se PYG | N | n/a | `null` | OK (P-01) |

### 3.3 `Detalles[]` (1–999 ocorrências)

| Campo | Ref. | Condição | Tipo / precisão | Origem | Valor (11.000 al 10 %) | Estado |
|---|---|---|---|---|---|---|
| `dCodInt` | E701 [MT] | obrigatório | A 1-20 | `productos.codigo` | `"P-1"` | OK (validado) |
| `dGtin` | E714 [MT] | opcional | A 8/12/13/14 | `producto_codigos`/`codigo_barras` | `null` | P-07 |
| `dDesProSer` | E708 [MT] | obrigatório | A 1-120 | `descripcion_factura` | `"Producto de prueba"` | OK |
| `cUniMed` | E709 [MT] Tabla 5 | obrigatório | N 1-5 | `unidades_medida.unidad_sifen_codigo` (vigente) | `77` | E1-09 |
| `dCantProSer` | E711 [NT 23] | obrigatório | N `1-10p(0-8)`; Nexit ≤ 4 decimais | operador | `1` | E1-04, P-04 |
| `dPUniProSer` | E721 [MT] | obrigatório se C002 ≠ 7 | N `1-15p(0-8)`, **IVA incluído** | preço de referência (ou do operador com permissão) | `11000` | OK |
| `dTotBruOpeItem` | E727 [MT] | obrigatório | N | E721 × E711, 8 decimais | `11000` | OK |
| `dTotOpeItem` | EA008 [MT] | obrigatório | N | = E727 (sem descontos/anticipos) | `11000` | OK |
| `iAfecIVA` | E731 [MT] | 1 gravado, 2 exonerado, 3 exento, 4 parcial | N 1 | `productos.afectacion_iva` | `1` | OK |
| `dPropIVA` | E733 [MT] | 1 ⇒ 100; 2/3 ⇒ 0; 4 ⇒ (0,100) | N | cadastro / regra | `100` | OK (testado 0/100/50) |
| `dTasaIVA` | E734 [MT] | 5/10 se E731 = 1 ou 4; 0 se 2 ou 3 | N | `impuestos.porcentaje` | `10` | OK |
| `dBasGravIVA` | E735 [NT 13] | `100·EA008·E733 / (10000 + E734·E733)` | N 8 dec | calculado no servidor | `10000` | OK (P-05) |
| `dLiqIVAItem` | E736 [MT] | `E735 · E734 / 100` | N 8 dec | calculado | `1000` | OK |
| `dBasExe` | E737 [NT 13] | só E731 = 4: `100·EA008·(100−E733) / (10000 + E734·E733)` | N 8 dec | calculado | `0` | OK |

### 3.4 `Subtotales[0]`

| Campo | Ref. | Regra | Valor (fixture) | Estado |
|---|---|---|---|---|
| `dSubExe` | F002 [NT 13] | Σ EA008 (E731=3) + Σ E737 (E731=4) | `0` | OK |
| `dSubExo` | F003 [MT] | Σ EA008 (E731=2) | `0` | OK |
| `dSub5` / `dSub10` | F004/F005 [NT 13] | Σ EA008 (E731=1) + Σ (E735+E736) (E731=4), por tasa | `0` / `11000` | OK |
| `dTotOpe` | F008 [MT] | F002+F003+F004+F005 | `11000` | OK |
| `dTotDesc`, `dTotDescGlotem`, `dTotAntItem`, `dTotAnt`, `dPorcDescTotal`, `dDescTotal`, `dAnticipo`, `dRedon` | F009–F013, F033–F035 [MT] | obrigatórios com 0 se não há | `0` | OK (P-03) |
| `dTotGralOpe` | F014 [MT] | F008 − F013 (sem desconto/anticipo) | `11000` | OK |
| `dIVA5` / `dIVA10` | F015/F016 [MT] | Σ E736 por tasa | `0` / `1000` | OK |
| `dLiqTotIVA5` / `dLiqTotIVA10` | F036/F037 [MT] | liquidação **por redondeo**; Nexit repete o IVA do tramo (convenção do JSON funcional [GW]: 9754.54545454) | `0` / `1000` | OK (convenção [GW]; ver nota) |
| `dTotIVA` | F017 [MT] | F015 + F016 | `1000` | OK |
| `dBaseGrav5` / `dBaseGrav10` | F018/F019 [MT] | Σ E735 por tasa | `0` / `10000` | OK |
| `dTBasGraIVA` | F020 [MT] | F018 + F019 | `10000` | OK |
| `dTotalGs` | F023 [MT] | obrigatório só em moeda estrangeira | `11000` | P-02 |

*Nota `dLiqTotIVA5/10`:* o MT descreve estes campos como IVA do redondeo (F036/F037, com `dRedon = 0` seriam 0 e F017 = F015 + F016 − F036 − F037 + F026). O JSON funcional aceito pelo gateway traz o valor igual ao IVA do tramo; Nexit segue o JSON funcional (decisão AUD-FE-01 já registrada). Como F017 se calcula aqui como F015+F016, a coerência interna se mantém. Confirmar com o gateway se necessário [PEND].

## 4. Fixtures e regressões (`lib/facturacion/facturacion.casos.ts`, prefixo «E1»)

Fixtures **sintéticas** (sem dados pessoais, CDC, segredos nem RUC reais): contribuyente PJ/PF, não contribuyente com cada tipo de documento (1–4, 6, 9), Innominado (B2C, limites 6.999.999 / 7.000.000 / 7.000.001), B2F; fatura mista com IVA 5 %, 10 %, exento, exonerado e gravado parcial 50 % (subtotais com aritmética independente: exento 10238.0952381, exonerado 3000, 5 % 10500, 10 % 16761.90476191, IVA 2023.80952381); referência do gateway (24.600 + 24.600 + 58.100 = Gs. 107.300, IVA 9754.54545454, base 97545.45454546, JSON serializado sem aspas nem notação exponencial); quantidades 4 decimais e preços decimais (pago arredondado a 4 decimais); unidade SIFEN válida/inválida; conjunto exato de chaves; opcionais vazios ⇒ `null`; pago igual ao total, só Efectivo; rejeição de dados fiscais incompletos. As regressões são simulações puras do montador; **não provam aceitação do gateway nem de SIFEN**.
