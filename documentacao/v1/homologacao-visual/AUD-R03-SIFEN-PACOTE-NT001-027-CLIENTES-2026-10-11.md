# Nexit V1 — AUD-R03 — Revisão normativa SIFEN do arquivo DNIT recebido
**Data:** 2026-10-11. **Estado:** EM AUDITORIA NORMATIVA — NÃO HOMOLOGADO — IMPLEMENTAÇÃO BLOQUEADA.
**Fonte entregue pelo responsável:** `NT_E_KUATIA_027_MT_V150(3).zip` (anexo da conversa; **ZIP e PDFs não foram enviados ao GitHub**).
**Integridade do inventário:** 28 entradas = 27 PDFs (Manual Técnico v150 + 26 NTs) e 1 planilha `CÓDIGO DE REFERENCIA GEOGRAFICA_NOVIEMBRE_2025__.xlsx`. Notas presentes: 001–020 e 022–027; **NT 021 não está no pacote**. Este documento NÃO certifica que o pacote contenha toda a legislação/XSD vigente ou que a NT 021 inexista. A revisão do acervo é distinta da confirmação externa de vigência.
**Fontes do código:** `app/(private)/clientes/nuevo/page.tsx`, `app/api/clientes/route.ts`, `NEX-005-clientes.sql`, auditorias R01/R02, CLAUDE.md, PROTOCOLO-IA.md, PROGRESSO-NEXIT-V1.md. A versão real de migrations aplicadas na VM não foi inspecionada.
**Método:** inventário de todos os componentes, extração textual de todos os 27 PDFs, busca transversal de regras de receptor/D3 e leitura direcionada das NTs que os alteram. Não houve conferência exaustiva página-a-página de cada capítulo alheio ao Cadastro de Clientes (eventos, timbrado, crédito etc.), tampouco verificação de cada linha da planilha geográfica. Portanto **NÃO alegar revisão 100% do SIFEN completo**.

## 1. Inventário por família e pertinência direta
- MT v150: regras originais D3 e validações do receptor, tabelas de país/códigos, contexto DE.
- NTs 001,004,006–009,011–013,015–016,018–019,022,025–026: textos examinados por busca de D3 e vocabulário receptor; sem alteração direta desses campos encontrada nessa triagem. **Não equivale a declarar irrelevância de todas as regras dessas notas à emissão SIFEN**.
- NT 002: D208/D210 e validações — número/tipo da identidade para não contribuinte, exceção B2F.
- NT 003: D219/D223 e geografia receptor quando endereço informado e operação diferente de B2F.
- NT 005: D204 descrição de país; confrontar geografia derivada.
- NT 010: mudanças na validação D202 natureza versus operação; D208b Innominado; D208e NC/ND; ler condição completa por C002.
- NT 014: principalmente evento de nominación, campos GENFE, **não confundir o contrato do evento com cadastro nem DE original**.
- NT 017: modificações de descrição distrital do receptor.
- NT 020: D202b — quando RUC corresponde a organismo estatal (OEE), operação B2G.
- NT 023: alterações D208 e D210, validações D208e/f/g, D210/D210b; há redações a conciliar entre tabela e validação.
- NT 024: D208c; Innominado não permitido se total >= Gs 7.000.000, salvo exceção de muestras médicas informada na NT.
- NT 027: evento de nominación, GENFE010/011; **não é alteração direta de D208 do XML DE comum**.
- Planilha geográfica (11/2025): referência de catálogo, pendente confrontar por códigos e versões com tabelas/sistema reais.

