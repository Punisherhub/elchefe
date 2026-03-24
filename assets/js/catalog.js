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

  // Produto aguardando seleção de variante no modal
  let pendingProduct = null;

  // Seleções atuais do cliente no modal: { nomeGrupo: opcaoEscolhida }
  let pendingSelecoes = {};

  // ── Referências DOM ──────────────────────────────────────────────────────

  const grid         = () => document.getElementById('products-grid');
  const promoGrid    = () => document.getElementById('promo-grid');
  const emptyState   = () => document.getElementById('empty-state');
  const filterBar    = () => document.getElementById('filter-bar');
  const filterBtns   = () => document.querySelectorAll('.filter-btn');
  const variantModal = () => document.getElementById('variant-modal');
  const variantList  = () => document.getElementById('variant-list');

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
      ? `<img class="product-card__img" src="${product.image}" alt="${product.name}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=&quot;product-card__img-placeholder&quot;>${product.emoji}</div>'" />`
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

    // Botão — se tem variantes, o label indica a seleção
    const hasVariants = typeof ElChefeVariants !== 'undefined' && ElChefeVariants.hasVariants(product);
    const btnLabel = hasVariants ? 'Escolher Opções' : 'Adicionar ao Carrinho';

    const btnHTML = isOutOfStock
      ? `<button class="btn btn--ghost btn--full" disabled>Esgotado</button>`
      : `<button
           class="btn btn--primary btn--full"
           data-product-id="${product.id}"
           aria-label="${btnLabel} ${product.name} ao carrinho"
         >
           ${btnLabel}
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

  // ── Modal de Variante ────────────────────────────────────────────────────

  /**
   * Abre o modal de seleção de variante para um produto.
   * Renderiza um grupo de opções por vez (ex: Sabor, depois Tamanho).
   * @param {Object} product
   */
  function openVariantModal(product) {
    const modal = variantModal();
    const list  = variantList();
    const title = document.getElementById('variant-modal-title');

    if (!modal || !list) return;

    pendingProduct  = product;
    pendingSelecoes = {};

    if (title) title.textContent = product.name;

    renderVariantGroups();

    modal.removeAttribute('hidden');
    document.body.classList.add('modal-open');

    setTimeout(() => list.querySelector('.variant-btn')?.focus(), 50);
  }

  /**
   * Renderiza os grupos de variantes no modal com base nas seleções atuais.
   */
  function renderVariantGroups() {
    const list   = variantList();
    const grupos = ElChefeVariants.getGroups(pendingProduct);
    if (!list) return;

    list.innerHTML = grupos.map(grupo => `
      <li class="variant-group" role="listitem">
        <p class="variant-group__label">${grupo.nome}</p>
        <div class="variant-group__options">
          ${grupo.opcoes.map(opcao => {
            const selecionada = pendingSelecoes[grupo.nome] === opcao;
            return `<button
              class="variant-btn${selecionada ? ' variant-btn--selected' : ''}"
              data-group="${grupo.nome}"
              data-opcao="${opcao}"
              aria-pressed="${selecionada}"
            >${opcao}</button>`;
          }).join('')}
        </div>
      </li>`).join('');

    // Botão de confirmar — aparece apenas quando todas as seleções foram feitas
    const completo = ElChefeVariants.isSelectionComplete(pendingSelecoes, grupos);
    const variantStr = completo
      ? ElChefeVariants.buildVariantString(pendingSelecoes, grupos)
      : '';

    list.insertAdjacentHTML('afterend', `
      <div id="variant-confirm-wrap">
        ${completo ? `
          <button id="btn-variant-confirm" class="btn btn--primary btn--full">
            Adicionar ao Carrinho — ${variantStr}
          </button>` : ''}
      </div>`);
  }

  /**
   * Fecha o modal de seleção de variante.
   */
  function closeVariantModal() {
    const modal = variantModal();
    if (!modal) return;
    modal.setAttribute('hidden', '');
    document.body.classList.remove('modal-open');
    pendingProduct  = null;
    pendingSelecoes = {};
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

        // Se o produto tem variantes, abre o modal de seleção
        if (typeof ElChefeVariants !== 'undefined' && ElChefeVariants.hasVariants(product)) {
          openVariantModal(product);
          return;
        }

        const result = ElChefeCart.add(product);
        ElChefeUtils.showToast(
          result.message,
          result.success ? 'success' : 'error'
        );
      });
    });

    // Modal de variante — seleção de opção em um grupo
    variantList()?.addEventListener('click', e => {
      const btn = e.target.closest('.variant-btn');
      if (!btn || !pendingProduct) return;

      const grupo = btn.dataset.group;
      const opcao = btn.dataset.opcao;
      pendingSelecoes[grupo] = opcao;

      // Re-renderiza grupos para refletir seleção e mostrar/esconder botão confirmar
      document.getElementById('variant-confirm-wrap')?.remove();
      renderVariantGroups();
    });

    // Modal de variante — confirmar seleção e adicionar ao carrinho
    variantModal()?.addEventListener('click', e => {
      // Botão confirmar (delegação pois é inserido dinamicamente)
      if (e.target.id === 'btn-variant-confirm' && pendingProduct) {
        const grupos     = ElChefeVariants.getGroups(pendingProduct);
        const variantStr = ElChefeVariants.buildVariantString(pendingSelecoes, grupos);
        const product    = Object.assign({}, pendingProduct, { variant: variantStr });

        const result = ElChefeCart.add(product);
        closeVariantModal();
        ElChefeUtils.showToast(
          result.success
            ? `"${pendingProduct.name} (${variantStr})" adicionado!`
            : result.message,
          result.success ? 'success' : 'error'
        );
        return;
      }

      // Clique no overlay (fora do dialog) fecha o modal
      if (e.target === variantModal()) closeVariantModal();
    });

    // Modal de variante — botão fechar
    document.getElementById('variant-modal-close')?.addEventListener('click', closeVariantModal);

    // Modal de variante — ESC
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && variantModal() && !variantModal().hidden) {
        closeVariantModal();
      }
    });
  }

  // ── Filtros Dinâmicos ─────────────────────────────────────────────────────

  /**
   * Gera os botões de filtro a partir das categorias presentes nos produtos.
   * Mantém o botão "Todos" fixo e adiciona um botão por categoria única.
   */
  function buildFilters(produtos) {
    const bar = filterBar();
    if (!bar) return;

    const categorias = [...new Set(
      produtos
        .map(p => p.category)
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'pt-BR'));

    // Capitaliza primeira letra para exibição
    const label = cat => cat.charAt(0).toUpperCase() + cat.slice(1);

    const botoes = categorias.map(cat => `
      <button
        class="filter-btn"
        data-filter="${cat}"
        role="tab"
        aria-selected="false"
      >${label(cat)}</button>
    `).join('');

    // Mantém o "Todos" e injeta os demais
    bar.innerHTML = `
      <button class="filter-btn filter-btn--active" data-filter="all" role="tab" aria-selected="true" aria-controls="products-panel">Todos</button>
      ${botoes}
    `;
  }

  // ── Inicialização ────────────────────────────────────────────────────────

  async function init() {
    allProducts = await loadProducts();
    buildFilters(allProducts);
    renderPromo();
    renderCatalog();
    bindEvents();
  }

  return { init, setFilter };

})();
