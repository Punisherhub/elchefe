# El Chefe — Webflow CMS Schema

## Collection: Produtos

| Campo (Label)         | Slug Webflow        | Tipo          | Obrigatório | Notas |
|-----------------------|---------------------|---------------|-------------|-------|
| Nome                  | `nome`              | Plain Text    | ✅          | Título do item |
| Categoria             | `categoria`         | Option        | ✅          | bebidas, destilados, cervejas, vinhos, tabacaria, snacks |
| Descrição             | `descricao`         | Plain Text    | —           | Max 160 chars |
| Foto                  | `foto`              | Image         | —           | Aspect ratio 1:1, min 600x600px |
| Emoji                 | `emoji`             | Plain Text    | —           | Fallback visual quando sem foto |
| Preço                 | `preco`             | Number        | ✅          | Decimal (2 casas) |
| Preço Original        | `preco-original`    | Number        | —           | Preencher apenas em promoções |
| Em Promoção           | `em-promocao`       | Switch (Bool) | ✅          | Default: false |
| Destaque              | `destaque`          | Switch (Bool) | ✅          | Default: false |
| Estoque Atual         | `estoque-atual`     | Number        | ✅          | Integer ≥ 0 |
| Ativo                 | `ativo`             | Switch (Bool) | ✅          | Publicar/ocultar sem deletar |

### Opções da categoria `categoria`:
- `bebidas`
- `destilados`
- `cervejas`
- `vinhos`
- `tabacaria`
- `snacks`

---

## Collection: Pedidos (opcional — para dashboard interno)

| Campo                 | Slug                | Tipo          |
|-----------------------|---------------------|---------------|
| ID do Pedido          | `order-id`          | Plain Text    |
| Status                | `status`            | Option        |
| Cliente Nome          | `cliente-nome`      | Plain Text    |
| Cliente Telefone      | `cliente-telefone`  | Plain Text    |
| Endereço Entrega      | `endereco-entrega`  | Plain Text    |
| CEP                   | `cep`               | Plain Text    |
| Itens (JSON)          | `itens-json`        | Plain Text    |
| Subtotal              | `subtotal`          | Number        |
| Frete                 | `frete`             | Number        |
| Total                 | `total`             | Number        |
| Pagamento             | `pagamento`         | Option        |
| Guia de Separação     | `guia-separacao`    | Rich Text     |
| Data do Pedido        | `data-pedido`       | Date/Time     |

### Opções de `status`:
- `novo`
- `em-separacao`
- `saiu-entrega`
- `entregue`
- `cancelado`

### Opções de `pagamento`:
- `pix`
- `dinheiro`
- `cartao`

---

## Notas de Integração

### Abater Estoque via API (após venda)
```
PATCH https://api.webflow.com/v2/collections/{COLLECTION_ID}/items/{ITEM_ID}
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "fieldData": {
    "estoque-atual": <novo_valor>
  }
}
```
> ⚠️ Sempre busque o valor atual com GET antes de subtrair (evita race conditions).

### Publicar Item
O Webflow só exibe itens com `isDraft: false` e `isArchived: false`.
Após PATCH, inclua esses campos:
```json
{
  "fieldData": { ... },
  "isDraft": false,
  "isArchived": false
}
```
