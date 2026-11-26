# Nexit V1 — Tarefa de preservação do pacote normativo DNIT SIFEN

**Estado:** instrução de entrega de documentação e fonte. Nenhuma autorização de modificação da aplicação, migrations ou banco.
**Branch:** `feature/NEXIT-2026-001-banco-demo`
**Papel:** Claude Code executa no clone local autorizado, faz commit/push e para; ChatGPT revisa; responsável homologa.

## Fonte binária original
- Nome recebido: `NT_E_KUATIA_027_MT_V150(3).zip`
- Caminho definitivo no Git: `documentacao/referencias/sifen/NT_E_KUATIA_027_MT_V150(3).zip`
- Tamanho: ~12 MB. SHA-256 completo **obrigatório após copiar**: `affe4379bf529032595c40e6869cb287cc183dcda55e621659f654b0062ca669`
- Conteúdo: 27 PDFs (Manual v150 + NT 001–020 e 022–027), 1 planilha de códigos geográficos de novembro/2025; a NT 021 não está incluída.
- Este ZIP **NÃO foi enviado ao GitHub pelo ChatGPT**: a conexão atual não transfere os bytes do anexo. O responsável precisa disponibilizar o arquivo original no notebook/clone para Claude, preferencialmente sem descompactar nem modificar o ZIP; Claude NÃO deve reconstruir um ZIP a partir de outros arquivos.
- Ao concluir o commit, confirmar download/leitura Git e comparar checksum do arquivo no repositório (não basta texto afirmando sucesso). Se checksum não coincidir, interromper, não substituir por material da internet.

## Tarefa autorizável: arquivamento (não implementação)
1. Sincronizar a branch, seguindo `CLAUDE.md` e `documentacao/PROTOCOLO-IA.md`. Verificar status antes de mudar qualquer coisa.
2. Localizar o arquivo **original** fornecido pelo responsável. Se ele não estiver acessível, informar bloqueio real. Não fazer download substituto ou inventar fonte.
3. Copiar o ZIP original para o destino acima preservando bytes; verificar SHA-256. Se o Git ignorar o ZIP, justificar e adicionar explicitamente, sem alterar regras globais de ignore sem necessidade.
4. Commit + push do ZIP na branch oficial e confirmar SHA remoto. Sem criar PR/merge em main.
5. Atualizar documento índice/manifesto da fonte SIFEN (data, origem: arquivo fornecido pelo responsável, nome, checksum, versão, índice de conteúdo, ausência da NT021, distinção de vigência). Registrar que o conjunto serve a futuras auditorias, mas não substitui conferir notas vigentes na DNIT.
6. Ler AUD-R02 e AUD-R03 e preparar **somente documentação** da matriz integral do Cadastro de Clientes, com fontes normativas página/grupo/NT, regras UI/API/SQL e pendências. Não alterar código de produção sem autorização específica.
7. Não executar Python, npm, TS, ESLint, build, Docker, Next.js, PostgreSQL, servidor local ou acesso VM; não fazer deploy. Ferramentas de leitura, cópia, hashing, git e edição Markdown são permitidas conforme protocolo.
8. Informar ao responsável somente: resultado, documentos normativos arquivados/pendências, testes não executados, bloqueios e SHA. Parar para revisão ChatGPT.

## Evidência e rastreabilidade
AUD-R03 (`documentacao/v1/homologacao-visual/AUD-R03-SIFEN-PACOTE-NT001-027-CLIENTES-2026-10-11.md`) é **parcial** e não homologa regras fiscais. Após arquivar o ZIP, não reivindicar revisão 100% sem reconciliar MT v150, notas, catálogo e contratos reais. A guarda do documento não equivale a autorização para implementação ou homologação.
