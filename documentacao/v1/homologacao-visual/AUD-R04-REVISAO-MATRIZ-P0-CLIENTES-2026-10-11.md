# Nexit V1 — AUD-R04 — revisão independente da matriz P0 de Clientes
**Data:** 2026-10-11. **Commit examinado:** ed3b962. **Estado:** P0 entregue documentalmente, **CORREÇÃO SOLICITADA** para classificação e escopo, antes da aprovação das regras; não homologado.
**Método:** diff do commit e cotejo com protocolos; auditorias R02/R03; matriz normativa SIFEN. Sem execução de código, testes ou acesso VM.

## Achados da revisão
1. **R01 — P0-DEF-01 × D-02:** o rótulo B2F 'opcional' contradiz contrato atual, porém não pode ser alterado para obrigatório em P1 como simples correção visual antes da decisão sobre o contrato. A apresentação provisória deve revelar fielmente a regra vigente, se autorizado; regra de negócio de exigir documento B2F permanece pendente. Impedir que a tarefa visual consolide por acidente uma decisão fiscal/comercial.
2. **R02 — P0-DEF-15 × D-03:** permitir apenas um Innominado por empresa pode ser política comercial legítima; a divergência entre índice permissivo e pré-checagem restritiva é uma inconsistência de intenção, **não prova isolada de defeito**. Reclassificar como DECISÃO, corrigir somente depois de D-03; não presumir vários.
3. **R03 — 'APROVADA' não significa homologada:** várias células marcadas APROVADA correspondem apenas a consonância estática da UI/API/DDL; não houve teste de persistência, PUT, reversão de seleção nem comparação DB real. Rotular 'alinhamento estático' e deixar cenários pendentes de validação.
4. **R04 — 15 defeitos heterogêneos:** distinguir bug reproduzível pelo código (filtro silencioso, FISCAL duplicado, 23505), lacuna de validação (RUC/URL, dia inteiro) e melhorias de UX (perda sem aviso, mensagem por aba, moeda). Não tratar todos como defeitos funcionais comprovados pelo runtime.
5. **R05 — Campo oculto recebeNotificaciones:** padrão true pode ser regra comercial deliberada; não expor nem mudar sem D-12.
6. **R06 — data/PUT e escopo P2:** o progresso aponta edição de filhos não implementada; qualquer alteração PUT ou extensão para edição requer escopo separado. P2 não deve implicitamente adicionar edição de coleções ou alterar outros formulários.
7. **R07 — Normas pendentes:** não aprovar validações fiscais, alteração D205, módulo DV, B2F, OEE ou limites SIFEN enquanto interpretação NT002/023, vetores DV e documentação complementar estiverem pendentes. Fonte 'NT021 ausente' é lacuna de inventário, não prova de vigência.
8. **R08 — Critério de P1:** liberar somente tarefas sem mudança de persistência/validação e com rótulos que não antecipem decisões, após autorização expressa do responsável. Preservar seis seções e código automático; sem testes no notebook/VM/DB/deploy pelo Claude.

## Parecer
**Aprovação documental condicional:** a matriz fornece boa base de decisão e os 13 itens D-01..D-13 estão enumerados. **Não aprovar automaticamente recomendações do Claude**. Antes de P1, apresentar ao responsável para decisão, no mínimo D-01, D-02, D-03, D-07 (asterisco/endereço), D-10 (rótulo da moeda), D-12 (flags ocultas); o restante pode ser isolado para P2. A autorização deve citar explicitamente o subconjunto P1.
**Próximo fluxo:** responsável aprova decisões; Claude atualiza matriz/implementa somente tarefa aprovada, commit+push e para; ChatGPT revisa; responsável build/homologa na VM. Status não homologado.
