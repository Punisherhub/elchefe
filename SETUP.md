# El Chefe — Guia de Configuração

## 1. Testar Localmente (XAMPP)
Abra `http://localhost/ElChefe/index.html` no navegador.

---

## 2. Chaves e Configurações

### `assets/js/checkout.js`
```js
const WEBHOOK_URL       = 'https://hook.make.com/SEU_HOOK';  // Make.com / Zapier
const WHATSAPP_NUMBER   = '5542XXXXXXXXX';                   // DDI+DDD+número
const WEBFLOW_API_TOKEN  = 'seu_token_aqui';                  // Webflow API
const WEBFLOW_COLLECTION = 'collection_id_aqui';             // ID da Collection CMS
```

### `assets/js/shipping.js`
```js
let GOOGLE_MAPS_API_KEY = 'sua_chave_aqui'; // Google Distance Matrix API
```
> ⚠️ Em produção, mova a chamada ao Google para o seu backend (Node/PHP/Python)
> para não expor a chave no frontend.

---

## 3. Integrar com Webflow CMS

### 3.1 Carregar produtos dinamicamente
Em `catalog.js`, substitua `loadProducts()`:
```js
async function loadProducts() {
  const res = await fetch(
    'https://api.webflow.com/v2/collections/{COLLECTION_ID}/items?limit=100',
    { headers: { Authorization: 'Bearer {WEBFLOW_API_TOKEN}' } }
  );
  const { items } = await res.json();
  return items.map(normalizeWebflowProduct);
}
```

### 3.2 Usar o Webflow Embed (Custom Code)
Cole o `<script>` de cada arquivo `.js` nas configurações de Custom Code do
projeto Webflow (Project Settings → Custom Code → Footer Code).

Ordem obrigatória:
1. `products-data.js` (ou substitua por fetch da API)
2. `utils.js`
3. `shipping.js`
4. `cart.js`
5. `catalog.js`
6. `checkout.js`
7. `app.js`

---

## 4. Webhook — Make.com / Zapier

O payload enviado no `POST` para o webhook tem esta estrutura:
```json
{
  "orderId": "ELCH-1234567890",
  "timestamp": "2025-06-01T18:00:00.000Z",
  "customer": {
    "name": "João Silva",
    "phone": "42999990000",
    "cep": "84010001",
    "address": "Rua XV de Novembro, 100",
    "complement": "Apto 3",
    "zone": "Centro / Zona 1",
    "notes": "Portão azul"
  },
  "items": [
    { "id": "whisky-jack-daniels-1l", "name": "Jack Daniel's", "quantity": 1, "price": 139.90, "subtotal": 139.90 }
  ],
  "subtotal": 139.90,
  "shipping": 5.00,
  "total": 144.90,
  "payment": "pix",
  "change": null,
  "summary": "🗂 GUIA DE SEPARAÇÃO..."
}
```

### Sugestão de automações no Make.com:
- **Módulo 1**: Webhook (recebe o POST)
- **Módulo 2**: WhatsApp (via Twilio ou Z-API) → envia `summary` para o número da loja
- **Módulo 3**: Google Sheets → registra o pedido em planilha
- **Módulo 4** *(opcional)*: Webflow → atualiza o status do pedido na Collection

---

## 5. Tabela de Frete — Personalização

Edite o array `CEP_ZONES` em `assets/js/shipping.js`:
```js
{ from: 84010000, to: 84020999, fee: 5.00, zone: 'Centro / Zona 1' },
```
Consulte os CEPs por bairro em: https://buscacepinter.correios.com.br

---

## 6. Estrutura de Arquivos

```
ElChefe/
├── index.html
├── cms-schema.md         ← Schema do Webflow CMS
├── SETUP.md              ← Este arquivo
├── assets/
│   ├── css/
│   │   ├── reset.css
│   │   ├── tokens.css    ← Variáveis de design
│   │   ├── layout.css    ← Header, hero, grid, footer
│   │   ├── components.css← Botões, cards, toast, badges
│   │   ├── cart.css      ← Drawer do carrinho
│   │   └── checkout.css  ← Modal de checkout
│   └── js/
│       ├── products-data.js  ← Dados locais (substituir por API)
│       ├── utils.js          ← Formatação, máscaras, toast
│       ├── shipping.js       ← Cálculo de frete / CEP
│       ├── cart.js           ← Estado do carrinho
│       ├── catalog.js        ← Renderização e filtros
│       ├── checkout.js       ← Formulário e envio do pedido
│       └── app.js            ← Orquestrador principal
```
