# Nexit V1 — Matriz normativa do Cadastro de Clientes × SIFEN v150 (confronto documental)

**Data:** 2026-10-11 · **Estado:** documento de especificação/confronto — **NÃO homologado; nenhuma correção implementada; implementação bloqueada até decisão expressa**.
**Fontes:** Manual Técnico v150 + NT 001–027 (ver `documentacao/referencias/sifen/MANIFESTO-PACOTE-DNIT-NT001-027-MT150.md`), AUD-R02, AUD-R03, `CONFRONTO-CADASTRO-CLIENTES-API-DB-2026-10-11.md`, `app/(private)/clientes/nuevo/page.tsx`, `app/api/clientes/route.ts` (POST), `NEX-005-clientes.sql`, NEX-021.
**Método:** leitura estática; nada foi executado (sem testes, SQL, build, servidores ou VM). A planilha geográfica 11/2025 **não** foi confrontada linha a linha.

Legenda das classes de pendência: **[S]** exigência SIFEN (norma) · **[E]** regra comercial/ERP (não vem da DNIT) · **[T]** inconsistência técnica API/banco/UI · **[D]** decisão pendente do responsável.

## 1. Princípio de separação
O cadastro é **dado mestre** do ERP; o SIFEN regula o **conteúdo do XML do DE** no momento da emissão (V2). Uma exigência do D3 só vira bloqueio de cadastro se o responsável decidir que o cadastro deve já nascer "apto para emitir". Hoje: o cadastro guarda o necessário para montar o D3; as regras de **omissão no XML** (ex.: não enviar D205 para não contribuinte) são da futura montagem do DE, não do cadastro.

