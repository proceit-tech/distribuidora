# Auditoria independente — correções PRD-AUD-07 e PRD-AUD-08

**Data:** 2026-10-12. **Base examinada:** commit `61107111512fce5c7c40249902294146a86b8e44`. **Responsável pela auditoria estática:** ChatGPT. **Estado:** CORREÇÕES REQUERIDAS, não homologado, não liberado para VM. Claude executa código, ChatGPT revisa, humano controla VM e banco real.

## PRD-AUD-07 — Encerramento da carga inicial sem confirmação HTTP (P1, confirmado)

**Evidência:** `app/(private)/productos/nuevo/page.tsx`, `guardar()`: quando `fallidos === 0`, faz `await fetch('/api/productos/'+id+'/documentos/finalizar', {method:'POST'})`, mas ignora `response.ok`; no `catch`, apenas comenta que a primeira edição fecha a janela. Mesmo quando o servidor devolve HTTP 403/404/500 ou lança erro de rede, o código segue `router.push('/productos')`. O banco pode conservar `productos.carga_documentos_inicial_abierta = true`. Não é um erro de criação do produto: **não repetir POST /api/productos**.

**Implementação autorizada:** validar HTTP e tratar explicitamente falha de encerramento. Manter ID do produto já criado, reportar falha ao usuário, assegurar retomada controlada sem duplicação, preservar documentos/foto já enviados; não navegar para sucesso silenciosamente. Avaliar o caminho de `aviso=documentos` e o fluxo com usuário de permissão apenas `PRODUCTOS.CREAR`, pois primeira edição pode bloquear ações. **Se necessário**, adequar encerramento/reintento idempotente com empresa+permissões, sem dar acesso permanente ou incluir temporizadores inventados. Não reabrir janela fechada e não alterar semântica de permissões por presunção.

**Critério de aceite:** respostas 200, 403, 404, 500 e erro de rede têm estados coerentes, não ocultam falha, não fazem POST duplicado do produto; upload parcial preservado; cenário criador com CREATE apenas tratado explicitamente.

## PRD-AUD-08 — Referência da foto privada anterior não recuperável (P1, confirmado como lacuna)

**Evidência:** `app/api/productos/[id]/imagen/route.ts` guarda uma foto atual em `productos.imagen_clave`; na substituição/remoção, o arquivo anterior é mantido, mas evento `producto_eventos` grava apenas nome, SHA-256 e tamanho sem `imagen_clave`. Não foi encontrada estrutura de referência de versões de foto nas rotas analisadas. Assim, os bytes podem permanecer armazenados sem vínculo recuperável. Não assumir que o backend atual faz recuperação.

**Implementação autorizada:** preservar referências das versões substituídas e da foto removida em um histórico privado e autorizado, reutilizando padrão de versionamento/armazenamento de Clientes e Proveedores quando aplicável. Manter somente UMA foto principal vigente e preservar `imagen_url` legado. Fornecer forma autorizada de consultar e recuperar versões anteriores **se não exigir decisão de negócio adicional**; caso contrário, ao mínimo assegurar referência privada auditável e apresentar decisão pendente. A chave de armazenamento não pode ser exposta em respostas públicas nem em log acessível sem permissão. Usar migration incremental NEX-042 se mudança de esquema for necessária; não modificar NEX-041 já versionada e não aplicá-la no banco real. Preservar UID/empresa, integridade, atomicidade do registro em transação e proteção de leitura.

**Critério de aceite:** foto A→B→remoção conserva rastreabilidade de A e B, existe chave estável no banco associada ao produto/empresa, permissões de acesso adequadas, ausência de arquivo sem referência por operação normal; URL legada não afetada. Arquivos binários não apagados fisicamente por essas operações.

## Validação independente antes da VM

1. ChatGPT revisará diff e contratos de `nuevo/page.tsx`, fechamento, foto e migration incremental; autenticação, isolamento, permissões e retrocompatibilidade.
2. Verificar estática e/ou efetivamente sequência de migrations **NEX-038…NEX-042**, checksums, grants de runtime, NEX-039 com catálogo de 64 códigos.
3. Testes de PostgreSQL 16 descartável/isolado e armazenamento, além de build e smoke funcional, **não são atribuição da auditoria do Claude**: verificações locais normais de implementação não equivalem a teste independente.
4. Nenhuma migration, SQL, Docker, `git pull` ou deploy na VM sem autorização humana e gate explícito.
5. Quando não houver capacidade de executar teste real, registrar claramente a limitação e não declarar GO automaticamente.

**Retificações mantidas:** registros vazios vieram dos cliques do responsável em Agregar; não são bug; imagens de terceiros nunca são evidência das capturas reais. PRD-REV-02, 07 e 08 permanecem apenas especificação, sem mudança de regra de negócio.
