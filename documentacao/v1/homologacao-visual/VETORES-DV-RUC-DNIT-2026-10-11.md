# Nexit V1 — Vetores de verificação do DV do RUC (módulo 11, DNIT)

**Data:** 2026-10-11 · **Implementação:** `lib/fiscal/calcular-dv-ruc.ts` (compartilhada por formulário de criação, formulário de edição e API POST/PUT de Clientes).
**Fonte normativa:** DNIT, "Dígito Verificador.pdf" (URL registrada em `ESPECIFICACAO-DV-RUC-DNIT-IMPLEMENTACAO-2026-10-11.md`). O PDF **não** foi arquivado como binário no repositório (não foi entregue ao clone; nenhum hash é inventado).
**Estado:** vetores **calculados à mão** pelo procedimento oficial e conferidos por um segundo método independente (abaixo). **Nenhum teste automatizado foi executado** (determinação do responsável). Não são RUC reais nem foram consultados no Marangatu; o DV só prova coerência aritmética, não existência do contribuinte.

## Procedimento
Da direita para a esquerda, multiplicar cada dígito por 2, 3, …, 11 (reinicia em 2 após 11) e somar. `resto = soma % 11`. **DV = 0 se resto ∈ {0,1}; senão 11 − resto.** Com 3 a 8 dígitos os fatores usados vão de 2 a 9 (o reinício em 2 após 11 só atuaria com ≥10 dígitos, fora do formato do RUC fiscal, mantido por fidelidade à função oficial).

**Segundo método (independente):** da esquerda para a direita, o dígito da posição *j* (0 = primeiro) de um RUC de *n* dígitos pesa *n + 1 − j*; somar e aplicar a mesma regra do resto. Equivale ao primeiro, mas não usa a iteração reversa nem o contador de fatores.

## Vetores (RUC sem DV → soma → resto → DV)
| # | RUC | Soma (método 1) | Soma (método 2) | Resto | DV | Cobre |
|---|---|---|---|---|---|---|
| 1 | `80000005` | 5·2 + 8·9 = 82 | 8·9 + 5·2 = 82 | 5 | **6** | 8 dígitos, zeros internos |
| 2 | `800` | 8·4 = 32 | 8·4 = 32 | 10 | **1** | 3 dígitos; resto 10 → 1 |
| 3 | `123` | 3·2 + 2·3 + 1·4 = 16 | 1·4 + 2·3 + 3·2 = 16 | 5 | **6** | 3 dígitos |
| 4 | `001` | 1·2 = 2 | 1·2 = 2 | 2 | **9** | zeros à esquerda; resto 2 → 9 |
| 5 | `031` | 1·2 + 3·3 = 11 | 3·3 + 1·2 = 11 | **0** | **0** | resto 0 → DV 0 |
| 6 | `300` | 3·4 = 12 | 3·4 = 12 | **1** | **0** | resto 1 → DV 0 |
| 7 | `12345678` | 16+21+24+25+24+21+16+9 = 156 | 9+16+21+24+25+24+21+16 = 156 | 2 | **9** | 8 dígitos, todos os fatores 2–9 |
| 8 | `1000` | 1·5 = 5 | 1·5 = 5 | 5 | **6** | 4 dígitos |
| 9 | `00000000` | 0 | 0 | 0 | **0** | só zeros (aritmeticamente válido; sem valor cadastral) |
| 10 | `99999999` | 9·(2+…+9) = 396 | 9·(9+…+2) = 396 | 0 | **0** | soma múltipla de 11 |
| 11 | `103` | 3·2 + 0 + 1·4 = 10 | 1·4 + 0 + 3·2 = 10 | 10 | **1** | resto 10 → 1 |
| 12 | `010` | 3 | 3 | 3 | **8** | resto 3 → 8 |

## Entradas que devem ser rejeitadas (formato, sem truncamento silencioso)
`""` (vazio), `12` (<3), `123456789` (>8; inclui RUC com o DV colado, p. ex. `800000056`), `12A45` (letra), `1.234` e `123-4` (pontuação/separador), ` 123 ` (espaços, no servidor), `١٢٣` (dígitos não ASCII). Mensagem: "El RUC debe tener entre 3 y 8 dígitos numéricos, sin letras, puntos ni guion."

## Comportamento no sistema
- **Formulário (criação e edição):** o DV é recalculado a cada mudança do RUC, é somente leitura e fica vazio se o RUC estiver vazio/inválido. Não é calculado para No contribuyente (inclui B2F); nesse caso não se envia DV.
- **API (POST e PUT):** para contribuinte exige RUC de 3–8 dígitos e `dv` idêntico ao cálculo compartilhado, mesmo sem UI. No PUT, um cliente já gravado cujo RUC/DV **não mudaram** continua podendo ser editado (dados legados são tolerados até que o RUC ou o DV sejam alterados).
- Não há consulta ao Marangatu: um DV correto não prova que o RUC exista.
