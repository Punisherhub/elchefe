/**
 * cart.js — El Chefe
 *
 * Gerenciamento de carrinho: adicionar, remover, atualizar quantidade.
 * Estado persistido em localStorage para sobreviver a recargas.
 *
 * Suporte a variantes (sabores): itens com o mesmo product.id mas variante
 * diferente são tratados como entradas separadas no carrinho.
 * A chave de identificação é: id (sem variante) ou "id|variante" (com variante).
 *
 * Emite eventos customizados no `document` para comunicação entre módulos:
 *   - 'cart:updated'   → sempre que o carrinho muda
 *   - 'cart:opened'    → quando o drawer é aberto
 *   - 'cart:closed'    → quando o drawer é fechado
 */

'use strict';

const ElChefeCart = (() => {

  const STORAGE_KEY = 'elchefe_cart_v1';

  // ── Estado ───────────────────────────────────────────────────────────────

  /** @type {CartItem[]} */
  let items = [];

  /** @type {number|null} Taxa de frete calculada */
  let shippingFee = null;

  /**
   * @typedef {Object} CartItem
   * @property {string} id
   * @property {string} name
   * @property {string} emoji
   * @property {string|null} image
   * @property {string} category
   * @property {number} price       - preço unitário (com desconto se promo)
   * @property {number} quantity
   * @property {number} stock       - estoque disponível no momento da adição
   * @property {string|null} variant - sabor/variante selecionado, ou null
   */

  // ── Persistência ─────────────────────────────────────────────────────────

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) items = JSON.parse(raw);
    } catch {
      items = [];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function emit(event, detail = {}) {
    document.dispatchEvent(new CustomEvent(event, { detail }));
  }

  /**
   * Gera a chave única de um item no carrinho.
   * Itens com variante diferente do mesmo produto são entradas distintas.
   * @param {CartItem} item
   * @returns {string}
   */
  function cartKey(item) {
    return item.variant ? `${item.id}|${item.variant}` : String(item.id);
  }

  /**
   * Retorna o índice do item no array, ou -1.
   * @param {string} id
   * @param {string|null} [variant]
   * @returns {number}
   */
  function findIndex(id, variant) {
    const key = variant ? `${id}|${variant}` : String(id);
    return items.findIndex(i => cartKey(i) === key);
  }

  // ── API Pública ──────────────────────────────────────────────────────────

  /**
   * Adiciona um produto ao carrinho, validando estoque.
   * Produtos com variante são tratados como entradas distintas.
   * A validação de estoque considera o total de TODAS as variantes do mesmo produto.
   * @param {Object} product  - objeto do catálogo (ver products-data.js)
   * @param {number} [qty=1]
   * @returns {{ success: boolean, message: string }}
   */
  function add(product, qty = 1) {
    if (product.stock <= 0) {
      return { success: false, message: `"${product.name}" está esgotado.` };
    }

    const variant = product.variant || null;
    const idx     = findIndex(product.id, variant);

    // Soma todas as variantes do mesmo produto para validar o estoque total
    const totalInCart = items
      .filter(i => String(i.id) === String(product.id))
      .reduce((sum, i) => sum + i.quantity, 0);

    if (totalInCart + qty > product.stock) {
      return {
        success: false,
        message: `Só temos ${product.stock} unidade(s) de "${product.name}" em estoque.`,
      };
    }

    if (idx >= 0) {
      items[idx].quantity += qty;
    } else {
      const price = product.isPromo && product.priceOriginal
        ? product.price           // preço promocional
        : product.price;

      items.push({
        id:       product.id,
        name:     product.name,
        emoji:    product.emoji,
        image:    product.image,
        category: product.category,
        price,
        quantity: qty,
        stock:    product.stock,
        variant:  variant,
      });
    }

    save();
    emit('cart:updated', { items: getAll(), count: getCount() });
    return { success: true, message: `"${product.name}" adicionado ao carrinho!` };
  }

  /**
   * Remove um item do carrinho.
   * @param {string} id
   * @param {string|null} [variant]
   */
  function remove(id, variant) {
    const idx = findIndex(id, variant || null);
    if (idx < 0) return;
    const name = items[idx].name;
    items.splice(idx, 1);
    save();
    emit('cart:updated', { items: getAll(), count: getCount() });
    return name;
  }

  /**
   * Atualiza a quantidade de um item. Se qty <= 0, remove o item.
   * Respeita o limite de estoque.
   * @param {string} id
   * @param {string|null} variant
   * @param {number} qty
   * @returns {{ success: boolean, message?: string }}
   */
  function updateQty(id, variant, qty) {
    const idx = findIndex(id, variant || null);
    if (idx < 0) return { success: false };

    if (qty <= 0) {
      remove(id, variant || null);
      return { success: true };
    }

    if (qty > items[idx].stock) {
      return {
        success: false,
        message: `Máximo de ${items[idx].stock} unidade(s) disponíveis.`,
      };
    }

    items[idx].quantity = qty;
    save();
    emit('cart:updated', { items: getAll(), count: getCount() });
    return { success: true };
  }

  /**
   * Limpa o carrinho completamente.
   */
  function clear() {
    items = [];
    shippingFee = null;
    save();
    emit('cart:updated', { items: [], count: 0 });
  }

  /**
   * Define a taxa de frete calculada.
   * @param {number|null} fee
   */
  function setShipping(fee) {
    shippingFee = fee;
    emit('cart:updated', { items: getAll(), count: getCount() });
  }

  /** Retorna cópia dos itens do carrinho */
  function getAll()  { return items.map(i => ({ ...i })); }

  /** Quantidade total de itens (somando quantities) */
  function getCount() {
    return items.reduce((acc, i) => acc + i.quantity, 0);
  }

  /** Subtotal dos produtos (sem frete) */
  function getSubtotal() {
    return items.reduce((acc, i) => acc + i.price * i.quantity, 0);
  }

  /** Total = subtotal + frete */
  function getTotal() {
    return getSubtotal() + (shippingFee ?? 0);
  }

  /** Frete atual */
  function getShipping() { return shippingFee; }

  /** true se o carrinho está vazio */
  function isEmpty() { return items.length === 0; }

  /**
   * Retorna a chave única de um item (util para app.js/checkout.js).
   * @param {CartItem} item
   * @returns {string}
   */
  function getCartKey(item) { return cartKey(item); }

  // ── Inicialização ────────────────────────────────────────────────────────

  load();

  return {
    add,
    remove,
    updateQty,
    clear,
    setShipping,
    getAll,
    getCount,
    getSubtotal,
    getTotal,
    getShipping,
    isEmpty,
    getCartKey,
  };

})();
