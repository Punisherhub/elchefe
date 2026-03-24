/**
 * admin.js — El Chefe Admin Panel
 *
 * Gerencia produtos armazenados em localStorage.
 * O catálogo principal (pdv-api.js) lê os mesmos dados
 * automaticamente quando o PDV não está ativo.
 *
 * Acesso: /admin.html  |  Senha padrão: elchefe@admin
 */

'use strict';

const ElChefeAdmin = (() => {

  // ── Constantes ──────────────────────────────────────────────────────────────

  const KEY_PRODUCTS   = 'elchefe_products';
  const KEY_PASS       = 'elchefe_admin_hash';
  const KEY_SESSION    = 'elchefe_admin_session';
  const KEY_PDV_IMAGES = 'elchefe_pdv_images';
  const DEFAULT_PASS   = 'elchefe@admin';

  const CATEGORIES = [
    'destilados','whisky','vodka','gin','rum','tequila',
    'cervejas','vinhos','espumante','bebidas','energetico',
    'agua','tabacaria','cigarro','narguilé','tabaco','snacks',
  ];

  const EMOJI_MAP = {
    destilados:'🥃', whisky:'🥃',  vodka:'🍶',  gin:'🍸',
    rum:'🍹',        tequila:'🥂', cervejas:'🍺', cerveja:'🍺',
    vinhos:'🍷',     vinho:'🍷',   espumante:'🥂', bebidas:'🥤',
    energetico:'⚡', agua:'💧',    tabacaria:'🚬', cigarro:'🚬',
    'narguilé':'🪔', tabaco:'🍃',  snacks:'🍿',
  };

  // ── Estado ──────────────────────────────────────────────────────────────────

  let products      = [];
  let editingId     = null;
  let filterText    = '';
  let filterCat     = 'all';
  let toastTimer    = null;

  // ── DOM helpers ─────────────────────────────────────────────────────────────

  const $  = id  => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  // ── Crypto (SHA-256 via Web Crypto API) ─────────────────────────────────────

  async function sha256(message) {
    const buf  = new TextEncoder().encode(message);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async function verifyPassword(input) {
    const inputHash = await sha256(input);
    const stored    = localStorage.getItem(KEY_PASS);

    if (!stored) {
      // Primeiro acesso: aceita a senha padrão e armazena o hash
      const defaultHash = await sha256(DEFAULT_PASS);
      if (inputHash === defaultHash) {
        localStorage.setItem(KEY_PASS, defaultHash);
        return true;
      }
      return false;
    }

    return inputHash === stored;
  }

  async function changePassword(current, next) {
    if (!(await verifyPassword(current))) return false;
    localStorage.setItem(KEY_PASS, await sha256(next));
    return true;
  }

  // ── Sessão ──────────────────────────────────────────────────────────────────

  const isLoggedIn = () => sessionStorage.getItem(KEY_SESSION) === '1';

  function setLoggedIn(val) {
    if (val) sessionStorage.setItem(KEY_SESSION, '1');
    else     sessionStorage.removeItem(KEY_SESSION);
  }

  // ── Storage ─────────────────────────────────────────────────────────────────

  function loadProducts() {
    try {
      const raw = localStorage.getItem(KEY_PRODUCTS);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }

  function saveProducts(list) {
    try {
      localStorage.setItem(KEY_PRODUCTS, JSON.stringify(list));
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        showToast('Armazenamento cheio. Remova imagens grandes ou produtos antigos.', 'error');
      }
      throw e;
    }
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function emojiFor(cat) {
    return EMOJI_MAP[(cat ?? '').toLowerCase()] ?? '📦';
  }

  function buildProduct(fd, existingId) {
    const basePrice = parseFloat(fd.price) || 0;
    const hasPromo  = fd.isPromo && fd.promoPrice && parseFloat(fd.promoPrice) > 0;
    const promoVal  = hasPromo ? parseFloat(fd.promoPrice) : null;

    return {
      id:            existingId || generateId(),
      name:          fd.name.trim(),
      slug:          fd.name.trim().toLowerCase().replace(/\s+/g, '-'),
      category:      (fd.category || 'bebidas').toLowerCase(),
      description:   (fd.description || '').trim(),
      price:         hasPromo ? promoVal : basePrice,
      priceOriginal: hasPromo ? basePrice : null,
      isPromo:       hasPromo,
      isFeatured:    !!fd.isFeatured,
      stock:         parseInt(fd.stock, 10) || 0,
      image:         fd.image || null,
      emoji:         emojiFor(fd.category),
    };
  }

  // ── Telas ───────────────────────────────────────────────────────────────────

  function showLogin() {
    $('login-screen').hidden = false;
    $('admin-panel').hidden  = true;
    setTimeout(() => $('login-pass').focus(), 50);
  }

  function showPanel() {
    $('login-screen').hidden = true;
    $('admin-panel').hidden  = false;
    renderList();
  }

  // ── Toast ───────────────────────────────────────────────────────────────────

  function showToast(msg, type = 'success') {
    const t = $('admin-toast');
    t.textContent = msg;
    t.className   = `admin-toast admin-toast--${type} admin-toast--show`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('admin-toast--show'), 3500);
  }

  // ── Escape HTML ─────────────────────────────────────────────────────────────

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Renderização da tabela ───────────────────────────────────────────────────

  function filteredProducts() {
    const q = filterText.toLowerCase();
    return products.filter(p => {
      const matchText = !q
        || p.name.toLowerCase().includes(q)
        || p.category.toLowerCase().includes(q)
        || (p.description || '').toLowerCase().includes(q);
      const matchCat = filterCat === 'all' || p.category === filterCat;
      return matchText && matchCat;
    });
  }

  function renderList() {
    const tbody = $('product-table-body');
    if (!tbody) return;

    const list = filteredProducts();
    const counter = $('product-count');
    if (counter) counter.textContent = `${products.length} produto(s) cadastrado(s)`;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-empty">
        ${products.length === 0
          ? 'Nenhum produto cadastrado. Clique em <strong>+ Novo Produto</strong> para começar.'
          : 'Nenhum produto encontrado para esta busca.'}
      </td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(p => {
      const imgCell = p.image
        ? `<img class="thumb" src="${esc(p.image)}" alt="${esc(p.name)}">`
        : `<span class="thumb-emoji">${p.emoji}</span>`;

      const stockBadge = p.stock === 0
        ? `<span class="badge badge-esg">Esgotado</span>`
        : p.stock <= 3
          ? `<span class="badge badge-low">⚠ ${p.stock}</span>`
          : `<span class="badge badge-ok">${p.stock}</span>`;

      const flags = [
        p.isPromo    ? `<span class="flag flag-promo">Promo</span>`    : '',
        p.isFeatured ? `<span class="flag flag-dest">Destaque</span>`  : '',
      ].join('');

      const priceCell = p.isPromo && p.priceOriginal != null
        ? `<s class="price-orig">R$ ${p.priceOriginal.toFixed(2).replace('.',',')}</s>
           R$ ${p.price.toFixed(2).replace('.',',')}`
        : `R$ ${p.price.toFixed(2).replace('.',',')}`;

      return `
        <tr data-id="${esc(p.id)}">
          <td class="td-img">${imgCell}</td>
          <td class="td-name">
            <strong>${esc(p.name)}</strong><br>
            <small>${esc(p.category)}</small>
          </td>
          <td class="td-desc">${esc(p.description)}</td>
          <td class="td-price">${priceCell}</td>
          <td class="td-stock">${stockBadge}</td>
          <td class="td-flags">${flags}</td>
          <td class="td-actions">
            <button class="btn-edit" data-id="${esc(p.id)}" title="Editar">✏️</button>
            <button class="btn-del"  data-id="${esc(p.id)}" title="Excluir">🗑️</button>
          </td>
        </tr>`;
    }).join('');
  }

  // ── Modal ────────────────────────────────────────────────────────────────────

  function openModal(product) {
    editingId = product?.id ?? null;
    $('modal-title').textContent = editingId ? 'Editar Produto' : 'Novo Produto';

    $('product-form').reset();
    clearImagePreview();

    if (product) {
      $('field-name').value        = product.name;
      $('field-category').value    = product.category;
      $('field-description').value = product.description ?? '';
      $('field-stock').value       = product.stock;
      $('field-featured').checked  = !!product.isFeatured;
      $('field-promo').checked     = !!product.isPromo;

      if (product.isPromo && product.priceOriginal != null) {
        $('field-price').value       = product.priceOriginal;
        $('field-promo-price').value = product.price;
      } else {
        $('field-price').value = product.price;
      }

      if (product.image) {
        $('img-base64').value        = product.image;
        $('img-preview').innerHTML   = `<img src="${esc(product.image)}" alt="preview">`;
        $('img-preview').hidden      = false;
      }
    }

    togglePromoField();

    $('product-modal').hidden = false;
    document.body.classList.add('modal-open');
    $('field-name').focus();
  }

  function closeModal() {
    $('product-modal').hidden = true;
    document.body.classList.remove('modal-open');
    editingId = null;
  }

  function togglePromoField() {
    $('promo-price-wrap').hidden = !$('field-promo').checked;
  }

  // ── Submissão do formulário ──────────────────────────────────────────────────

  function handleFormSubmit(e) {
    e.preventDefault();

    const fd = {
      name:        $('field-name').value,
      category:    $('field-category').value,
      description: $('field-description').value,
      price:       $('field-price').value,
      promoPrice:  $('field-promo-price').value,
      stock:       $('field-stock').value,
      isPromo:     $('field-promo').checked,
      isFeatured:  $('field-featured').checked,
      image:       $('img-base64').value.trim() || null,
    };

    if (!fd.name.trim()) {
      showToast('O nome do produto é obrigatório.', 'error');
      $('field-name').focus();
      return;
    }
    if (!fd.price || isNaN(parseFloat(fd.price)) || parseFloat(fd.price) < 0) {
      showToast('Informe um preço válido.', 'error');
      $('field-price').focus();
      return;
    }
    if (fd.isPromo && (!fd.promoPrice || isNaN(parseFloat(fd.promoPrice)))) {
      showToast('Informe o preço promocional.', 'error');
      $('field-promo-price').focus();
      return;
    }

    try {
      const product = buildProduct(fd, editingId);

      if (editingId) {
        const idx = products.findIndex(p => p.id === editingId);
        if (idx >= 0) products[idx] = product;
      } else {
        products.unshift(product);
      }

      saveProducts(products);
      renderList();
      closeModal();
      showToast(editingId ? 'Produto atualizado com sucesso!' : 'Produto adicionado!');
    } catch (_) {
      // saveProducts já exibiu o toast de erro de quota
    }
  }

  // ── Imagens ──────────────────────────────────────────────────────────────────

  function clearImagePreview() {
    $('img-base64').value      = '';
    $('img-preview').innerHTML = '';
    $('img-preview').hidden    = true;
    $('img-file-input').value  = '';
  }

  function handleImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Arquivo inválido. Use JPG, PNG ou WebP.', 'error');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      showToast('Imagem muito grande (máx 4 MB).', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = e => resizeImage(e.target.result, 640, dataUrl => {
      $('img-base64').value      = dataUrl;
      $('img-preview').innerHTML = `<img src="${dataUrl}" alt="preview">`;
      $('img-preview').hidden    = false;
    });
    reader.readAsDataURL(file);
  }

  function resizeImage(dataUrl, maxSide, callback) {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxSide || h > maxSide) {
        if (w >= h) { h = Math.round(h * maxSide / w); w = maxSide; }
        else        { w = Math.round(w * maxSide / h); h = maxSide; }
      }
      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.src = dataUrl;
  }

  function handleImageUrl() {
    const url = prompt('Cole a URL da imagem (https://...):');
    if (!url || !url.trim()) return;
    const clean = url.trim();
    $('img-base64').value      = clean;
    $('img-preview').innerHTML = `<img src="${esc(clean)}" alt="preview" onerror="this.parentElement.hidden=true">`;
    $('img-preview').hidden    = false;
  }

  // ── Exclusão ────────────────────────────────────────────────────────────────

  function handleDelete(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    if (!confirm(`Excluir "${p.name}"?\n\nEsta ação não pode ser desfeita.`)) return;
    products = products.filter(x => x.id !== id);
    saveProducts(products);
    renderList();
    showToast('Produto excluído.', 'info');
  }

  // ── Alterar senha ────────────────────────────────────────────────────────────

  async function handleChangePassword(e) {
    e.preventDefault();
    const current = $('pass-current').value;
    const next    = $('pass-new').value;
    const confirm = $('pass-confirm').value;

    if (next !== confirm) {
      showToast('As senhas novas não coincidem.', 'error');
      return;
    }
    if (next.length < 6) {
      showToast('A nova senha deve ter pelo menos 6 caracteres.', 'error');
      return;
    }

    const btn = e.submitter;
    btn.disabled = true;
    const ok = await changePassword(current, next);
    btn.disabled = false;

    if (ok) {
      showToast('Senha alterada com sucesso!');
      $('pass-form').reset();
      $('pass-section').hidden = true;
    } else {
      showToast('Senha atual incorreta.', 'error');
      $('pass-current').focus();
    }
  }

  // ── Export / Import ──────────────────────────────────────────────────────────

  function exportProducts() {
    const json = JSON.stringify(products, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url,
      download: `elchefe-produtos-${new Date().toISOString().slice(0, 10)}.json`,
    });
    a.click();
    URL.revokeObjectURL(url);
    showToast(`${products.length} produto(s) exportado(s).`);
  }

  function importProducts(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const list = JSON.parse(e.target.result);
        if (!Array.isArray(list)) throw new Error('Formato inválido');
        if (!confirm(`Importar ${list.length} produto(s)?\n\nIsso substituirá completamente a lista atual.`)) return;
        products = list;
        saveProducts(products);
        renderList();
        showToast(`${list.length} produto(s) importado(s) com sucesso!`);
      } catch (_) {
        showToast('Arquivo inválido. Use um JSON exportado por este painel.', 'error');
      }
    };
    reader.readAsText(file);
  }

  // ── Tabs ─────────────────────────────────────────────────────────────────────

  function switchTab(tabName) {
    // Atualiza botões
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('tab-btn--active', btn.dataset.tab === tabName);
      btn.setAttribute('aria-selected', btn.dataset.tab === tabName);
    });

    // Mostra/oculta seções
    const mainSection = $('product-table-body')?.closest('.table-wrap');
    const toolbar     = document.querySelector('.toolbar');
    const pdvSection  = $('section-pdv-images');

    if (tabName === 'produtos') {
      if (toolbar)     toolbar.hidden     = false;
      if (mainSection) mainSection.hidden = false;
      if (pdvSection)  pdvSection.hidden  = true;
    } else {
      if (toolbar)     toolbar.hidden     = true;
      if (mainSection) mainSection.hidden = true;
      if (pdvSection)  pdvSection.hidden  = false;
      loadPdvImagesSection();
    }
  }

  // ── PDV Images ────────────────────────────────────────────────────────────────

  let pdvUploadTargetId = null; // ID do produto PDV aguardando upload
  let pdvProductsList   = [];   // cache dos produtos PDV

  function loadPdvImageMap() {
    try { return JSON.parse(localStorage.getItem(KEY_PDV_IMAGES) || '{}'); }
    catch (_) { return {}; }
  }

  function savePdvImageMap(map) {
    localStorage.setItem(KEY_PDV_IMAGES, JSON.stringify(map));
  }

  async function loadPdvImagesSection() {
    const grid = $('pdv-img-grid');
    if (!grid) return;

    // Se já tem produtos em cache, só re-renderiza
    if (pdvProductsList.length > 0) {
      renderPdvImageGrid();
      return;
    }

    grid.innerHTML = `<p class="pdv-img-loading">Carregando produtos do PDV...</p>`;

    try {
      if (typeof ElChefePDV === 'undefined') {
        grid.innerHTML = `<p class="pdv-img-loading">Módulo PDV não carregado. Abra o admin a partir do site.</p>`;
        return;
      }
      const resultado  = await ElChefePDV.fetchProdutos();
      pdvProductsList  = resultado.produtos;
      renderPdvImageGrid();
    } catch (_) {
      grid.innerHTML = `<p class="pdv-img-loading">Erro ao carregar produtos do PDV. Verifique a conexão.</p>`;
    }
  }

  function renderPdvImageGrid() {
    const grid = $('pdv-img-grid');
    if (!grid) return;

    const map = loadPdvImageMap();

    if (pdvProductsList.length === 0) {
      grid.innerHTML = `<p class="pdv-img-loading">Nenhum produto encontrado no PDV.</p>`;
      return;
    }

    grid.innerHTML = pdvProductsList.map(p => {
      const imgSrc = map[String(p.id)] ?? p.image ?? null;
      const preview = imgSrc
        ? `<img src="${esc(imgSrc)}" alt="${esc(p.name)}">`
        : `<span class="pdv-img-placeholder">${p.emoji}</span>`;

      const removeBtn = imgSrc
        ? `<button class="btn-ghost btn-sm btn-danger-ghost btn-pdv-remove" data-id="${esc(p.id)}" title="Remover imagem">🗑</button>`
        : '';

      return `
        <div class="pdv-img-card" data-id="${esc(p.id)}">
          <div class="pdv-img-preview">${preview}</div>
          <div class="pdv-img-info">
            <strong>${esc(p.name)}</strong>
            <small>ID: ${esc(p.id)} · ${esc(p.category || 'sem categoria')} · R$ ${p.price?.toFixed(2).replace('.',',')}</small>
          </div>
          <div class="pdv-img-actions">
            <button class="btn-primary btn-sm btn-pdv-upload" data-id="${esc(p.id)}">📷 Upload</button>
            <button class="btn-ghost btn-sm btn-pdv-url"      data-id="${esc(p.id)}">🔗 URL</button>
            ${removeBtn}
          </div>
        </div>`;
    }).join('');
  }

  async function handlePdvImageFile(file, productId) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Arquivo inválido. Use JPG, PNG ou WebP.', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('Imagem muito grande (máx 10 MB).', 'error');
      return;
    }

    const cloudName = window.ElChefeConfig?.CLOUDINARY_CLOUD_NAME;
    const preset    = window.ElChefeConfig?.CLOUDINARY_UPLOAD_PRESET;
    if (!cloudName || !preset) {
      showToast('Cloudinary não configurado.', 'error');
      return;
    }

    showToast('Enviando imagem...');

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('upload_preset', preset);
      form.append('public_id', `elchefe-pdv-${productId}`);

      const res  = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: form,
      });
      const json = await res.json();

      if (json.error) throw new Error(json.error.message);

      const map = loadPdvImageMap();
      map[String(productId)] = json.secure_url;
      savePdvImageMap(map);

      // Atualiza cache em memória para re-render imediato
      const cached = pdvProductsList.find(x => String(x.id) === String(productId));
      if (cached) cached.image = json.secure_url;

      renderPdvImageGrid();
      showToast('Imagem salva!');
    } catch (err) {
      showToast(`Falha no upload: ${err.message}`, 'error');
    }
  }

  function handlePdvImageUrl(productId) {
    const url = prompt('Cole a URL da imagem (https://...):');
    if (!url?.trim()) return;
    const map = loadPdvImageMap();
    map[String(productId)] = url.trim();
    savePdvImageMap(map);

    // Atualiza cache em memória para re-render imediato
    const cached = pdvProductsList.find(x => String(x.id) === String(productId));
    if (cached) cached.image = url.trim();

    renderPdvImageGrid();
    showToast('Imagem salva!');
  }

  function handlePdvImageRemove(productId) {
    const p = pdvProductsList.find(x => String(x.id) === String(productId));
    if (!confirm(`Remover imagem de "${p?.name ?? productId}"?`)) return;

    // Marca como removida explicitamente (null = sem imagem, sem fallback Cloudinary)
    const map = loadPdvImageMap();
    map[String(productId)] = null;
    savePdvImageMap(map);

    // Limpa também no cache em memória para o re-render refletir imediatamente
    if (p) p.image = null;

    renderPdvImageGrid();
    showToast('Imagem removida.', 'info');

    // Tenta remover do Cloudinary via proxy — falha silenciosa se não houver servidor Express
    fetch('/api/cloudinary/delete', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ productId }),
    }).catch(() => {});
  }

  // ── Binding de eventos ───────────────────────────────────────────────────────

  function bindEvents() {

    // ─ Login
    $('login-form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('login-btn');
      btn.disabled    = true;
      btn.textContent = 'Verificando...';

      const ok = await verifyPassword($('login-pass').value);

      btn.disabled    = false;
      btn.textContent = 'Entrar';

      if (ok) {
        setLoggedIn(true);
        $('login-error').hidden = true;
        showPanel();
      } else {
        $('login-error').hidden = false;
        $('login-pass').value   = '';
        $('login-pass').focus();
      }
    });

    // ─ Logout
    $('btn-logout').addEventListener('click', () => {
      setLoggedIn(false);
      showLogin();
    });

    // ─ Novo produto
    $('btn-add').addEventListener('click', () => openModal(null));

    // ─ Editar / excluir (delegação na tabela)
    $('product-table-body').addEventListener('click', e => {
      const edit = e.target.closest('.btn-edit');
      const del  = e.target.closest('.btn-del');
      if (edit) {
        const p = products.find(x => x.id === edit.dataset.id);
        if (p) openModal(p);
      }
      if (del) handleDelete(del.dataset.id);
    });

    // ─ Modal
    $('modal-close').addEventListener('click', closeModal);
    $('modal-cancel').addEventListener('click', closeModal);
    $('product-modal').addEventListener('click', e => {
      if (e.target === $('product-modal')) closeModal();
    });

    // ─ Formulário
    $('product-form').addEventListener('submit', handleFormSubmit);
    $('field-promo').addEventListener('change', togglePromoField);

    // ─ Upload de imagem
    const dropzone = $('img-dropzone');
    dropzone.addEventListener('click', () => $('img-file-input').click());
    dropzone.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('img-file-input').click(); }
    });
    dropzone.addEventListener('dragover', e => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) handleImageFile(file);
    });
    $('img-file-input').addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) handleImageFile(file);
      e.target.value = '';
    });
    $('btn-img-url').addEventListener('click', handleImageUrl);
    $('btn-img-remove').addEventListener('click', clearImagePreview);

    // ─ Busca e filtro
    $('search-input').addEventListener('input', e => {
      filterText = e.target.value.trim();
      renderList();
    });
    $('cat-filter').addEventListener('change', e => {
      filterCat = e.target.value;
      renderList();
    });

    // ─ Export / Import
    $('btn-export').addEventListener('click', exportProducts);
    $('btn-import').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) importProducts(file);
      e.target.value = '';
    });

    // ─ Alterar senha
    $('btn-change-pass').addEventListener('click', () => {
      $('pass-section').hidden = !$('pass-section').hidden;
      if (!$('pass-section').hidden) $('pass-current').focus();
    });
    $('pass-form').addEventListener('submit', handleChangePassword);
    $('pass-cancel').addEventListener('click', () => {
      $('pass-section').hidden = true;
      $('pass-form').reset();
    });

    // ─ ESC fecha modal
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
    });

    // ─ Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // ─ PDV Images — grid (delegação)
    $('pdv-img-grid').addEventListener('click', e => {
      const upload = e.target.closest('.btn-pdv-upload');
      const url    = e.target.closest('.btn-pdv-url');
      const remove = e.target.closest('.btn-pdv-remove');

      if (upload) {
        pdvUploadTargetId = upload.dataset.id;
        $('pdv-img-file-input').value = '';
        $('pdv-img-file-input').click();
      }
      if (url)    handlePdvImageUrl(url.dataset.id);
      if (remove) handlePdvImageRemove(remove.dataset.id);
    });

    // ─ PDV Images — file input
    $('pdv-img-file-input').addEventListener('change', e => {
      const file = e.target.files[0];
      if (file && pdvUploadTargetId) handlePdvImageFile(file, pdvUploadTargetId);
      e.target.value = '';
    });

    // ─ PDV Images — recarregar
    $('btn-reload-pdv').addEventListener('click', () => {
      pdvProductsList = [];
      loadPdvImagesSection();
    });
  }

  // ── Inicialização ────────────────────────────────────────────────────────────

  function init() {
    // Popula filtro de categorias
    const catFilter = $('cat-filter');
    CATEGORIES.forEach(c => {
      const opt = document.createElement('option');
      opt.value       = c;
      opt.textContent = c.charAt(0).toUpperCase() + c.slice(1);
      catFilter.appendChild(opt);
    });

    products = loadProducts();

    if (isLoggedIn()) {
      showPanel();
    } else {
      showLogin();
    }

    bindEvents();
  }

  return { init };

})();

document.addEventListener('DOMContentLoaded', ElChefeAdmin.init);
