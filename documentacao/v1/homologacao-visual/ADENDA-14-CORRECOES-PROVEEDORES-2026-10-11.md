# Proveedores V1 — Adenda de 14 correções da matriz normativa

Data: 2026-10-11. Natureza: revisão técnica documentada; não representa execução ou homologação. Complementa MATRIZ-NORMATIVA-CAMPO-A-CAMPO-PROVEEDORES-V1-2026-10-11.md e preserva DEC-PRV-01 a DEC-PRV-10.

| ID | Área | Constatação e correção necessária |
|---|---|---|
| PRV-A01 | Identificação | O servidor de Proveedores valida DV apenas por regex; implementar cálculo módulo 11 DNIT pelo componente comum, com reconferência em POST e PUT. Para RUC PY: 3 a 8 dígitos ASCII, DV separado. Não importar requisitos SIFEN do receptor. |
| PRV-A02 | Nomes | A migration NEX-006 limita razon_social e nombre_fantasia a 200 caracteres. O limite proposto de 255 exige conferir demais migrations e preparar alteração incremental compatível; nunca truncar silenciosamente. |
| PRV-A03 | Bloqueio | O DDL contém bloqueado e motivo_bloqueo, ausentes da gravação comum de ProveedorBody. Implementar motivo obrigatório, permissão adequada e auditoria conforme DEC-PRV-06. Não expor bloqueio como edição irrestrita. |
| PRV-A04 | Contatos | esPrincipal e as sete preferências recibeCotizaciones, recibeOrdenesCompra, recibeLogistica, recibeDevoluciones, recibePagos, recibeCalidad, recibeNotificaciones existem em tipos, INSERT e GET, mas não estão renderizadas no formulário atual. Exibir e persistir todos os controles; máximo um principal. |
| PRV-A05 | Endereços | codigoPostal e esPrincipal estão em tipos e persistência, mas não aparecem no formulário; incluir. Descripción e Dirección são obrigatórios ao acrescentar endereço e precisam da indicação visual e validação. |
| PRV-A06 | Bancos | codigoSwift, iban e esPrincipal existem em tipos e persistência, mas não aparecem nos controles. Implementar exibição e aprovação separada para conta nova/alterada, mantendo uma conta principal aprovada por moeda. |
| PRV-A07 | Retenções | impostoId, certificadoObligatorio e observacion existem no contrato/API/DDL e estão ausentes do formulário. Exibi-los; exigir certificado válido antes de ativar retenção quando necessário (DEC-PRV-08). |
| PRV-A08 | Documentos | Formulário e NEX-006 exigem URL; substituir por upload privado de PDF/JPG/PNG/DOCX/XLSX até 10 MB, com versões, restauração, exclusão lógica e auditoria; preservar documentos legados. |
| PRV-A09 | Integridade | PUT /api/proveedores/[id] apaga e recria todas as cinco coleções relacionadas. Implementar atualização seletiva transacional por IDs persistentes e empresa; exclusões explícitas sem perder histórico. |
| PRV-A10 | Precisão | Formulário/servidor utilizam Number e GET converte numeric para float8. Usar representação decimal textual exata e validar limites e escala de numeric(18,2) e numeric(5,2), sem arredondar/truncar silenciosamente. |
| PRV-A11 | Homologação | Estado e risco são selects livres na edição atual. Separar autorização e ações auditadas de homologação, risco e justificativa da edição cadastral normal, conforme DEC-PRV-01, 02, 03 e 10. |
| PRV-A12 | Interface | Observación general é o mesmo campo master repetido nas oito abas; exibir apenas em Información. Datas aparecem no formato do navegador mm/dd/yyyy; padronizar visualização local preservando ISO na API. Erros de API devem apontar campo e aba. |
| PRV-A13 | Controle bancário | Uma conta principal aprovada por moeda; contas novas/alteradas pendentes não podem substituir silenciosamente o registro aprovado ou ser usadas em pagamentos antes da aprovação (DEC-PRV-04 e 07). |
| PRV-A14 | Rastreabilidade | Não usar conversão automática camelCase→snake_case como prova. Confrontar cada campo com columnasProveedor(), insertarHijos(), GET/POST/PUT e DDL efetivo após migrations posteriores; NEX-006 isolada não confirma estado do banco real. |

## Status e instruções de uso

- Estes achados são complementos concretos à matriz de 94 itens e às dez decisões de negócio aprovadas.
- Diferenciar regra existente, regra aprovada e correção pendente. A proposta de ampliar nomes para 255 depende de validação de compatibilidade e aprovação do ajuste, não presumir DDL aplicado.
- O Claude deverá ler esta adenda antes de implementar, registrar a rastreabilidade e executar verificações disponíveis. O histórico documental não equivale a implementação.
- Nenhum código, SQL, migration, Docker ou VM foi alterado por esta adenda.
