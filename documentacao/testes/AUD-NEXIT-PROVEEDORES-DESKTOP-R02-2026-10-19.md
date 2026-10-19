# AUD-NEXIT-PROVEEDORES-DESKTOP-R02 — Revalidação independente antes da correção

**Data:** 19/10/2026. **Auditor:** ChatGPT (não Claude). **Repositório:** `proceit-tech/distribuidora`. **Branch:** `feature/NEXIT-2026-001-banco-demo`. **HEAD de referência:** `3173e5cc0b2f386932558b16665f1a15f075ab2a`. **Corte da R01:** `542b11696a01daf6e831d339486fdcf4cbe429f0`.

**Parecer:** permanecem **PRV-D01 ALTA, PRV-D02 MÉDIA e PRV-D03 MÉDIA** (R01), comprovados pelo código atual. **Nenhuma alteração recente específica de Proveedores a reverter; nenhum novo defeito comprovado nesta passagem dirigida.** Menu NÃO HOMOLOGADO. O responsável autorizou agora exclusivamente a correção destes três IDs, com testes curtos e focais; ChatGPT reauditará o SHA do Claude posteriormente.

## Evidência comparativa — não reimplementar o histórico

Os blobs SHA de `app/(private)/proveedores/{layout.tsx,page.tsx,nuevo/page.tsx,[id]/page.tsx}`, `_components/proveedor-form.tsx`, `_components/pestanas/direcciones.tsx`, `app/api/proveedores/{route.ts,[id]/route.ts}` e `lib/proveedores/cliente-api.ts` são **idênticos** no corte antigo da R01 e no HEAD desta R02. `lib/navigation/menu.ts` mudou para permitir o perfil `CLIENTES.CREAR` na alta de Clientes; esse padrão de navegação é referência, não uma autorização implícita em Proveedores. Verificados `RetomarAlta`, `EstadoPagina`, `lib/proveedores/http.ts`, `contexto.ts` e os controles separados de `pestanas/bancos.tsx`, `pestanas/documentos.tsx` e `reactivar-cuenta.tsx`.

## Escopo autorizado e critérios de aceite

### PRV-D01 — ALTA — criação sem permissão de leitura

- `app/(private)/proveedores/layout.tsx` exige `PROVEEDORES.VER` em todas as subrotas; `/proveedores/nuevo` precisa de `CREAR` sem `VER` adicional. Preservar `/proveedores` e `/proveedores/[id]` apenas com `VER`; `POST /api/proveedores` continua `CREAR`, e catálogos mínimos/geografia apenas `VER || CREAR`; GET lista/ficha continua `VER`.
- `nuevo/page.tsx` e `retomar-alta.tsx` redirecionam a `/proveedores` ao concluir (e contêm links de saída para lista); criar conclusão própria para `CREAR-only` com «Registrar otro proveedor», sem links inacessíveis, mantendo para `VER` o fluxo atual. Autoridade deve ser obtida do contexto da sessão no servidor (API ou server layout), nunca de querystring ou prop vinda do navegador.
- `lib/navigation/menu.ts` deve oferecer ao operador apenas `CREAR` o destino `/proveedores/nuevo` e `resolverInicio` deve chegar a essa rota, sem conceder `VER`; admin de empresa e plataforma conservam seus destinos. Sucesso somente após confirmação do encerramento; preservar recuperação por URL, upload parcial, idempotência de fechamento e proteção de pendentes. Observação: a tela de `RetomarAlta` preserva arquivos ainda não enviados; qualquer implementação de conclusão deve evitar aviso indevido após usuário confirmar encerramento e começar outro cadastro.
- A mudança pode exigir separar layout de módulo e layouts das subrotas (como em Clientes); limitar ao mínimo e não alterar a ACL do motor ou uploads.

### PRV-D02 — MÉDIA — lista e formulário conforme privilégios

- `app/(private)/proveedores/page.tsx` mostra botão «Nuevo proveedor» no topo e no estado vazio sem `CREAR`; esses CTAs devem refletir `PROVEEDORES.CREAR` proveniente do servidor.
- `[id]/page.tsx` já recebe `proveedor.permisos.editar` em GET `/api/proveedores/[id]`, mas `ProveedorForm` mantém campos e submit editáveis para `VER-only`; modo consulta deve bloquear **edição comum de dados maestros**, controles de adicionar/quitar, edição de filhos, submit, e guardar inerte sem EDITAR. Preservar visualização e downloads conforme permissão.
- **Crítico para não causar regressão:** ações independentes têm autoridade própria (documentos `permisosDocumentos`, aprovação bancária `aprobarBanco`, `reactivarCuenta`, homologação/risco/bloqueio). NÃO colocar um `fieldset disabled` abrangente sobre todos os botões que desative também ação específica permitida. Guardar a edição comum sem conceder EDITAR; separar bloqueio visual de controle específico com testes de papel.
- Preservar backend `PUT` com 409 de versão; não ampliar acesso nem mexer em políticas bancárias.

### PRV-D03 — MÉDIA — falhas do catálogo geográfico

- `_components/pestanas/direcciones.tsx` atualmente transforma `!r.ok` e exceções da rede em `lista:[]`; preservar legítimo `200 datos:[]` como vazio sem alerta, e distinguir **401/403, 500 e rede** com erro visível junto ao campo (idealmente `role='alert'`) e opção de **Reintentar** apenas para consulta corrente.
- Manter a chave vigente de departamento/distrito e `activo` do cleanup para descartar resposta ou erro tardio após troca ou desmontagem; não introduzir race. Não sobrescrever seleção do operador nem alterar regras de geografia/SQL.
- Para perfil VER-only, evitar disparar fetch e ação de retry que altere ficha se não forem autorizados; os catálogos necessários à visualização podem permanecer carregáveis.

## Preservações e exclusões

**Não tocar:** correções PRV-M01–M04 (409/concor­rência, legados inativos, rascunhos, conclusão documental) nem PRV-R01-01…05 (retomada por URL, uploads parciais, finalização idempotente, catálogos para criador e validação de versão); isolamento por empresa; aprovações e auditoria de bancos, governança, retenções, documentos privados/versionados/exclusão lógica; SQL/migrations; Dashboard, Clientes e todos os demais menus. Não iniciar PRV-M05 (paginação backend) nem PRV-M06 / PRV-O01 (política de visibilidade bancária não decidida), não redesenhar desktop nem criar mobile. O código fonte atual não comprova o estado aplicado de NEX-034…037 na VM: não executar nem supor.

**Testes mínimos, sem suíte geral:** casos focais de permissões `CREAR-only`, `VER-only`, `EDITAR`, admin empresarial/plataforma, acesso sem permissão e isolamento de dados; sucesso de criação/retomada (upload/fechamento/retry e sem segundo POST); leitura da ficha com ações de documento/banco independentes; catálogo `200 []`, `401/403/500` e rede + retry + erro atrasado para outro departamento/distrito. Prefira poucas comprovações isoladas de fluxo e testes puros; nenhuma regressão global de Clientes, Facturas ou Dashboard, `next build`, `tsc` global, ESLint global, CI manual, VM, PostgreSQL ou Docker. Sintaxe/tipos/lint **pontuais** dos arquivos tocados se disponíveis. Resultados não executados não podem ser declarados OK.

**Responsabilidades:** somente Claude implementa, testa focalmente, faz commit/push e para; ChatGPT audita novo SHA; responsável homologa navegador/banco/VM. Registros `AUD-*` são do ChatGPT.