## 2. Matriz normativa do receptor (D3) — síntese preliminar por campo
| ID | Campo | Regra comprovada no material | Impacto sobre cadastro |
|---|---|---|---|
| D201 | iNatRec | 1 Contribuyente, 2 No contribuyente. | Natureza primeiro; não confundir com tipoPessoa. |
| D202 | iTiOpe | B2B/B2C/B2G/B2F; NT010 modifica compatibilidade: para não contribuinte, B2C ou B2F, observar exceções específicas de autofactura no texto. | Contrato API só verifica enum e país; matriz completa UI/API depende contexto DE e nota. |
| D203/D204 | País/código e descrição | País de receptor e descrição codificada. | Distinguir país de residência e endereço fiscal interno; nomes devem ser derivados por referência vigente. |
| D205 | iTiContRec | Tipo de contribuinte é exigido no XML para D201=1 e não informado quando D201=2 no MT150. | **Tipo de pessoa no ERP pode existir** e DB atual exige; não transmitir iTiContRec em DE não contribuinte. |
| D206/D207 | RUC/DV | RUC e DV para contribuinte; DV XML comprimento 1, módulo 11 conforme manual. | API aceita DV texto até 5: divergência de contrato/validação fiscal; algoritmo demanda fontes/vetores e autorização. |
| D208–D210 | Tipo, descrição e número do documento | NT002: para D201=2 e D202≠4 exige D208 e D210; para contribuinte e B2F não informar ambos no DE. NT023 tem alterações/validações novas; analisar prioridade e combinação exata antes de implementação. | O POST exige número para todos os não contribuintes, inclusive B2F: **divergência de modelo cadastral versus payload fiscal**, não implica que documento de estrangeiro jamais possa ser guardado internamente. |
| D208=5 | Innominado | NT010/023 restringem a operação B2C; NT023 proíbe NC/ND/NR com Innominado; NT024 limita valor de DE (>= Gs 7 milhões) com exceção explícita. | Cadastro genérico não deve pretender antecipar todas as regras de uma emissão futura; resolver a política de um cliente Innominado por empresa e validade no contexto DE. |
| D211 | Nome/razão social | Informar nome do receptor conforme norma; innominado exige tratamento específico. | Não usar campos de cadastro como substitutos arbitrários de dado do DE. |
| D213/D218 | Endereço/número | Regras condicionais ao documento e endereço; número exigido se endereço informado, quando aplicável no MT base. | NEX-021 tornou geografia interna opcional, mas emissão futura exigirá completude nos cenários correspondentes. |
| D219/D223 | Departamento/cidade | NT003: obrigatórios quando endereço informado e operação ≠ B2F; em B2F não informar campos PY indicados. | Manter cascata PY; no cadastro distinguir registro incompleto de emissão apta. |

## 3. Diferenças entre SIFEN e modelo Nexit que NÃO devem ser implementadas sem decisão
1. `tipo_persona` e `tipo_contribuyente_sifen` exigidos no banco mesmo para No contribuyente: separar semântica comercial da condição de envio do D205 (não simplesmente apagar campo ou persistir null contra constraint).
2. B2F do exemplo Brasil + Cédula paraguaya: identidade pode ser armazenada internamente; D208/D210 não devem ser enviados no XML DE B2F conforme NT002; decidir opções do cadastro por finalidade comercial e não por pressuposição de envio.
3. Número B2F UI `(opcional)` contra API/NOT NULL: resolver contrato de armazenamento; **não inventar '0' como identificador estrangeiro genérico**.
4. Campos de identificação condicional devem ter fonte única UI/API; mudança de seleção não deve ocultar estado inválido.
5. Divergências DIV-CLI-01..13 continuam; endereço FISCAL e duplicidade, GLN, truncamento silencioso, crédito/moeda, documento link, dias e flags são regras ERP, não decisões automáticas da DNIT.
6. Regras de valor (NT024) e restrições por tipo DE (NT023) pertencem à validação de emissão V2, mas cadastro V1 deve registrar dados compatíveis sem bloquear clientes de modo indevido.

## 4. Matrizes e evidências ainda necessárias para declarar '100%'
**Bloqueios de completude:**
- Obter/verificar a NT 021 ausente e demais publicações posteriores ao conteúdo anexado; verificar a vigência efetiva do conjunto e XSD relevantes.
- Validar tabela de países/departamentos/distritos/cidades do XLSX 2025 contra catálogos/migration NEX-021 e banco real; sem isso não garantir mapeamento geográfico completo.
- Fazer leitura integral e reconciliação temporal de todas as alterações D3 incluindo validações potencialmente contraditórias (especialmente NT023 D208g versus exceção B2F em NT002).
- Construir matriz campo a campo dos seis grupos: coluna BD final, API POST/PUT, aplicabilidade UI, condicionais, fontes normativas, exemplos e rejeições, por cenário.
- Dispor de vetores oficiais para RUC/DV antes de aprovar algoritmo e aceitar assinatura fiscal da regra.
- Testes na VM apenas após aprovação humana; não confundir análise documental com execução.

## 5. Procedimento obrigatório para Claude
**NÃO IMPLEMENTAR COM BASE NESTA AUDITORIA SEM AUTORIZAÇÃO HUMANA.** Após aprovação de tarefa de matriz/especificação, Claude deve consultar os protocolos e registrar confronto detalhado no GitHub e parar. Não modificar código, API, migrations, catálogo geográfico nem processos V2 sem autorização específica. Proibida execução no notebook de testes/build/TypeScript/ESLint/Next.js/Docker/servidores/PG; não acessar VM nem fazer deploy.

**Estado de auditoria:** R03 normativa parcial documentada e incompletudes transparentes. O usuário exige exame integral; não declarar que esse objetivo foi atingido prematuramente.
