# Nexit V1 — Etapa P0: matriz definitiva de comportamento condicional do Cadastro de Clientes

**Data:** 2026-10-11 · **Estado:** P0 — consolidação documental para decisão do responsável. **Nada implementado** (sem código, API, migrations nem validações fiscais). **Nada executado** no notebook; análise estática.
**Fontes:** `PLANO-CORRECOES-CADASTRO-CLIENTES-V1-2026-10-11.md`, `MATRIZ-NORMATIVA-CADASTRO-CLIENTES-SIFEN-V150.md`, AUD-R02, AUD-R03, `CONFRONTO-CADASTRO-CLIENTES-API-DB-2026-10-11.md`, pacote DNIT versionado (Manual v150 + NTs), e leitura do estado atual de `clientes/nuevo/page.tsx` (48043db+), `app/api/clientes/route.ts` (POST) e `NEX-005`/`NEX-021`.

## 0. Como ler (classificação de cada linha)
- **APROVADA** — UI, API e banco já concordam e a norma/plano não contesta. Só precisa ser preservada.
- **DEFEITO** — falha comprovada no código/esquema, independente de decisão comercial. Corrigível em P1/P2 sem novas regras de negócio (a correção de contrato continua exigindo autorização da etapa).
- **DECISÃO** — depende de resposta do responsável (negócio, fiscal ou normativa); não implementar antes.
- **NORMA** — vem da DNIT; aplica-se à emissão (V2) salvo decisão em contrário. Cadastro mestre não adota cegamente.

### Correções à matriz normativa anterior (leitura mais precisa do código atual)
1. O campo **RUC da UI já filtra para dígitos e limita a 8** (`maxLength 8`, `replace(/\D/g,"")`); a API não repete essa regra (aceita até 30 caracteres). Lacuna é **UI×API**, não ausência total de validação.
2. O **Número de documento** do não contribuyente tem `maxLength 20` na UI (coincide com D210), enquanto API/banco aceitam 30. Lacuna **UI×API/DB**.
3. A UI **já exclui Innominado quando B2F** (alinha com NT010 D208b) e só oferece B2B/B2C/B2G a contribuyente e B2C/B2F a não contribuyente (alinha com NT010).

## 1. Cenários da seção "Información fiscal" — comportamento atual × esperado

Estado atual da UI (resumo verificado no código): ao trocar **Natureza**, o formulário zera operação (B2B ou B2C), país (PRY), tipo de documento (RUC ou Cédula paraguaya), descrição, número e DV. Ao trocar **Operação**, B2F esvazia o país (obriga escolher) e demais operações forçam PRY; com B2F e Innominado selecionado passa a Pasaporte e limpa o número. O **país só é editável em B2F**. **Tipo de persona** aparece sempre (padrão Persona jurídica). Contribuyente mostra RUC* + DV*; não contribuyente mostra Tipo de documento* + Número ("(opcional)" se B2F, senão "*") + Descripción* se "Otro". Innominado trava o número em "0".

