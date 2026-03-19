/**
 * catalog.js — El Chefe
 *
 * Renderiza o catálogo de produtos a partir de window.ELCHEFE_PRODUCTS
 * (products-data.js) ou de dados vindos da API do Webflow CMS.
 *
 * Para integrar com Webflow CMS, substitua `loadProducts()` por:
 *
 *   async function loadProducts() {
 *     const res = await fetch(
 *       'https://api.webflow.com/v2/collections/{COLLECTION_ID}/items',
 *       { headers: { Authorization: 'Bearer {WEBFLOW_API_TOKEN}' } }
 *     );
 *     const { items } = await res.json();
 *     return items.map(normalizeWebflowProduct);
 *   }
 */

'use strict';

const ElChefeCatalog = (() => {

  // ── Estado ───────────────────────────────────────────────────────────────

  let allProducts   = [];
  let activeFilter  = 'all';

  // ── Referências DOM ──────────────────────────────────────────────────────

  const grid       = () => document.getElementById('products-grid');
  const promoGrid  = () => document.getElementById('promo-grid');
  const emptyState = () => document.getElementById('empty-state');
  const filterBtns = () => document.querySelectorAll('.filter-btn');

  // ── Webflow CMS Normalizer ────────────────────────────────────────────────
  //
  //  Quando os dados vierem do Webflow CMS, os nomes dos campos
  //  usam o slug definido no painel. Ajuste conforme sua estrutura.

  function normalizeWebflowProduct(item) {
    const f = item.fieldData;
    return {
      id:            item.id,
      name:          f['nome'],
      slug:          item.slug,
      category:      f['categoria'],
      description:   f['descricao'] ?? '',
      price:         parseFloat(f['preco']),
      priceOriginal: f['preco-original'] ? parseFloat(f['preco-original']) : null,
      isPromo:       !!f['em-promocao'],
      isFeatured:    !!f['destaque'],
      stock:         parseInt(f['estoque-atual'] ?? 0, 10),
      image:         f['foto']?.url ?? null,
      emoji:         f['emoji'] ?? '📦',
    };
  }

  // ── Carregamento de Dados ─────────────────────────────────────────────────

  async function loadProducts() {
    showSkeletons();

    const { produtos, fonte, erro } = await ElChefePDV.fetchProdutos();

    if (erro) {
      ElChefeUtils.showToast('Catálogo carregado em modo offline.', 'info', 4000);
    }

    if (fonte === 'pdv') {
      console.info('[ElChefe Catalog] Produtos carregados do PDV.');
    }

    return produtos;
  }

  /**
   * Exibe skeletons enquanto os produtos carregam do PDV.
   */
  function showSkeletons() {
    const g = grid();
    if (!g) return;
    const placeholders = Array.from({ length: 8 }, () => `
      <li class="product-card" aria-hidden="true" style="pointer-events:none">
        <div class="product-card__img-wrap skeleton" style="aspect-ratio:1/1"></div>
        <div class="product-card__body" style="gap:var(--space-3)">
          <div class="skeleton" style="height:12px;width:60%;border-radius:4px"></div>
          <div class="skeleton" style="height:18px;width:85%;border-radius:4px"></div>
          <div class="skeleton" style="height:12px;width:100%;border-radius:4px"></div>
          <div class="skeleton" style="height:28px;width:50%;border-radius:4px"></div>
        </div>
        <div class="product-card__footer">
          <div class="skeleton" style="height:42px;border-radius:8px"></div>
        </div>
      </li>`).join('');
    g.innerHTML = placeholders;
  }

  // ── Renderização ─────────────────────────────────────────────────────────

  /**
   * Gera o HTML de um card de produto.
   * @param {Object} product
   * @returns {string}
   */
  function renderCard(product) {
    const isOutOfStock = product.stock <= 0;
    const isLowStock   = product.stock > 0 && product.stock <= 3;

    // Badges
    let badgesHTML = '';
    if (isOutOfStock)   badgesHTML += `<span class="badge badge--esgotado">Esgotado</span>`;
    if (product.isPromo && !isOutOfStock)
                        badgesHTML += `<span class="badge badge--promo">Promoção</span>`;
    if (product.isFeatured && !isOutOfStock)
                        badgesHTML += `<span class="badge badge--destaque">Destaque</span>`;

    // Imagem
    const imgHTML = product.image
      ? `<img class="product-card__img" src="${product.image}" alt="${esc(product.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=&quot;product-card__img-placeholder&quot;>${product.emoji}</div>'" />`
      : `<div class="product-card__img-placeholder">${product.emoji}</div>`;

    // Preço
    let priceHTML;
    if (product.isPromo && product.priceOriginal) {
      priceHTML = `
        <div class="product-card__pricing">
          <span class="product-card__price product-card__price--promo">
            ${ElChefeUtils.formatCurrency(product.price)}
          </span>
          <span class="product-card__price-original">
            ${ElChefeUtils.formatCurrency(product.priceOriginal)}
          </span>
        </div>`;
    } else {
      priceHTML = `
        <div class="product-card__pricing">
          <span class="product-card__price">
            ${ElChefeUtils.formatCurrency(product.price)}
          </span>
        </div>`;
    }

    // Estoque baixo
    const stockWarnHTML = isLowStock
      ? `<p class="product-card__stock-warn">⚠ Restam ${product.stock} unidade(s)</p>`
      : '';

    // Botão
    const btnHTML = isOutOfStock
      ? `<button class="btn btn--ghost btn--full" disabled>Esgotado</button>`
      : `<button
           class="btn btn--primary btn--full"
           data-product-id="${product.id}"
           aria-label="Adicionar ${product.name} ao carrinho"
         >
           Adicionar ao Carrinho
         </button>`;

    return `
      <li
        class="product-card${isOutOfStock ? ' product-card--out-of-stock' : ''}"
        data-product-id="${product.id}"
        data-category="${product.category}"
        role="listitem"
      >
        <div class="product-card__img-wrap">
          ${imgHTML}
          <div class="product-card__badges">${badgesHTML}</div>
        </div>
        <div class="product-card__body">
          <span class="product-card__category">${product.category}</span>
          <h3 class="product-card__name">${product.name}</h3>
          ${product.description ? `<p class="product-card__description">${product.description}</p>` : ''}
          ${priceHTML}
          ${stockWarnHTML}
        </div>
        <div class="product-card__footer">
          ${btnHTML}
        </div>
      </li>`;
  }

  /**
   * Renderiza o grid de promoções.
   */
  function renderPromo() {
    const promos = allProducts.filter(p => p.isPromo && p.stock > 0);
    const el     = promoGrid();
    if (!el) return;

    const section = document.getElementById('promo-banner');

    if (promos.length === 0) {
      if (section) section.setAttribute('hidden', '');
      return;
    }

    if (section) section.removeAttribute('hidden');
    el.innerHTML = promos.map(renderCard).join('');
  }

  /**
   * Renderiza o grid principal com filtro ativo.
   */
  function renderCatalog() {
    const el = grid();
    if (!el) return;

    const filtered = activeFilter === 'all'
      ? allProducts
      : allProducts.filter(p => p.category === activeFilter);

    const empty = emptyState();

    if (filtered.length === 0) {
      el.innerHTML = '';
      if (empty) empty.removeAttribute('hidden');
      return;
    }

    if (empty) empty.setAttribute('hidden', '');
    el.innerHTML = filtered.map(renderCard).join('');
  }

  /**
   * Atualiza o filtro ativo e re-renderiza.
   * @param {string} filter
   */
  function setFilter(filter) {
    activeFilter = filter;

    filterBtns().forEach(btn => {
      const isActive = btn.dataset.filter === filter;
      btn.classList.toggle('filter-btn--active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });

    renderCatalog();
  }

  // ── Eventos ───────────────────────────────────────────────────────────────

  function bindEvents() {
    // Filtros
    filterBtns().forEach(btn => {
      btn.addEventListener('click', () => setFilter(btn.dataset.filter));
    });

    // Delegação de clique no grid (adicionar ao carrinho)
    const grids = [grid(), promoGrid()].filter(Boolean);
    grids.forEach(g => {
      g.addEventListener('click', e => {
        const btn = e.target.closest('[data-product-id]');
        if (!btn || btn.tagName !== 'BUTTON') return;

        const productId = btn.dataset.productId;
        const product   = allProducts.find(p => p.id === productId);
        if (!product) return;

        const result = ElChefeCart.add(product);
        ElChefeUtils.showToast(
          result.message,
          result.success ? 'success' : 'error'
        );
      });
    });
  }

  // ── Inicialização ────────────────────────────────────────────────────────

  async function init() {
    allProducts = await loadProducts();
    renderPromo();
    renderCatalog();
    bindEvents();
  }

  return { init, setFilter };

})();
