# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**El Chefe** — E-commerce de conveniência e tabacaria em Ponta Grossa, PR. Loja online com integração ao PDV OnSell, Cloudinary, WhatsApp e Make.com. Funciona como site estático; o servidor Node.js existe apenas para o proxy de deleção de imagens.

## Commands

```bash
npm install        # Instalar dependências (somente Express.js)
npm start          # Iniciar servidor Express (porta 3000 ou process.env.PORT)
npm run dev        # Alias para npm start
npm run manifest   # Gerar manifesto de imagens para o PDV
```

**Desenvolvimento local:** abrir `http://localhost/ElChefe/index.html` diretamente via XAMPP — sem servidor Node. O servidor Node é necessário apenas para `POST /api/cloudinary/delete`.

Não há linter, formatter nem testes automatizados.

## Arquitetura

### Padrão de Módulo

Todos os módulos JS seguem IIFE com estado privado e API pública exposta via `return {}`:

```javascript
const ElChefeModuleName = (() => {
  // estado privado
  return { publicMethod() {} };
})();
```

**Ordem de carregamento** (crítica — definida em `index.html`):
1. `config.js` → `ElChefeConfig`
2. `products-data.js` → `ELCHEFE_PRODUCTS` (fallback estático)
3. `utils.js` → `ElChefeUtils`
4. `pdv-api.js` → `ElChefePDV`
5. `shipping.js` → `ElChefeShipping`
6. `cart.js` → `ElChefeCart`
7. `catalog.js` → `ElChefeCatalog`
8. `checkout.js` → `ElChefeCheckout`
9. `app.js` → `ElChefeApp`

### Fluxo de Dados de Produtos

Cascata de prioridade:
1. **PDV OnSell API** — `GET /api/site/produtos` (se `PDV_ENABLED === true`, timeout 8s via AbortController)
2. **localStorage** `elchefe_products` — produtos cadastrados no painel admin
3. **Fallback local** — `ELCHEFE_PRODUCTS` de `products-data.js`

**Normalização PDV → Site** (`pdv-api.js`):
- `nome` → `name`, `slug` (gerado)
- `preco_promocional` / `em_promocao` → `price` / `priceOriginal` / `isPromo`
- `foto_url` não é usado diretamente — a lógica tenta URL Cloudinary determinística: `https://res.cloudinary.com/{cloudName}/image/upload/elchefe-pdv-{id}`, fallback para mapa `localStorage elchefe_pdv_images`
- `fixEncoding()` corrige double-encoding UTF-8 nos textos do PDV (ex: `alcÃ³licas` → `alcoólicas`)

### Carrinho

Persistido em `localStorage elchefe_cart_v1`. Comunicação entre módulos via CustomEvents no `document`:
- `cart:updated` → payload `{items, count}` — dispara atualização de badge e totais
- `cart:opened` / `cart:closed` — controla visibilidade do drawer

Quantidade nunca pode exceder `product.stock`; validação em `cart.js → add()` e `updateQty()`.

### Checkout (3 etapas)

**Step 1 — Dados:** nome, WhatsApp, CEP → ao sair do campo CEP dispara `ElChefeShipping.calculate()` e preenche endereço via ViaCEP.

**Step 2 — Pagamento:** PIX (padrão), Dinheiro (exibe campo troco), Cartão na Entrega.

**Step 3 — Confirmação:**
- **Se `PDV_ENABLED`:** chama `ElChefePDV.enviarPedido(payload)` → `POST /api/site/pedido`; status 409 = estoque insuficiente.
- **Se não:** gera link `wa.me` com guia de separação formatada em ASCII + timestamp.

### Cálculo de Frete (`shipping.js`)

Pipeline: ViaCEP → Nominatim (geocodificação) → fórmula Haversine → fator de rota × 1,35 → tabela de faixas.

Faixas configuradas em `DISTANCE_FEES`: 0–1 km = R$ 5, 1–2 = R$ 8, 2–3 = R$ 10, 3–4 = R$ 12, 4–5 = R$ 14, 5+ = R$ 15. Frete grátis desativado (`FREE_SHIPPING_THRESHOLD = 0`).

Coordenadas da loja: `-25.0952, -50.1622` (hardcoded em `shipping.js`). Nominatim exige `User-Agent` na requisição.

### Servidor Express (`server.js`)

Rota única de API: `POST /api/cloudinary/delete` — recebe `productId`, deleta `public_id: elchefe-pdv-{productId}` no Cloudinary. Requer env vars no servidor:
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Cache headers: JS/CSS/fonts = 1 ano imutável; imagens = 7 dias; HTML = sem cache.

### Admin Panel (`admin.html` / `admin.js`)

Autenticação: SHA-256 via Web Crypto API. Senha padrão `elchefe@admin`. Hash em `localStorage elchefe_admin_hash`; sessão em `sessionStorage elchefe_admin_session`.

Duas abas:
- **Produtos** — CRUD completo, persiste em `localStorage elchefe_products`
- **Imagens PDV** — upload direto ao Cloudinary com `public_id: elchefe-pdv-{id}`, mapa salvo em `localStorage elchefe_pdv_images`

## Configuração

Configurações do cliente em `assets/js/config.js` (`ElChefeConfig`):

| Chave | Descrição |
|-------|-----------|
| `PDV_ENABLED` | Ativa integração PDV OnSell |
| `PDV_BASE_URL` | URL do servidor PDV |
| `PDV_API_KEY` | Chave de autenticação PDV |
| `USE_LOCAL_FALLBACK` | Fallback automático se API falhar |
| `CLOUDINARY_CLOUD_NAME` | Cloud Cloudinary |
| `CLOUDINARY_UPLOAD_PRESET` | Preset de upload (sem auth) |
| `WHATSAPP_NUMBER` | Formato: `5542XXXXXXXXX` |

URLs de webhook (Make.com) estão hardcoded em `checkout.js`. Coordenadas da loja em `shipping.js`.

## LocalStorage — Chaves Usadas

| Chave | Módulo | Conteúdo |
|-------|--------|----------|
| `elchefe_cart_v1` | cart.js | Array de CartItems |
| `elchefe_products` | admin.js | Produtos cadastrados pelo admin |
| `elchefe_pdv_images` | admin.js / pdv-api.js | Mapa `{productId: cloudinaryUrl}` |
| `elchefe_admin_hash` | admin.js | SHA-256 da senha admin |

## CSS

Organizado em camadas em `assets/css/`:
- `tokens.css` — design tokens (cores, tipografia, espaçamento)
- `reset.css` — normalização
- `layout.css` — header, hero, sections, footer
- `components.css` — buttons, forms, badges, cards
- `cart.css` — drawer lateral
- `checkout.css` — modal multi-step
- `admin.css` — painel administrativo

Fontes: Barlow Condensed (display), Inter (body). Cor de destaque: `#c41e3a`.

## Deploy

**Railway:** `railway.json` (builder NIXPACKS, `node server.js`, restart on failure).
**Vercel/estático:** `serve.json` define regras de cache e rewrite `/admin` → `admin.html`.
