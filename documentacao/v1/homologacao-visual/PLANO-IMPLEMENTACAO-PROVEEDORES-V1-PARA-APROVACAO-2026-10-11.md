# Proveedores Nexit V1 — Plano de implementação para autorização do responsável

**Data:** 2026-10-11. **Status: PARA APROVAÇÃO — NÃO AUTORIZADO.**

## Documentos oficiais a ler antes de qualquer trabalho autorizado
1. `CLAUDE.md` e `documentacao/PROTOCOLO-IA.md` vigentes da branch.
2. `documentacao/v1/homologacao-visual/MATRIZ-NORMATIVA-CAMPO-A-CAMPO-PROVEEDORES-V1-2026-10-11.md`: matriz de 94 itens e adenda **DEC-PRV-01 a 10**.
3. `documentacao/v1/homologacao-visual/MATRIZ-PROVEEDORES-UI-API-DB-ERP-2026-10-11.md`: diagnóstico visual/técnico; em conflito, prevalece a adenda aprovada.
4. NEX-006 e **todas as migrations posteriores relacionadas**, dicionários reais, `types/proveedores.ts`, `lib/proveedores/shared.ts`, `app/(private)/proveedores/**`, `app/api/proveedores/**` e módulos reutilizáveis de Clientes.

## Sequência de execução PROPOSTA, condicionada a autorização futura explícita

| Fase | Escopo técnico preciso | Entregável verificável / saída para auditoria |
|---|---|---|
| 0. Reconciliação DDL | Levantar alterações posteriores à NEX-006; identificar constraints, índice unicidade, FK, trigger, funções, grants e dados legados afetados. | Mapa UI→TS→API→DDL final campo por campo, riscos, ordem de migrations versionadas. |
| 1. Identidade + UX base | Criar/editar/listar no padrão visual Clientes, código PRV, RUC/DV módulo 11, estrangeiros por país, 255 chars se aprovado no pacote técnico, datas, telefone, campos obrigatórios/erros, rótulos e filtros adequados. | 8 abas sem duplicidade de títulos; testes frontend/servidor e casos de limites. |
| 2. Integridade das relações | Eliminar `DELETE ALL + INSERT`, implementar atualizações diferenciais por ID e empresa, validações e transações, controle de concorrência, cadastro contatos/endereços/contas/retenciones. | Identidade preservada em editar; remoção explícita auditável; testes de zero alteração e repetição. |
| 3. Comercial + precisão | Decimais textuais exatos, moeda e mínimo, flags comerciais, regras de data/prazo, catálogo/empresa. Preparar contratos para Compras/Pagamentos sem ativar módulos fora do escopo. | GET→form→PUT sem perda de precisão; erros coerentes; mapeamento das regras DEC-PRV-09. |
| 4. Homologação, bloqueio e risco | Fluxos de autorização separados do PUT geral; avaliação manual, justificativas, datas, eventos imutáveis, estado efetivo de homologação. | DEC-PRV-01/02/03/06/10 verificáveis via servidor, com ações proibidas 403, sem usar SIFEN receptor. |
| 5. Bancos | Histórico de versões de conta, aprovação antes de elegibilidade em pagamento, principal por moeda, SWIFT/IBAN, visibilidade/perm. | DEC-PRV-04/07, mudanças não sobrescrevem dados aprovados; auditoria e testes. |
| 6. Retenciones + arquivos | Política documental privada já aprovada, metadados, versões, recuperação, exclusão lógica, certificados vinculados às regras de retenção e vigência; não usar URLs públicas como substitutos. | DEC-PRV-08, upload/download autorizados; arquivos nunca eliminados fisicamente após registrar versão. |
| 7. Qualidade e revisão | Confrontar novamente os 94 campos + 10 decisões; executar somente build/types/lint/casos possíveis no ambiente de Claude; preparar notas operacionais/rollback seguro; atualizar progressos. | Commits SHA, arquivos, testes realmente executados, resultados e bloqueios; parar para auditoria ChatGPT. |
| 8. Implantação e aceite | **Somente quando houver nova autorização humana específica**: backup, inspeção/migration de banco real, volume, deploy, testes visuais e operacionais por proprietário. | Homologação formal assinada/aceita pelo responsável; não concluir automaticamente no Git. |

## Critérios de aceite do código (antes de deploy)
- Cada um dos **94 itens** possui entrada/saída corretas e limite validado no backend, com mapeamento a coluna SQL final ou migration incremental planejada.
- Todos os dez DEC-PRV têm cenário de sucesso, falha e permissão não autorizada.
- `PROVEEDORES.CREAR/VER/EDITAR` respeitados; novas ações de autoridade não são delegadas implicitamente a `EDITAR`. Tenant segregado em leitura/escrita e arquivos.
- Nenhum PUT causa deleção/reinserção destrutiva dos filhos; nenhuma alteração bancária substitui silenciosamente dados aprovados.
- Documentos com proteção por empresa/proveedor, 10 MiB e formatos aprovados, versão/soft delete e auditoria.
- Nenhuma regra de aptidão SIFEN de receptor aplicada a fornecedor; reuso somente de função tecnicamente idêntica (ex.: DV).
- Nenhuma alegação de `homologado`, migration aplicada, banco validado ou VM implantada sem evidência humana.

## Restrições deste documento
Este plano **NÃO É COMANDO PARA CLAUDE** nem autorização para mudanças de aplicação, migrations, banco, Docker ou VM. O responsável decidirá posteriormente pela implementação. Se autorizar, entregar comando com escopo, arquivos, critérios e bloqueios com base na versão final do GitHub, sem delegar decisões empresariais ao executor.
