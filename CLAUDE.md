# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**El Chefe** — E-commerce de conveniência e tabacaria localizado em Ponta Grossa, PR. Loja online com integração ao sistema PDV OnSell, Cloudinary, WhatsApp e Make.com.

## Commands

```bash
npm install          # Instalar dependências (somente Express.js)
npm start            # Iniciar servidor Express (porta 3000 ou process.env.PORT)
npm run dev          # Alias para npm start
npm run manifest     # Gerar manifesto de imagens para o PDV
```

**Desenvolvimento local via XAMPP:** abrir diretamente `http://localhost/ElChefe/index.html` sem precisar do servidor Node.

**Servidor Node.js** é necessário apenas para a rota proxy `/api/cloudinary/delete` (deleção de imagens no Cloudinary). Todas as outras funcionalidades funcionam como arquivos estáticos.

Não há linter, formatter nem testes automatizados configurados.

## Architecture

### Estrutura de Módulos JavaScript

Cada módulo segue o padrão IIFE com estado privado e API pública:

```javascript
const ElChefeModuleName = (() => {
  // estado privado
  return { publicMethod() {} };
})();
```

**Ordem de carregamento** (definida em `index.html`):
1. `config.js` → `ElChefeConfig` — configurações globais (PDV, Cloudinary, WhatsApp)
2. `utils.js` → `ElChefeUtils` — formatação de moeda, máscaras, toast notifications
3. `products-data.js` → dados locais de fallback
4. `pdv-api.js` → `ElChefePDV` — abstração da API PDV OnSell
5. `shipping.js` → `ElChefeShipping` — cálculo de frete por zonas de CEP
6. `catalog.js` → `ElChefeCatalog` — renderização e filtragem de produtos
7. `cart.js` → `ElChefeCart` — gerenciamento de estado do carrinho
8. `checkout.js` → `ElChefeCheckout` — formulário de checkout multi-etapas
9. `app.js` → `ElChefeApp` — orquestrador principal

### Fluxo de Dados de Produtos

Prioridade em cascata:
1. **PDV OnSell API** (se `ElChefeConfig.PDV_ENABLED === true`)
2. **localStorage** (`elchefe_products`)
3. **Fallback local** (`products-data.js`)

### Estado do Carrinho

Persistido em `localStorage` com a chave `elchefe_cart_v1`. Comunicação entre módulos via eventos DOM customizados: `cart:updated`, `cart:opened`, `cart:closed`.

### Checkout (3 etapas)

1. Dados do cliente + cálculo de frete (ViaCEP + zonas de CEP ou Google Distance Matrix)
2. Seleção de método de pagamento
3. Confirmação → webhook Make.com + mensagem WhatsApp

### Servidor Express (`server.js`)

Serve arquivos estáticos e expõe apenas uma rota de API:
- `POST /api/cloudinary/delete` — proxy para deletar imagens no Cloudinary (mantém a API secret no servidor)

### Admin Panel (`admin.html` / `admin.js`)

Autenticação por senha com hash SHA-256 via Web Crypto API. Senha padrão: `elchefe@admin`. Gerencia produtos e imagens via Cloudinary.

## Key Configuration

Todas as configurações ficam em `assets/js/config.js` (`ElChefeConfig`):

| Chave | Descrição |
|-------|-----------|
| `PDV_ENABLED` | Ativa integração com PDV OnSell |
| `PDV_BASE_URL` | URL base do servidor PDV |
| `PDV_API_KEY` | Chave de autenticação PDV |
| `USE_LOCAL_FALLBACK` | Usa dados locais se API falhar |
| `CLOUDINARY_CLOUD_NAME` | Identificador do cloud Cloudinary |
| `CLOUDINARY_UPLOAD_PRESET` | Preset de upload Cloudinary |
| `WHATSAPP_NUMBER` | Número da loja (formato DDI+DDD+número) |

URLs de webhook (Make.com) e chave Google Maps são configuradas diretamente em `checkout.js` e `shipping.js`.

## Deployment

Configurado para **Railway** via `railway.json` (builder NIXPACKS, `node server.js`). O `serve.json` define regras de cache para hosting estático (Vercel/similar): assets com cache de 1 ano, HTML sem cache.
