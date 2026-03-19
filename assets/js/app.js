/**
 * app.js — El Chefe
 *
 * Orquestrador principal: inicializa todos os módulos,
 * conecta o cart drawer ao DOM e sincroniza o estado global.
 */

'use strict';

const ElChefeApp = (() => {

  // ── Referências DOM ──────────────────────────────────────────────────────

  const cartDrawer  = () => document.getElementById('cart-drawer');
  const cartOverlay = () => document.getElementById('cart-overlay');
  const cartTrigger = () => document.getElementById('cart-trigger');
  const cartClose   = () => document.getElementById('cart-close');
  const cartBadge   = () => document.getElementById('cart-badge');
  const cartItems   = () => document.getElementById('cart-items');
  const cartEmpty   = () => document.getElementById('cart-empty');
  const cartFooter  = () => document.getElementById('cart-footer');
  const cartSubtotal= () => document.getElementById('cart-subtotal');
  const cartTotal   = () => document.getElementById('cart-total');
  const cartShip    = () => document.getElementById('cart-shipping-display');

  // ── Renderização do Cart Drawer ──────────────────────────────────────────

  function renderCartItem(item) {
    const imgHTML = item.image
      ? `<img class="cart-item__img" src="${item.image}" alt="${item.name}" loading="lazy" />`
      : `<div class="cart-item__img-placeholder">${item.emoji}</div>`;

    const subtotal = item.price * item.quantity;

    return `
      <li class="cart-item" data-item-id="${item.id}">
        ${imgHTML}
        <div class="cart-item__info">
          <p class="cart-item__name">${item.name}</p>
          <p class="cart-item__price-unit">${ElChefeUtils.formatCurrency(item.price)} / un.</p>
          <div class="cart-item__qty">
            <button
              class="qty-btn"
              data-action="decrease"
              data-id="${item.id}"
              aria-label="Diminuir quantidade de ${item.name}"
            >−</button>
            <span class="qty-value" aria-label="Quantidade: ${item.quantity}">${item.quantity}</span>
            <button
              class="qty-btn"
              data-action="increase"
              data-id="${item.id}"
              aria-label="Aumentar quantidade de ${item.name}"
            >+</button>
          </div>
          <div class="cart-item__remove">
            <button class="btn btn--danger" data-action="remove" data-id="${item.id}" aria-label="Remover ${item.name}">
              Remover
            </button>
          </div>
        </div>
        <span class="cart-item__subtotal">${ElChefeUtils.formatCurrency(subtotal)}</span>
      </li>`;
  }

  function updateCartUI(items) {
    const il = cartItems();
    const ce = cartEmpty();
    const cf = cartFooter();

    if (!il) return;

    if (!items || items.length === 0) {
      il.innerHTML = '';
      if (ce) ce.removeAttribute('hidden');
      if (cf) cf.setAttribute('hidden', '');
    } else {
      il.innerHTML = items.map(renderCartItem).join('');
      if (ce) ce.setAttribute('hidden', '');
      if (cf) cf.removeAttribute('hidden');
    }

    // Totais
    const subtotal = ElChefeCart.getSubtotal();
    const shipping = ElChefeCart.getShipping();
    const total    = ElChefeCart.getTotal();

    const cs = cartSubtotal();
    const ct = cartTotal();
    const csh= cartShip();

    if (cs)  cs.textContent  = ElChefeUtils.formatCurrency(subtotal);
    if (csh) csh.textContent = shipping === null ? '—' : (shipping === 0 ? 'GRÁTIS' : ElChefeUtils.formatCurrency(shipping));
    if (ct)  ct.innerHTML    = `<strong>${ElChefeUtils.formatCurrency(total)}</strong>`;
  }

  function updateBadge(count) {
    const badge = cartBadge();
    if (!badge) return;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';

    // Micro-animação de "bump"
    badge.classList.remove('badge-bump');
    void badge.offsetWidth; // reflow
    badge.classList.add('badge-bump');
  }

  // ── Drawer Actions ───────────────────────────────────────────────────────

  function openCart() {
    const drawer = cartDrawer();
    if (!drawer) return;
    ElChefeUtils.openOverlay(drawer);
    cartTrigger()?.setAttribute('aria-expanded', 'true');
    document.dispatchEvent(new CustomEvent('cart:opened'));

    // Foco no primeiro elemento interativo dentro do drawer
    setTimeout(() => {
      const firstFocusable = drawer.querySelector('button, a, [tabindex]');
      firstFocusable?.focus();
    }, 100);
  }

  function closeCart() {
    const drawer = cartDrawer();
    if (!drawer) return;
    ElChefeUtils.closeOverlay(drawer);
    cartTrigger()?.setAttribute('aria-expanded', 'false');
    cartTrigger()?.focus();
    document.dispatchEvent(new CustomEvent('cart:closed'));
  }

  // ── Delegação de eventos do Cart ─────────────────────────────────────────

  function bindCartItemEvents() {
    cartItems()?.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const id     = btn.dataset.id;
      const action = btn.dataset.action;

      switch (action) {
        case 'remove': {
          const name = ElChefeCart.remove(id);
          if (name) ElChefeUtils.showToast(`"${name}" removido do carrinho.`, 'info');
          break;
        }
        case 'increase': {
          const item = ElChefeCart.getAll().find(i => i.id === id);
          if (!item) break;
          const result = ElChefeCart.updateQty(id, item.quantity + 1);
          if (!result.success && result.message) {
            ElChefeUtils.showToast(result.message, 'error');
          }
          break;
        }
        case 'decrease': {
          const item = ElChefeCart.getAll().find(i => i.id === id);
          if (!item) break;
          ElChefeCart.updateQty(id, item.quantity - 1);
          break;
        }
      }
    });
  }

  // ── Smooth Scroll para âncoras ────────────────────────────────────────────

  function bindSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener('click', e => {
        const targetId = link.getAttribute('href').slice(1);
        const target   = document.getElementById(targetId);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  // ── Header Scroll Effect ──────────────────────────────────────────────────

  function bindHeaderScroll() {
    const header = document.getElementById('header');
    if (!header) return;

    const onScroll = ElChefeUtils.debounce(() => {
      header.classList.toggle('header--scrolled', window.scrollY > 20);
    }, 50);

    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ── ESC fecha Cart Drawer ─────────────────────────────────────────────────

  function bindKeyboard() {
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !cartDrawer()?.hidden) {
        closeCart();
      }
    });
  }

  // ── Inicialização ─────────────────────────────────────────────────────────

  function init() {
    // Sincroniza UI com estado salvo do carrinho
    updateCartUI(ElChefeCart.getAll());
    updateBadge(ElChefeCart.getCount());

    // Eventos do Drawer
    cartTrigger()?.addEventListener('click', openCart);
    cartClose()?.addEventListener('click', closeCart);
    cartOverlay()?.addEventListener('click', closeCart);

    bindCartItemEvents();
    bindSmoothScroll();
    bindHeaderScroll();
    bindKeyboard();

    // Escuta evento global 'cart:updated'
    document.addEventListener('cart:updated', e => {
      const { items, count } = e.detail;
      updateCartUI(items);
      updateBadge(count);
    });

    // Inicializa módulos filhos
    ElChefeCatalog.init();
    ElChefeCheckout.init();

    console.log('[ElChefe] App iniciado ✓');
  }

  // Aguarda o DOM estar pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { openCart, closeCart };

})();
