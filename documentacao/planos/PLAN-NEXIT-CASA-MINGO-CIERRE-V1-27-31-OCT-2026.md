# NEXIT V1 — BACKLOG EXCLUSIVO DE FUNCIONALIDADES / CASA MINGO
**27/10/2026.** O responsável corrigiu expressamente a direção do planejamento: quer lista de FUNCIONALIDADES a desenvolver para fechar V1 em quatro dias, com cliente querendo experimentar em dois dias. O plano anterior de reuniões, homologação, backup, deploy e operação está **SUBSTITUÍDO** por este documento. **Este não é um plano de infraestrutura nem uma autorização de SQL/deploy.**

## 1. Falta código / regra de negócio funcional

| Ordem | Linear | O que precisamos concluir como SOFTWARE | Estado no projeto |
|---|---|---|---|
| P0-01 | PRO-309 + PRO-310 | FE: reserva de estoque ao enviar; SALIDA física e custo somente após APROBADO SIFEN; RECHAZADO/INDETERMINADO sem baixa indevida; impedir duplicações de stock e de emissão. NEX-067 antiga descontava ao criar FE e NÃO é solução aprovada. Fechar apenas decisões P01–P08 necessárias para o código seguro. | Todo; risco fiscal/stock bloqueante |
| P0-02 | PRO-311 + PRO-312 + PRO-61 | FE: correção dos campos legalmente corrigíveis após rejeição final, geração de versão fiscal auditável, CDC/numeração corretos, reenvio idempotente, consulta automática de estados e histórico de tentativas/resultados. Reusar E01/E02 e E03 já versionadas, não refazer o que está correto. | Parcial/Todo |
| P0-03 | PRO-304/305/306/308/293 | MASTER cadastra empresas e cria primeiro administrador; habilita módulos contratados; empresa administra usuários e atribui catálogo FIXO de nove perfis, sem criar outros. Administrador da empresa opera módulos contratados; usuários comuns dependem de perfis e alcance. | Parcial e tarefas Todo/Backlog |
| P0-04 | PRO-307 + PRO-109 | Cadastro e seleção de vendedor comercial na FE/NCE, por identificador e snapshot comercial; NÃO confundir com usuário que emitiu. Depende de usuários/perfis operacionais. | Parcial/Todo |
| P1-01 | PRO-294 | Fecha de emisión escolhida até -30/+5 conforme pedido, MAS fluxo normal atual executa faixa mais estreita por limites SIFEN; implementar comportamento legal e seguro ou reportar limitação efetiva, não afirmar resolvido. | Parcial/Todo |
| P1-02 | PRO-322 + PRO-323 | FE: endereço fiscal PY completo ou vazio (somente códigos geográficos necessários), seleção de entrega e composição editável de dInfAdic com vendedor/entrega; preservar payload fiscal histórico; corrigir somente lacunas comprovadas. | Parcial, In Review/Todo |
| P1-03 | PRO-297 + PRO-108 | Informe de Compras E6-B, **ainda não desenvolvido**: fonte exclusiva Entradas do módulo Compras (PRO-325), totais a custo histórico por fornecedor/produto/depósito/período, sem IVA fiscal; filtros, Excel/PDF e ACL. Não usar mocks. Gate da fonte E6-A permanece. | Todo |

## 2. Já programado e auditado estaticamente — NÃO refazer
- PRO-325: Compras → Entradas: fornecedor inclusive sem código, vários itens, estoque/custos e K1. Auditoria E6-A R02 conforme; NEX-075 não aplicada (isso é assunto de operação, NÃO programação pendente).
- PRO-296: Informe de Ventas FE/NCE, impostos históricos, moeda, vendedores e exportação XLSX/PDF. Auditoria E5-R03 conforme.
- PRO-295 / PRO-79: Movimientos, exibição de quantidade sem decimais redundantes. Auditoria E4 conforme.
- PRO-93: melhorias desktop de Nueva factura / Resumen publicadas; só reabrir mediante defeito comprovado.
- PRO-94/91: NCE V1 / Documentos electrónicos têm componentes implementados, mas não encerram automaticamente correção/reenvio/consulta PRO-311/312.
- PRO-99/100/101/102: reportes de inventário existentes, não duplicar em E6-B.

## 3. Ordem real de desenvolvimento e limites
Priorizar primeiro integridade FE→stock→SIFEN e recuperação/reprocessamento; depois MASTER/administrador/usuários/vendedor; depois data e informações de FE; finalmente Informe de Compras baseado nas Entradas já implementadas, após liberação da fonte. **É uma ordem de dependências de código, não um compromisso de conclusão de todos estes fluxos em 48 horas.** O prazo é agressivo demais para garantir V1 inteira sem evidência do ambiente.

**Fora desta lista:** tarefas exclusivas do provedor KuDE; validação de navegador, SQL, migration aplicada, backup, VM, deploy, reuniões e suporte; importação de 561 produtos e estoque de abertura são atividades de dados, não novo desenvolvimento funcional. Informe gerencial de Ganancia Bruta é opcional e NÃO autorizado.

## 4. Governança
ChatGPT escreve análises/ordens, audita GitHub e atualiza Linear. Claude somente desenvolve UMA ordem autorizada por vez, faz commit/push e PARA. Este backlog substitui a apresentação equivocada de um cronograma operacional e **não emite ordem de desenvolvimento automática** nem permite SQL/VM/tests/deploy.
