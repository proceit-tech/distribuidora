# Implementação — Listas de Precios (revisão) e Catálogos comerciales

**2026-10-12 · Claude Code.** Origem: `AUDITORIA-LISTAS-PRECIO-Y-CATALOGOS-COMERCIALES-2026-10-12.md` e `DECISAO-LISTAS-PRECIO-CAMBIO-MANUAL-2026-10-12.md`. **Não homologado.** NEX-045 versionada e **NÃO aplicada**; nenhum SQL, PostgreSQL real, VM, Docker ou deploy; sem validação em navegador. Aplicar a NEX-045 **antes** de publicar o código (as telas leem `tipos_cambio` e gravam em `canales_venta`/`zonas_comerciales` com os novos grants).

## O que foi feito (por achado)

| Achado | Resultado |
|---|---|
| LP-01 / LP-32 cabeçalho e estilo | Um único título; removidos pill/descrição/card «NUEVA LISTA» e o aviso «Código automático» (a geração `LP-nnn` segue no servidor; o campo Código continua opcional, com placeholder «Automático»). CSS reescrito nas convenções de Productos/Catálogos (labels 12,5 px/600, foco visível, erro por campo, responsivo 375/768/desktop). |
| LP-04 / LP-26 erros por campo | Validação local por campo (`lib/listas-precio/formulario.ts`) e no servidor com **campo** (`ErrorLista`): a tela muda para a aba do erro, marca a aba, abre o detalhe do produto e foca o campo. |
| LP-27 navegação | Confirmação ao sair/cancelar/voltar só se houver mudança efetiva; `beforeunload`. |
| LP-07 Estado × Lista activa | Removido o checkbox «Lista activa». `activo` agora **deriva do estado** (`ACTIVA`) no servidor (o enviado é ignorado). Listas antigas incoerentes ficam coerentes ao salvar. |
| LP-11 vigências | Campo `dd/mm/aaaa` (independe do idioma do navegador) e data inicial em **America/Asuncion** (não UTC). |
| LP-16 / LP-17 margem | Função única `margenBruto` = (preço − custo)/preço × 100; `null` («—») se preço ≤ 0 ou custo ≤ 0 (nunca Infinity nem 0 % falso). Importar já calcula a margem (caso real 180.000/336.000 = 46,43 %). **O servidor recalcula** a margem e ignora o valor enviado. |
| LP-15 custo como preço | Sem preço de referência o preço fica **0** com selo «Sin precio» e confirmação ao salvar; o custo nunca vira preço de venda. |
| LP-06 moeda | Custo/preço de referência (na moeda base) só são copiados se a lista estiver na mesma moeda; senão entram **sem valores**, com aviso. Trocar a moeda com preços carregados exige confirmação (não há conversão). Lista base deve ter a **mesma moeda e tipo** (exigido ao criar ou quando mudam base/moeda/tipo; listas históricas não ficam bloqueadas). |
| LP-18 ajustes | Ajuste a partir do **preço base** (não acumula ao repetir), arredondado à precisão da moeda (PYG 0, demais 2), **sem tocar descontos** (antes somava desconto + preço reduzido), com confirmação (quantos mudam, quantos omitidos por não ter base). Percentual livre além de −10/−5/+5. |
| LP-19 / LP-20 formatos | Preço médio rotulado com moeda e só itens ativos com preço; inputs com `step` e formatos por moeda. O armazenamento continua `numeric(18,4)`. |
| LP-21–23 produtos | «Agregar producto» deixou de inserir «o primeiro produto livre»: busca por código/descrição + seletor; «Importar los N filtrados» com confirmação. Escalões superpostos geram **advertência** (não bloqueio, ver pendências). |
| LP-24 / LP-25 reglas | Referências (cabeçalho e regras) validadas no servidor por empresa e **ativas** (as já existentes na lista inativadas depois são preservadas); erro com campo e número da regra. |
| Catálogos | Zonas/canais chegam completos com `activo`; inativos só aparecem se já estavam selecionados. |

## Catálogos comerciales (`/catalogos-comerciales`, permissão `LISTAS_PRECIO.VER/CREAR/EDITAR`)

Menu único com **Tipos de cambio · Canales de venta · Zonas comerciales** (padrão de Catálogos de Productos: busca, filtros, ordenação, paginação 20, formulário compacto, dirty, erros por campo).

- **Tipos de cambio (manual):** campos visíveis Fecha, Moneda, Cambio (PYG por 1 unidade; moeda do catálogo `monedas`, PYG excluída). Nova tabela `tipos_cambio` por empresa (não existia estrutura cambial). **Imutável**: corrigir = nova versão e a anterior é retirada; anular = retirar; histórico visível («Con versiones anteriores»); uma só vigente por empresa/data/moeda; auditoria de quem carregou/retirou. O motivo da correção é opcional e só aparece ao corrigir. Sem integração externa, sem conversão de preços/custos.
- **Canales de venta / Zonas comerciales:** tabelas existentes (NEX-004) sem colunas novas; código e nome obrigatórios e únicos por empresa (sem diferenciar maiúsculas); inativar com confirmação se houver vínculos (listas/regras), nada se apaga.

## Migration NEX-045 (não aplicada) e reversão

`tipos_cambio` (+ triggers de imutabilidade, índice parcial único), índices únicos de nome/código em canais e zonas (aborta sem alterar se houver duplicados), `nex_aplicar_grants_comercial()` (canais/zonas: SELECT/INSERT/UPDATE sem DELETE; `tipos_cambio`: SELECT/INSERT + UPDATE só de `vigente/retirado_*`) e wrapper `nex_aplicar_grants_runtime` = base + proveedores + fiscal + productos + comercial. Reversão `scripts/reversion-NEX-045.sql`: aborta se houver cotações; restaura o wrapper e a leitura somente de canais/zonas.

## Decisões pendentes (não inventadas)

1. **Precedência/acumulação** quando coincidem cliente, grupo, zona e canal, e a regra de seleção por prioridade/empate (LP-12/25). Não existe motor de preços no código atual (os modos de preço só são armazenados): nada foi implementado.
2. **Descontos:** desconto do item × escalão × regra × «desconto máximo» da lista (LP-14): se se empilham e quem limita. Hoje cada valor é só armazenado.
3. **Modos `AJUSTE_PORCENTAJE` / `MARGEN_SOBRE_COSTO` e lista base:** como o ajuste/margem recalculam os preços da lista derivada (LP-08/09). `ajusteGeneralPct` só é editável no modo Ajuste porcentual.
4. **Conversão de moeda** (custo e preço) e uso de `tipos_cambio` por data: taxa aplicável, ausência de taxa, arredondamento.
5. **Escalões superpostos:** rejeitar no servidor ou apenas avisar (hoje avisa; rejeitar poderia bloquear listas existentes).
6. **Compra × Venda (LP-05):** compatibilidade das regras de cliente/zona/canal com listas de compra.
7. **IVA incluído (LP-13):** nenhum recálculo tributário foi feito.
8. **Histórico de preços (LP-30):** a edição continua substituindo itens/escalões/regras; sem versionamento.
9. Quem pode manter os catálogos comerciais: usado `LISTAS_PRECIO` (nenhuma permissão nova criada).
10. Cotação em datas futuras/limites de valor: sem restrição além de data válida e valor > 0.

## Verificação local

`tsc` e ESLint sem erros nos arquivos tocados (ESLint do repositório: 25 → 23 erros preexistentes de outros módulos; corrigidos os 2 da lista de Listas de precios); 1557 verificações, 0 falhas (93 novas); `next build` compilou. **Sem PostgreSQL, sem navegador, sem armazenamento real.**