## 2. Matriz do grupo "Información fiscal" (receptor D3)
| Campo Nexit (UI/API → coluna) | Campo SIFEN | Regra normativa (fonte) | Estado atual Nexit | Classe | Observação |
|---|---|---|---|---|---|
| Natureza (`naturaleza` → `naturaleza_receptor` 1/2) | D201 iNatRec | 1 contribuyente / 2 no contribuyente, obrigatório (MT) | Alinhado (CHECK 1,2) | — | Autofactura exige contribuyente (val. 45) — emissão |
| Tipo de operación (`tipoOperacion` → `tipo_operacion` 1–4) | D202 iTiOpe | B2B/B2C/B2G/B2F. Não contribuyente ⇒ B2C **ou** B2F (NT010); B2F ⇒ não contribuyente (val. 46); contribuyente com RUC de OEE ⇒ B2G (NT020, D202b) | UI restringe a matriz natureza×operação; API/banco não (DIV-CLI-05); B2G por OEE não verificável no cadastro (exige base de RUC de entidades estatais) | S/T/D | Definir se o cadastro valida a matriz (backend) e se B2G é automático por OEE. B2F reservado a serviços ao exterior (MT) |
| País (`paisCodigo`) | D203/D204 | B2F ⇒ país ≠ PRY; demais ⇒ PRY (val. 48); D204 descrição 4–50 (NT005) | `validarPaisPorOperacion` no backend já aplica PRY/≠PRY | — | Descrição do país deve derivar da tabela vigente, não de texto livre |
| Tipo de persona (`tipoPersona` → `tipo_persona`) + `tipo_contribuyente_sifen` | D205 iTiContRec | Obrigatório se D201=1 (1 PF/2 PJ); **não informar se D201=2** (val. 50/51) | Banco exige ambos NOT NULL para **todos**; CHECK vincula FISICA=1/JURIDICA=2; UI mostra para qualquer natureza | T/D | Semântica de "tipo de pessoa" para não contribuinte é comercial; D205 só se transmite quando D201=1. Separar armazenamento interno × montagem do XML; não ocultar sem solução de contrato |
| RUC (`numeroDocumento` com tipo RUC) | D206 dRucRec | Obrigatório se D201=1; não informar se 2; 3–8 posições numéricas; existência no Marangatu (val. 54–56 — validação do SET, não do ERP) | Texto até 30; sem validação de formato nem de comprimento | S/T | RUC 3–8 dígitos numéricos no XML; hoje o campo aceita até 30 caracteres livres |
| DV (`dv`) | D207 dDVRec | Obrigatório se existe D206; 1 posição; **módulo 11** (val. 58) | `varchar(5)`, texto livre, obrigatório não vazio (DIV-CLI-06) | S/T/D | Algoritmo e vetores oficiais necessários antes de implementar. **Não calcular sem autorização** |
| Tipo de documento (`tipoDocumento` → `tipo_documento`, `tipo_documento_identidad_sifen`) | D208 iTipIDRec / D209 | 1 C.paraguaya, 2 Pasaporte, 3 C.extranjera, 4 Carnet de residencia, 5 Innominado, 6 Tarjeta diplomática, 9 Otro. Obrigatório se D201=2 e D202≠4; não informar se D201=1 ou B2F (NT002/NT023) | Banco exige o código SIFEN para todo não contribuinte (inclusive B2F) e mapeia 1:1 | S/T | Para B2F, o armazenamento interno do documento do estrangeiro é decisão ERP; **no XML do DE B2F D208 não se envia** |
| Descripción Otro (`descripcionDocumento`) | D209 (se D208=9 informar o tipo) | 9–41 posições (MT) | Obrigatório quando OTRO (CHECK) | — | Limite 100 no banco vs 41 no SIFEN [T] |
| Número de documento (`numeroDocumento`) | D210 dNumIDRec | A, 1–20; obrigatório se D201=2 e D202≠4; **não informar se D201=1 ou B2F**; Innominado ⇒ "0" (NT002/023) | `varchar(30)` NOT NULL, API exige sempre (DIV-CLI-01); Innominado grava "0" | S/T/D | Limite 20 no SIFEN × 30 no Nexit. B2F: contradição UI "(opcional)" × API (DIV-CLI-01). **Não inventar "0" para estrangeiros** |
| Innominado | D208=5 | Só em B2C (D208b/f); sem NC/ND/NR (D208e); vedado com total ≥ Gs. 7.000.000 exceto amostras médicas (NT024, D208c); nome "Sin Nombre" | Um por empresa na API, índice permite vários (DIV-CLI-02); não há valor de DE no cadastro | S/E/D | Regras de valor e tipo de DE são de **emissão (V2)**, não de cadastro |
| Razón social (`razonSocial`) | D211 dNomRec | A, **4–255**; obrigatório; Innominado ⇒ "Sin Nombre" | `varchar(200)` NOT NULL (>0); **sem mínimo 4** | S/T | Divergência: nomes de 1–3 caracteres são aceitos no cadastro e rejeitados na emissão |
| Nome fantasia (`nombreFantasia`) | D212 dNomFanRec | A, 4–255, opcional | `varchar(200)` | — | Mínimo 4 também quando preenchido |
| Teléfono / Celular | D214 dTelRec / D215 dCelRec | Tel 6–15; cel 10–20 (com prefixo da cidade se PRY) | `varchar(30)` livre | S/T | Formato/comprimento não validados |
| E-mail (`email`) | D216 dEmailRec | A, 3–80 | `varchar(150)` + regex simples | S/T | Limite 80 no SIFEN × 150 no cadastro |
| Código do cliente (`codigo`, CLI-NNNNNN) | D217 dCodCliente | A, 3–15 | Trigger gera `CLI-NNNNNN` (10 caracteres); coluna `varchar(50)` | — | Compatível com o D217 enquanto o código automático for mantido; código manual >15 não caberia no XML |

## 3. Endereço do receptor
| Campo Nexit | SIFEN | Regra (fonte) | Estado atual | Classe | Observação |
|---|---|---|---|---|---|
| Dirección (`direccion`, 300) | D213 dDirRec | A, 1–255; obrigatório se B2F ou NR (val. 67); opcional nos demais | `varchar(300)` NOT NULL | S/T | 300 > 255 |
| Nro. de casa (`numeroCasa`, 20) | D218 dNumCasRec | N, 1–6; obrigatório se informa D213 (val. 68); Innominado ⇒ 0 | `varchar(20)` livre, nem UI nem API exigem (DIV-CLI-09) | S/T/D | Asterisco da UI sem respaldo em API; SIFEN pede **numérico 1–6**. "s/n" não cabe no XML (usar 0 é decisão) |
| Departamento / Distrito / Ciudad (cascata PRY, NEX-021) | D219–D224 | Se D213 informado e D202≠B2F: departamento (D219) e cidade (D223) **obrigatórios**; B2F: **não informar**; relação D219–D221–D223 deve existir (val. 73); NT017 descrições coerentes. Quando D201=1, o distrito deve corresponder ao declarado no RUC | NEX-021 tornou a geografia **opcional** no cadastro; backend valida cascata quando informada | S/E/D | Diferenciar "cadastro incompleto" de "apto para emitir". Códigos usados vêm de `lib/geografia/referencia.ts`/NEX-021; confronto com a planilha 11/2025 pendente |
| País do endereço (`paisCodigo`) | D203 (do receptor, não do endereço) | O endereço PY exige geografia PY | CHECK `direcciones_cliente_pry_geo_chk` | — | País de residência do receptor ≠ país de cada endereço comercial |
| Tipo FISCAL / `es_fiscal` / entrega padrão / latitud-longitud / código postal / horário / contato | — | Sem equivalente no D3 | Regras do ERP; DIV-CLI-03/04 | E/T | Não vêm da DNIT |