| # | Cenário | Campos visíveis e obrigatórios na UI hoje | API/DB hoje | Situação | Esperado / pendência |
|---|---|---|---|---|---|
| C1 | Contribuyente PF/PJ, B2B/B2C/B2G, PRY | Natureza, Operación, País (travado PRY), Tipo de persona, RUC*, DV*, Razón social* | API: exige RUC e DV não vazios; DB: `tipo_documento='RUC'`, DV não vazio, sem código SIFEN de documento | **APROVADA** (estrutura) / **DECISÃO** (DV: formato, algoritmo) | Preservar. DV = D207 módulo 11 (NORMA) → depende de vetores oficiais (D-06) |
| C2 | Contribuyente: RUC de entidade estatal | Nada específico | Sem detecção | **NORMA/DECISÃO** | NT020 exige B2G; ERP não tem base de OEE. Não inferir por nome (D-09) |
| C3 | Não contribuyente PRY, B2C, documento 1/2/3/4/6/9 | Tipo de documento*, Número*, (Descripción* se Otro), Tipo de persona (visível) | API: exige tipo válido, número, descrição se Otro; DB: tipo SIFEN coerente com o tipo, `dv` nulo | **APROVADA** (estrutura) | Preservar. **Tipo de persona**: ver D-01 |
| C4 | Não contribuyente PRY, B2C, **Innominado** | Número travado em "0" | API: igual a C3; **DB**: índice único exclui INNOMINADO; **API**: pré-checagem de duplicidade não exclui | **DEFEITO** (DIV-CLI-02: só um) + **DECISÃO** | D-03: um ou vários |
| C5 | Não contribuyente **B2F**, país ≠ PRY | País obrigatório (lista sem PRY), Documento*, Número **"(opcional)"** | API/DB: número **obrigatório**; país ≠ PRY validado | **DEFEITO** (rótulo contradiz API: DIV-CLI-01) + **DECISÃO** | D-02: ou rótulo obrigatório, ou valor interno acordado. NORMA: D208/D210 não vão no XML B2F |
| C6 | Troca de **Natureza** | Zera operação, país, documento, descripción, número e DV (sem aviso) | — | **DEFEITO UX** (perda silenciosa de dados digitados) | P1: confirmar/avisar antes de limpar ou preservar quando possível |
| C7 | Troca B2F → outra operação | País volta a PRY; número/documento ficam | — | **APROVADA** | Preservar; documentar |
| C8 | Combinação natureza × operação | UI restringe (C1/C3/C5) | API aceita qualquer natureza×operação desde que o país bata PRY/≠PRY (DIV-CLI-05); B2F↔não contribuyente não é verificado no backend | **DEFEITO** (backend não repete a regra da UI; NORMA val. 46) | P2: validar no POST a matriz que o responsável aprovar (D-04) |
| C9 | Tipo de persona para **não contribuyente** | Visível, obrigatório, padrão "jurídica" | DB `tipo_persona` e `tipo_contribuyente_sifen` **NOT NULL** para todos; CHECK acopla FISICA=1/JURIDICA=2 | **DECISÃO** (D-01) | NORMA: D205 não é informado se D201=2 (isso é montagem do XML). Opções em D-01 |

## 2. Matriz de campos por aba (condicionais, asteriscos, limites)
Notação: UI = o que o formulário faz; API = POST; DB = esquema (NEX-005/021). "—" = sem regra.

### 2.1 Información fiscal
| Campo | Visível/obrig. hoje (UI) | API | DB | Classe |
|---|---|---|---|---|
| Natureza | Sempre; * | enum | CHECK 1,2 | APROVADA |
| Tipo de operación | Sempre; * (lista depende da natureza) | enum | CHECK 1–4 | APROVADA (UI) / DEFEITO backend (C8) |
| País | Travado PRY exceto B2F | `validarPaisPorOperacion` | FK/ref | APROVADA |
| Tipo de persona | Sempre; * | exige JURIDICA/FISICA | NOT NULL + CHECK acoplado | DECISÃO (D-01) |
| RUC | Só contribuyente; * ; dígitos ≤8 | texto ≤30, não vazio | texto ≤30 | DEFEITO leve (UI×API: 8 dígitos só na UI) + NORMA 3–8 |
| DV | Só contribuyente; *; texto livre | texto ≤5, não vazio | ≤5, não vazio | DECISÃO (D-06) |
| Tipo de documento | Só não contribuyente; * | enum | CHECK + código SIFEN | APROVADA |
| Número de documento | Só não contribuyente; * (opcional em B2F); ≤20 | ≤30, obrigatório | ≤30 NOT NULL | DEFEITO (C5) + DEFEITO leve (20×30) |
| Descripción (Otro) | Só se OTRO; * | exige se OTRO | CHECK; ≤100 | APROVADA (NORMA: D209 9–41 → D-07) |
| Razón social | Sempre; * | não vazio, trunca 200 | ≤200, NOT NULL | DEFEITO leve (truncamento silencioso DIV-CLI-08) + NORMA 4–255 (D-07) |
| Nome fantasia | Opcional | — | ≤200 | NORMA 4–255 se preenchido (D-07) |
| E-mail, copia, teléfono, celular | Opcionais | e-mail ≤150, trunca | regex e-mail; tel ≤30 | NORMA: e-mail ≤80, tel 6–15, cel 10–20 (D-07) |

