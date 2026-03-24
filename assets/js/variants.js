/**
 * variants.js — El Chefe
 *
 * Utilitário de leitura de variantes de produtos.
 * As variantes vêm do PDV junto com os dados do produto (campo `variantes`).
 * O admin gerencia via painel, que salva diretamente no PDV via API.
 *
 * Estrutura de variantes por produto:
 *   [
 *     { "nome": "Sabor",   "opcoes": ["Limão", "Morango", "Uva"] },
 *     { "nome": "Tamanho", "opcoes": ["P", "M", "G", "GG"] }
 *   ]
 *
 * Cada grupo tem um nome e um array de opções.
 * O cliente deve escolher uma opção por grupo antes de adicionar ao carrinho.
 * O resultado no carrinho é a junção das seleções: "Limão / M"
 */

'use strict';

const ElChefeVariants = (() => {

  /**
   * Verifica se um produto possui variantes cadastradas.
   * @param {Object} product - objeto do catálogo (deve ter campo `variantes`)
   * @returns {boolean}
   */
  function hasVariants(product) {
    return Array.isArray(product.variantes) && product.variantes.length > 0;
  }

  /**
   * Retorna os grupos de variantes de um produto.
   * @param {Object} product
   * @returns {Array<{nome: string, opcoes: string[]}>}
   */
  function getGroups(product) {
    if (!Array.isArray(product.variantes)) return [];
    return product.variantes.filter(g =>
      g && typeof g.nome === 'string' && Array.isArray(g.opcoes) && g.opcoes.length > 0
    );
  }

  /**
   * Constrói a string de variante a partir das seleções do cliente.
   * Ex: { "Sabor": "Limão", "Tamanho": "M" } → "Limão / M"
   * @param {Object} selecoes - mapa { nomeGrupo: opcaoEscolhida }
   * @param {Array<{nome: string, opcoes: string[]}>} grupos - mantém a ordem
   * @returns {string}
   */
  function buildVariantString(selecoes, grupos) {
    return grupos
      .map(g => selecoes[g.nome])
      .filter(Boolean)
      .join(' / ');
  }

  /**
   * Verifica se todas as seleções obrigatórias foram feitas.
   * @param {Object} selecoes
   * @param {Array<{nome: string, opcoes: string[]}>} grupos
   * @returns {boolean}
   */
  function isSelectionComplete(selecoes, grupos) {
    return grupos.every(g => !!selecoes[g.nome]);
  }

  return {
    hasVariants,
    getGroups,
    buildVariantString,
    isSelectionComplete,
  };

})();