## 4. Campos 100% ERP (sem exigência SIFEN direta)
Comercial e crédito (grupo, condição de pagamento, moeda, lista de preços, limites, desconto, vencimento, dia de cobro, e-mails de faturação/cobrança, flags de documento eletrônico/OC/bloqueio, canal, código externo, GLN), contatos (cargo, departamento, flags de recebimento), entrega e vendas (rota, zona, vendedor, frequência, dias) e documentos. Divergências já documentadas: DIV-CLI-07..13. **[E]** Decisões comerciais, não normativas. `Recibir documento electrónico` é preferência comercial; o envio do DE por e-mail dependerá do D216.

## 5. Contradições/ambiguidades normativas a conciliar (não resolver por suposição)
1. **NT023 × NT002 (B2F):** NT023 reformula D208/D210 mantendo "obrigatório se D201=2 e D202≠4", mas introduz D208g/D210 ("não contribuyente: tipo de documento **deve** ser informado") **sem repetir a exceção B2F**; a NT002 eliminou D208d/D210a (as validações de "não informar" para contribuinte/B2F) mantendo a regra no formato. Interpretação provável: B2F não envia D208/D210, mas o texto das validações não é unívoco. **Confirmar com a DNIT ou testando contra o ambiente de teste do SIFEN (V2)**.
2. **Distrito:** MT (obs. D221) condiciona o distrito a D213, e a NT003 só menciona D219/D223; o relacionamento D219–D221–D223 (val. 73) continua vigente.
3. **NT010:** o texto de D202 mudou a regra de "somente B2C" para "B2C ou B2F" para não contribuinte, exceto autofactura; a redação do PDF é ambígua na extração — conferir no PDF original.
4. **NT021 ausente** do pacote: verificar se altera o receptor.
5. **OEE/B2G (NT020):** exige lista de RUC de organismos estatais, inexistente no ERP.

## 6. Diferenças que NÃO devem ser tratadas como erros
- Cadastro pode guardar documento de identidade de estrangeiro B2F, mesmo que o XML B2F não o transmita.
- Cadastro pode guardar tipo de pessoa de um não contribuinte (dado comercial); D205 é omitido na montagem do DE.
- Geografia opcional no cadastro é decisão V1 (NEX-021); a completude é condição de emissão.
- Regras de valor/tipo de DE (NT023/NT024) pertencem à emissão V2.

## 7. Decisões pendentes (para o responsável)
1. Matriz oficial natureza × operação × país × tipo de documento, e se o backend a impõe (DIV-CLI-05).
2. Semântica do número de documento para B2F (DIV-CLI-01) e para Innominado (DIV-CLI-02).
3. Algoritmo DV módulo 11, vetores de teste e momento da validação (DIV-CLI-06).
4. Limites alinhados ao D3: RUC 3–8 numérico, documento ≤20, razão social ≥4/≤255, e-mail ≤80, telefone 6–15/celular 10–20, nro. casa numérico ≤6 — aplicar no cadastro (bloqueio) ou só na emissão (V2)?
5. Cadastro "apto para emitir" (geografia, endereço, e-mail) como estado distinto de "cadastro completo".
6. Obter a NT 021 e conferir vigência/XSD vigentes na DNIT.

## 8. O que falta para declarar a auditoria normativa "completa"
Conferência página-a-página no PDF original do D3 e das validações; planilha geográfica 11/2025 × NEX-021/banco real; NT 021; vetores oficiais do DV; leitura integral das notas não ligadas ao D3. Até lá este documento é **parcial**, como o AUD-R03.
