/**
 * variants.js — El Chefe
 *
 * Gerencia variantes (sabores) de produtos, armazenando em localStorage.
 * Completamente desacoplado do PDV: o PDV recebe apenas produto_id e quantidade.
 * As variantes são usadas somente no carrinho, guia de separação e WhatsApp.
 *
 * Estrutura no localStorage:
 *   { "produto_id": ["Sabor A", "Sabor B"], ... }
 */

'use strict';

const ElChefeVariants = (() => {

  const STORAGE_KEY = 'elchefe_variants';

  // ── Persistência ─────────────────────────────────────────────────────────

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  // ── API Pública ──────────────────────────────────────────────────────────

  /**
   * Retorna cópia do mapa completo de variantes.
   * @returns {Object}
   */
  function getAll() {
    return Object.assign({}, load());
  }

  /**
   * Retorna o array de variantes de um produto, ou [] se não houver.
   * @param {string|number} productId
   * @returns {string[]}
   */
  function getForProduct(productId) {
    const data = load();
    return Array.isArray(data[String(productId)]) ? [...data[String(productId)]] : [];
  }

  /**
   * Verifica se um produto possui variantes cadastradas.
   * @param {string|number} productId
   * @returns {boolean}
   */
  function hasVariants(productId) {
    const variants = getForProduct(productId);
    return variants.length > 0;
  }

  /**
   * Define as variantes de um produto.
   * Valida: trim nas strings, remove vazias, deduplicar, rejeita strings com '|'.
   * @param {string|number} productId
   * @param {string[]} arr
   * @throws {Error} se arr não for array ou contiver '|'
   */
  function setForProduct(productId, arr) {
    if (!Array.isArray(arr)) {
      throw new Error('Variantes devem ser um array de strings.');
    }

    const cleaned = [...new Set(
      arr
        .map(v => String(v).trim())
        .filter(v => v.length > 0)
    )];

    const hasInvalidChar = cleaned.some(v => v.includes('|'));
    if (hasInvalidChar) {
      throw new Error('Variantes não podem conter o caractere "|".');
    }

    const data = load();

    if (cleaned.length === 0) {
      delete data[String(productId)];
    } else {
      data[String(productId)] = cleaned;
    }

    save(data);
  }

  /**
   * Remove todas as variantes de um produto.
   * @param {string|number} productId
   */
  function removeProduct(productId) {
    const data = load();
    delete data[String(productId)];
    save(data);
  }

  /**
   * Exporta o mapa completo de variantes como JSON formatado.
   * @returns {string}
   */
  function exportJSON() {
    return JSON.stringify(load(), null, 2);
  }

  /**
   * Substitui todo o mapa de variantes a partir de um JSON string.
   * @param {string} jsonString
   * @returns {number} Quantidade de produtos importados
   * @throws {Error} se o JSON for inválido
   */
  function importJSON(jsonString) {
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      throw new Error('JSON inválido.');
    }

    if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
      throw new Error('Formato inválido. O JSON deve ser um objeto { "produto_id": ["variante1", ...] }.');
    }

    // Valida e limpa cada entrada
    const normalized = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (!Array.isArray(val)) continue;
      const cleaned = [...new Set(val.map(v => String(v).trim()).filter(v => v.length > 0))];
      if (cleaned.length > 0) {
        normalized[String(key)] = cleaned;
      }
    }

    save(normalized);
    return Object.keys(normalized).length;
  }

  return {
    getAll,
    getForProduct,
    hasVariants,
    setForProduct,
    removeProduct,
    exportJSON,
    importJSON,
  };

})();
