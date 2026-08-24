# DistribuNex — MVP para distribuidora

Demonstração navegável de uma plataforma de gestão comercial, logística, financeira e facturação electrónica para distribuidoras.

## Módulos demonstrados

- Dashboard executivo
- Clientes, fornecedores e produtos
- Compras e inventário
- Pedidos e vendas
- Entregas e rotas
- Financeiro
- Simulação de emissão de factura electrónica e envio ao SIFEN

## Executar localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Publicar na Vercel

1. Envie todos os arquivos deste projeto para um repositório GitHub.
2. Na Vercel, selecione **Add New > Project**.
3. Importe o repositório.
4. Mantenha o framework detectado como **Next.js**.
5. Clique em **Deploy**.

Este projeto é uma demonstração visual com dados simulados. Não utiliza banco de dados e não transmite documentos reais ao SIFEN.
