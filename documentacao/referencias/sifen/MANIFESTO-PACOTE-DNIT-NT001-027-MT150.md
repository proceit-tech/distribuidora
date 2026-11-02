# Manifesto — pacote normativo DNIT SIFEN (Manual Técnico v150 + NT 001–027)

**Registrado em:** 2026-10-11 · **Branch:** `feature/NEXIT-2026-001-banco-demo` · **Estado:** arquivo de fonte para auditorias; **não** autoriza implementação nem homologa regras fiscais.

## Origem e integridade
| Item | Valor |
|---|---|
| Origem | Arquivo fornecido pelo responsável (ZIP original, não reconstruído, não descompactado no repositório) |
| Nome | `NT_E_KUATIA_027_MT_V150(3).zip` |
| Caminho no Git | `documentacao/referencias/sifen/NT_E_KUATIA_027_MT_V150(3).zip` |
| Tamanho | 11.836.942 bytes |
| SHA-256 | `affe4379bf529032595c40e6869cb287cc183dcda55e621659f654b0062ca669` (conferido no notebook antes do commit e idêntico ao registrado em `INSTRUCOES-ARQUIVAMENTO-E-AUDITORIA-DNIT-2026-10-11.md`) |
| Versão normativa | Manual Técnico SIFEN **v150** e Notas Técnicas complementares 001–027 (sem a 021) |

Reverificar após qualquer `git pull`/clone com `sha256sum` (ou `Get-FileHash -Algorithm SHA256`) e comparar com o valor acima. Se divergir, não usar o arquivo nem substituí-lo por material da internet.

## Conteúdo (28 entradas)
- `Manual Técnico Versión 150 - 01-2.pdf` (~5,2 MB; grupo D3 do receptor nas págs. 70–73; validações do receptor nas págs. 165–168 do MT original).
- `NT_E_KUATIA_001` … `020` e `022` … `027` (`_MT_V150`; a 014 aparece como `…V150X.pdf` e a 018 como `…V150- Junio.pdf`).
- `CÓDIGO DE REFERENCIA GEOGRAFICA_NOVIEMBRE_2025__.xlsx` (referência de códigos geográficos, nov/2025).
- **A NT 021 não está no pacote.** Isto não prova que a nota não exista nem que não altere o receptor: é lacuna a obter da DNIT.

## Distinções importantes
- **Vigência:** o pacote é um retrato recebido do responsável; **não substitui** conferir as notas vigentes e os XSD na DNIT (`https://www.dnit.gov.py/en/web/e-kuatia/documentacion-tecnica`). As NTs 023 e 024 têm datas de disponibilização posteriores às demais (2024) e prevalecem, no tema que tratam, sobre o texto original do MT.
- **Escopo Nexit:** a emissão eletrônica (DTE) é V2. Para a V1 o pacote serve para o **cadastro do receptor** (grupo D3). Regras de emissão (valor do DE, tipo de documento, eventos) não são validações de cadastro.
- **Texto extraído para análise** com ferramenta de leitura de PDF; as tabelas do MT saem desordenadas na extração. As citações em `MATRIZ-NORMATIVA-CADASTRO-CLIENTES-SIFEN-V150.md` foram reconciliadas com a leitura do PDF extraído, mas a **conferência página-a-página no PDF original continua pendente** para o que está marcado como tal.

## Índice por relevância para o receptor (D3) — resultado da leitura direcionada
| Nota | Assunto relevante ao cadastro de clientes |
|---|---|
| MT v150 | D200–D224 (formato) e validações 45–74 (D201…D224) |
| NT 002 | D208/D210: obrigatório se D201=2 e D202≠4; não informar se D201=1 ou D202=4; inclui eliminação das validações D208d/D210a |
| NT 003 | D219/D223 (departamento/cidade) obrigatórios se informado D213 e D202≠4; eliminação das validações 69/72 |
| NT 005 | D204 descrição do país: 4–50 posições |
| NT 010 | D202: não contribuinte pode ser B2C ou B2F; Innominado só em B2C (D208b); NC/ND sem Innominado (D208e) |
| NT 017 | mensagens de validação D222/D224 (descrição distrito/cidade) |
| NT 020 | D202b: RUC de Organismo/Entidade do Estado ⇒ B2G |
| NT 023 | D208/D210 reformulados; D208e (NC/ND/NR), D208f, D208g, D210, D210b |
| NT 024 | D208c: Innominado vedado com total ≥ Gs. 7.000.000 (exceção amostras médicas) |
| Demais (001, 004, 006–009, 011–016, 018–019, 022, 025–027) | Sem alteração direta dos campos do receptor encontrada na triagem; não equivale a declarar irrelevância para emissão |
| Planilha geográfica | Pendente de confronto com `NEX-021` e catálogos reais |

## Documento adicional — Dígito Verificador (DNIT)
| Item | Valor |
|---|---|
| Arquivo | `documentacao/referencias/sifen/Digito-Verificador-DNIT.pdf` ("Dígito Verificador.pdf") |
| Origem | URL oficial da DNIT registrada em `ESPECIFICACAO-DV-RUC-DNIT-IMPLEMENTACAO-2026-10-11.md`, baixada em 2026-10-11 (HTTP 200, `application/pdf`) |
| Tamanho | 21.199 bytes |
| SHA-256 | `43ab0fe42250d9219e403428888575f89d4a6f4284f35e0e52ee37f70206fca2` |
| Uso | Fonte do algoritmo módulo 11 do DV do RUC (`lib/fiscal/calcular-dv-ruc.ts`; vetores em `VETORES-DV-RUC-DNIT-2026-10-11.md`) |
| Observação | O hash identifica a cópia obtida nessa data; a DNIT pode republicar o arquivo. Reverificar com `sha256sum` após clonar. |