### 2.2 Comercial y crédito
| Campo | UI | API | DB | Classe |
|---|---|---|---|---|
| Grupo, Condición de pago, Lista de precios, Canal | Opcionais | referência por empresa (exceto condição e moeda — DIV-CLI-13) | FK | APROVADA / DEFEITO leve (DIV-CLI-13) |
| Moneda predeterminada | Padrão PYG | sem validação de lista | FK | DECISÃO (D-10) |
| Límite de crédito / temporal "(Gs.)" | Rótulo fixo "Gs." | número ≥0 | numeric(18,4) ≥0 | **DEFEITO** UX (rótulo Gs. com moeda ≠ PYG) + DECISÃO (semântica do 0, D-10) |
| Vencimiento del crédito | Texto `dd/mm/yyyy` | formato e data válida; exige limite temporal | `date` + CHECK | APROVADA; melhoria UX (campo de data) |
| Día de cobro | number 1–31 | aceita decimal (DIV-CLI-11) | smallint 1–31 | **DEFEITO** (decimais; exigir inteiro) |
| Descuento % | 0–100 | — | numeric(5,2) 0–100 | APROVADA |
| Bloquear ventas + Motivo | Check; motivo | motivo obrigatório se bloqueado | CHECK | APROVADA |
| Requiere OC / Recibe DE | Checks | — | boolean | DECISÃO (D-11: efeito real não confirmado; não anunciar funcionalidade) |
| Código externo / GLN | Opcionais | GLN corta em 13 | `varchar(13)` | **DEFEITO** (truncamento DIV-CLI-07/08) + DECISÃO (D-08) |

### 2.3 Contactos
| Campo/regra | UI | API | DB | Classe |
|---|---|---|---|---|
| Nombre* (por contato) | Sem validação de obrigatório antes do envio; contato filtrado se nome/e-mail/telefone/celular vazios | exige nome ≤100 | NOT NULL | **DEFEITO** (DIV-CLI-12: descarte silencioso de parciais) |
| Principal | Exclusividade na UI | índice único (um principal) | índice | APROVADA; mensagem de erro **DEFEITO** (DIV-CLI-04) |
| recibePedidos/Facturación/Cobranzas/Documentos | Checks | persistidos | boolean | APROVADA |
| recibeNotificaciones | Existe no estado e na API (padrão true), **sem controle visível** | persistido | boolean | **DEFEITO UX** (campo oculto com valor ativo) / DECISÃO (expor ou remover) (D-12) |
| Edição posterior | Não existe no detalhe | — | — | **Limitação conhecida** (PROGRESSO): não declarar manutenção completa |

### 2.4 Direcciones
| Campo/regra | UI | API | DB | Classe |
|---|---|---|---|---|
| Dirección* | Item sem texto é descartado | exige texto ≤300 | NOT NULL | **DEFEITO** (DIV-CLI-12) |
| Nro. de casa | "*" quando fiscal | **não exige** | livre ≤20 | **DEFEITO** (DIV-CLI-09: asterisco sem regra) / DECISÃO (D-07: SIFEN numérico 1–6) |
| Tipo FISCAL × `esFiscal` | Trocar tipo para FISCAL desmarca os outros `esFiscal`, mas mantém o `tipo` antigo FISCAL | força `es_fiscal=true` se tipo FISCAL | índice único de fiscal | **DEFEITO** (DIV-CLI-03): 2 endereços FISCAL → erro 23505 |
| Entrega padrão | Exclusividade na UI | índice único | índice | APROVADA; mensagem **DEFEITO** (DIV-CLI-04) |
| País/Departamento/Distrito/Ciudad | Cascata PRY; opcional (NEX-021) | valida cascata se informada | CHECK `pry_geo` | APROVADA; completude fiscal = DECISÃO (D-05) |
| Latitud/Longitud | No estado, sem campo na UI | opcionais | numeric | DECISÃO (D-12) |

