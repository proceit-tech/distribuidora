# Nexit V1 — E2: adequação dos campos fiscais do Cadastro de Clientes às regras SIFEN (D3)

**Data:** 2026-10-11 · **Decisão:** `DECISAO-LIMITES-CAMPOS-FISCAIS-SIFEN-CADASTRO-2026-10-11.md` · **Estado:** implementado em UI e API, **não executado nem homologado** (sem testes/build no notebook).
**Implementação:** `lib/fiscal/campos-receptor.ts` (regra única, pura) + `lib/fiscal/calcular-dv-ruc.ts`; usada por "Nuevo cliente", edição, POST, PUT e sincronização de endereços (`lib/clientes/relacionados.ts`). Sem truncamento: `texto(valor, máx)` continua cortando apenas como rede de segurança, mas a validação ocorre antes sobre o valor integral recebido.

## Auditoria campo a campo (UI × POST × PUT × coluna × norma)
| Campo | Norma (MT v150 / NT) | Regra aplicada | Coluna | Situação |
|---|---|---|---|---|
| RUC (D206) | N 3–8, contribuinte | 3–8 dígitos ASCII, sem pontuação | `numero_documento` varchar(30) | Aplicado (E2-DV) |
| DV (D207) | 1 dígito, módulo 11 | calculado e comparado | `dv` varchar(5) | Aplicado (E2-DV) |
| Número de documento (D210) | A 1–20; Innominado = "0" | 1–20 (não contribuinte); sem `maxLength` silencioso na UI | varchar(30) | Aplicado |
| Descrição Otro (D209) | A 9–41 | 9–41 quando tipo = Otro | varchar(100) | Aplicado |
| Razão social (D211) | A 4–255 | 4–**200** (efetivo) | varchar(200) | Aplicado; **máx. 255 depende de migration** (abaixo) |
| Nome fantasia (D212) | A 4–255, opcional | 4–**200** se informado | varchar(200) | Idem |
| E-mail (D216) | A 3–80 | 3–80 + formato existente | varchar(150) | Aplicado (sem reduzir coluna) |
| Telefone (D214) | A 6–15 | 6–15 se informado | varchar(30) | Aplicado |
| Celular (D215) | A 10–20 | 10–20 se informado | varchar(30) | Aplicado |
| Endereço fiscal (D213) | A 1–255 | 1–255 no endereço fiscal (`tipo` FISCAL ou `esFiscal`) | varchar(300) | Aplicado |
| Nro. de casa (D218) | N 1–6, obrigatório se há D213 (val. 68) | no endereço fiscal: obrigatório, 1–6 dígitos | varchar(20) | Aplicado; rótulo "Nro. de casa *" só no fiscal |
| Código do cliente (D217) | A 3–15 | gerado por trigger `CLI-NNNNNN` (10 caracteres) | varchar(50) | Compatível; sem mudança |
| Tipo/número de documento B2F | cadastro obrigatório (DEC-CLI-01) | mantido; XML B2F não inferido | — | Preservado |
| Geografia D219–D223 | obrigatória na emissão se D213 e ≠ B2F | **não exigida** no cadastro (NEX-021 opcional) | — | Decisão anterior preservada; pendente de decisão se virará bloqueio |

Outros pontos: telefone/celular/endereço de **contatos** e endereços não fiscais são dados ERP (sem limites D3). Edição (PUT): campo que **não mudou** em relação ao gravado é tolerado (dados anteriores à regra) até ser alterado; no endereço fiscal vale o mesmo para dirección + número.

## Migration necessária (NÃO criada, NÃO aplicada — pede autorização)
Para comportar os máximos oficiais de 255 caracteres em `clientes.razon_social` e `clientes.nombre_fantasia` (hoje `varchar(200)`), seria necessária uma migration incremental nova (NEX-022), sem editar a NEX-005: ampliar ambas as colunas para `varchar(255)` (operação não destrutiva, só amplia o tipo). Depois dela, `LIMITES_RECEPTOR.razonSocial.max` e `nombreFantasia.max` passam de 200 para 255. Enquanto não for autorizada, o sistema rejeita (com mensagem clara) nomes de 201–255 caracteres, em vez de truncar.

## Ambiguidades preservadas (não resolvidas por suposição)
NT002 × NT023 sobre D208/D210 em B2F no XML; geografia obrigatória no D3 vs. NEX-021; formato de telefone (prefixo da cidade se PRY) — só comprimentos foram aplicados; NT 021 ausente.