### 2.5 Entrega y ventas
| Campo | UI | API | DB | Classe |
|---|---|---|---|---|
| Ruta/Zona/Vendedor | Opcionais, catálogos da empresa | valida referência por empresa | FK | APROVADA |
| Frecuencia + 7 dias | Livres | frequência em enum; dias 1–7 | CHECK | APROVADA; coerência dias×frequência = DECISÃO (D-13) |

### 2.6 Documentos
| Campo/regra | UI | API | DB | Classe |
|---|---|---|---|---|
| Nome + URL | Item sem nome/URL é descartado | exige nome ≤255, URL, tipo válido | NOT NULL | **DEFEITO** (DIV-CLI-12) |
| URL | Texto livre | Sem validação de esquema | text | **DEFEITO** (aceita `javascript:` etc.; validar http/https) |
| Datas emissão/vencimento | Texto livre | datas coerentes | CHECK venc. ≥ emissão | APROVADA no DB; UX de data (P1) |
| Modelo | Link externo, não upload | — | — | **Limitação**: informar na UI (P1) |

### 2.7 Transversais
| Item | Situação |
|---|---|
| Erro de envio | Mensagem única no topo; não indica aba/campo → **DEFEITO UX** (P1); rascunho não se perde no front (o estado permanece) |
| Asteriscos | Têm origem apenas na UI; `aria-required` semântico. A matriz acima define a fonte única futura |
| `CLI-NNNNNN` | **APROVADA**: trigger no banco; formulário não envia |
| Isolamento por `empresa_id` | **APROVADA**: sempre da sessão |
| Campos ocultos (`tipo_contribuyente_sifen`, `es_fiscal`, auditoria) | Derivados/servidor; não editáveis |

## 3. Defeitos comprovados (independentes de decisão) — candidatos a P1/P2
| ID | Defeito | Etapa sugerida |
|---|---|---|
| P0-DEF-01 | Rótulo "(opcional)" no documento B2F contradiz API/DB (DIV-CLI-01) — correção do **rótulo** é P1; mudar a regra é decisão D-02 | P1 (rótulo) |
| P0-DEF-02 | Troca de Natureza apaga documento, número e DV sem aviso | P1 |
| P0-DEF-03 | Erro de envio sem indicar aba/campo | P1 |
| P0-DEF-04 | Itens parciais (contato, endereço, documento) descartados em silêncio (DIV-CLI-12) | P1 (aviso) / P2 |
| P0-DEF-05 | Asterisco de "Nro. de casa" sem regra de API (DIV-CLI-09) | P1 (remover ou alinhar conforme D-07) |
| P0-DEF-06 | Rótulos "(Gs.)" fixos com moeda ≠ PYG | P1 |
| P0-DEF-07 | `recibeNotificaciones` ativo e invisível | P1 (expor) / decisão D-12 |
| P0-DEF-08 | Mensagem única para qualquer violação de unicidade (DIV-CLI-04) | P2 |
| P0-DEF-09 | Dois endereços FISCAL: tipo e flag divergem → erro enganoso (DIV-CLI-03) | P2 |
| P0-DEF-10 | Backend não repete a matriz natureza×operação (DIV-CLI-05) | P2 (matriz aprovada) |
| P0-DEF-11 | Dia de cobro aceita decimais (DIV-CLI-11) | P2 |
| P0-DEF-12 | Truncamento silencioso de textos/GLN (DIV-CLI-07/08) | P2 |
| P0-DEF-13 | URL de documento sem validação de esquema | P2 |
| P0-DEF-14 | RUC 8 dígitos e documento 20 só na UI, API 30 | P2 |
| P0-DEF-15 | DIV-CLI-02: um só Innominado por empresa na API | P2, após D-03 |

## 4. Decisões pendentes (com recomendação de Claude; **não vinculante**)
| ID | Pergunta | Opções | Recomendação |
|---|---|---|---|
| D-01 | Tipo de persona para **não contribuyente** | (a) manter visível e obrigatório, como dado comercial; (b) ocultar com padrão fixo (ex.: FISICA) sem mostrar; (c) tornar a coluna opcional (exige migration) | (a) em V1 (sem DB nem dado inventado); registrar que o XML omite D205 quando D201=2 |
| D-02 | Número de documento no **B2F** | (a) obrigatório (rótulo corrige); (b) opcional de fato com valor interno acordado; (c) opcional com coluna nula (migration) | (a): hoje é o que a API/DB fazem; evita valor inventado. XML B2F não envia D208/D210 — decisão de montagem V2 |
| D-03 | **Innominado**: quantos por empresa | (a) um (consumidor final único; manter API); (b) vários | (a): coerente com "Sin Nombre/0" e com a API atual; ajustar só a mensagem |
| D-04 | **Matriz natureza × operação** no backend | (a) impor a matriz da UI (contribuyente: B2B/B2C/B2G; não: B2C/B2F) e B2F ⇒ não contribuyente; (b) manter só UI | (a) |
| D-05 | Geografia/endereço: **cadastro completo × apto para emitir** | (a) V1 só registra; sem novo status; (b) indicador informativo não bloqueante | (a) agora; (b) possível em V2 |
| D-06 | **DV** módulo 11 | autorizar algoritmo + vetores oficiais; calcular ou apenas validar | Esperar vetores; validar (não substituir) o digitado |
| D-07 | **Limites SIFEN no cadastro** (razão social ≥4, e-mail ≤80, tel 6–15, cel 10–20, nro. casa 1–6 numérico, documento ≤20) | (a) bloquear no cadastro; (b) só avisar; (c) só na emissão | (c) por ora, exceto alinhar UI=API para documento ≤20 e RUC 8 dígitos; revisar quando V2 |
| D-08 | **GLN** | validar 13 dígitos (+ GS1) ou só armazenar | Exigir 13 dígitos numéricos sem truncar; GS1 depois |
| D-09 | **B2G por OEE** | sem fonte de RUC estatal | Não inferir; manter escolha manual |
| D-10 | **Moeda × limites × lista** | rótulo dinâmico; compatibilidade lista×moeda; significado de limite 0 | Rótulo dinâmico (P1); validação de lista×moeda só com regra comercial |
| D-11 | **Requiere OC / Recibe DE / Bloquear** | confirmar efeitos reais nas vendas | Manter como dados; não anunciar efeito |
| D-12 | **recibeNotificaciones** e **lat/long** | expor, ou fixar padrão e remover da API | Expor `recibeNotificaciones`; lat/long fora da V1 |
| D-13 | Dias × frequência de entrega | impor ou apenas orientar | Orientar (P1), sem limpar marcações |

## 5. O que já está aprovado e deve ser preservado
Código `CLI-NNNNNN` automático; seis conjuntos de dados e todos os campos; isolamento por empresa; exclusividades de contato principal/fiscal/entrega padrão **na UI**; cascata geográfica PRY opcional (NEX-021, sem Barrio); restrição de Innominado a B2C; lista de operações por natureza; país PRY travado salvo B2F; ordem proposta Natureza → Tipo de persona → Operación → País (P1, a confirmar).

## 6. Fora do P0 (aguarda autorização de etapa)
P1 (UX/rótulos/ordem/avisos), P2 (POST/PUT, mensagens por constraint, matriz no backend), P3 (qualquer migration), P4 (homologação VM). Dependências normativas pendentes: NT 021, conferência D3 página a página, planilha geográfica 11/2025 × NEX-021, vetores DV, ambiguidade NT002×NT023 em B2F.

**Próximo passo sugerido:** o responsável responde D-01…D-13 (ou aprova as recomendações) e autoriza P1 isoladamente; ChatGPT audita este P0 antes.
