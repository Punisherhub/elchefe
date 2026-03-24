/**
 * checkout.js — El Chefe
 *
 * Módulo de checkout multi-etapa:
 *   Step 1 → Dados do cliente + cálculo de frete
 *   Step 2 → Método de pagamento
 *   Step 3 → Confirmação + envio da Guia de Separação
 *
 * INTEGRAÇÕES:
 *   - Webhook (Make.com / Zapier): configure WEBHOOK_URL abaixo.
 *   - WhatsApp: configure WHATSAPP_NUMBER com DDI + número (ex: "5542999990000").
 *   - Webflow CMS — abate de estoque: configure WEBFLOW_API_TOKEN e COLLECTION_ID.
 *
 * Para usar com Webflow Logic, substitua `sendOrder()` por uma chamada
 * ao endpoint do Webflow Logic que dispara o e-mail/webhook.
 */

'use strict';

const ElChefeCheckout = (() => {

  // ── Configuração ─────────────────────────────────────────────────────────

  // Configurações lidas do config.js centralizado
  const whatsappNumber = () =>
    window.ElChefeConfig?.WHATSAPP_NUMBER ?? '5542900000000';

  // ── Estado do Checkout ───────────────────────────────────────────────────

  let currentStep    = 1;
  let customerData   = {};
  let shippingResult = null;
  let paymentMethod  = 'pix';

  // ── Referências DOM ──────────────────────────────────────────────────────

  const modal       = () => document.getElementById('checkout-modal');
  const stepEls     = () => document.querySelectorAll('.checkout-step');
  const btnCheckout = () => document.getElementById('btn-checkout');

  // Formulário Step 1
  const formCustomer = () => document.getElementById('form-customer');
  const fieldName    = () => document.getElementById('field-name');
  const fieldPhone   = () => document.getElementById('field-phone');
  const fieldCep     = () => document.getElementById('field-cep');
  const fieldAddress = () => document.getElementById('field-address');
  const fieldComplem = () => document.getElementById('field-complement');
  const fieldNotes   = () => document.getElementById('field-notes');
  const btnCalcShip  = () => document.getElementById('btn-calc-shipping');
  const shippingRes  = () => document.getElementById('shipping-result');
  const shipValueEl  = () => document.getElementById('shipping-value-display');
  const infoCep      = () => document.getElementById('info-cep');

  // Formulário Step 2
  const formPayment  = () => document.getElementById('form-payment');
  const changeGroup  = () => document.getElementById('change-group');

  // Step 3 / Confirmação
  const confirmMsg   = () => document.getElementById('confirm-msg');
  const confirmSum   = () => document.getElementById('confirm-summary');
  const confirmWpp   = () => document.getElementById('confirm-whatsapp');

  // ── Helpers de Validação ─────────────────────────────────────────────────

  function setError(fieldId, msg) {
    const el = document.getElementById(`err-${fieldId}`);
    if (el) el.textContent = msg;
    const input = document.getElementById(`field-${fieldId}`);
    if (input) input.classList.toggle('input--error', !!msg);
  }

  function clearErrors() {
    document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
    document.querySelectorAll('.input--error').forEach(el => el.classList.remove('input--error'));
  }

  function validateStep1() {
    clearErrors();
    let valid = true;

    const name = fieldName()?.value.trim();
    if (!name || name.length < 3) {
      setError('name', 'Informe seu nome completo.');
      valid = false;
    }

    const phone = ElChefeUtils.onlyDigits(fieldPhone()?.value ?? '');
    if (phone.length !== 10) {
      setError('phone', 'Informe um telefone válido com DDD (ex: 42 3333-4444).');
      valid = false;
    }

    const cep = ElChefeUtils.onlyDigits(fieldCep()?.value ?? '');
    if (cep.length !== 8) {
      setError('cep', 'Informe um CEP válido com 8 dígitos.');
      valid = false;
    }

    if (!shippingResult) {
      setError('cep', 'Clique em "Calcular Frete" antes de continuar.');
      valid = false;
    }

    const address = fieldAddress()?.value.trim();
    if (!address || address.length < 5) {
      setError('address', 'Informe o endereço de entrega.');
      valid = false;
    }

    return valid;
  }

  // ── Navegação entre Steps ─────────────────────────────────────────────────

  function goToStep(step) {
    currentStep = step;
    stepEls().forEach(el => {
      const stepNum = parseInt(el.dataset.step, 10);
      el.hidden = stepNum !== step;
    });
  }

  // ── Cálculo de Frete ──────────────────────────────────────────────────────

  async function handleCalcShipping() {
    const btn = btnCalcShip();
    const cep = fieldCep()?.value;

    if (!cep || ElChefeUtils.onlyDigits(cep).length !== 8) {
      setError('cep', 'Informe um CEP válido (8 dígitos).');
      return;
    }

    clearErrors();
    btn.classList.add('btn--loading');
    btn.disabled = true;

    try {
      const orderTotal = ElChefeCart.getSubtotal();
      const result     = await ElChefeShipping.calculate(cep, orderTotal);

      if (!result.success) {
        setError('cep', result.error);
        shippingResult = null;
        ElChefeCart.setShipping(null);
        const sr = shippingRes();
        if (sr) sr.hidden = true;
        return;
      }

      shippingResult = result;
      ElChefeCart.setShipping(result.fee);

      // Exibe resultado
      const sr  = shippingRes();
      const svd = shipValueEl();
      if (sr && svd) {
        svd.textContent = result.fee === 0
          ? 'GRÁTIS 🎉'
          : ElChefeUtils.formatCurrency(result.fee);
        sr.hidden = false;
      }

      // Info contextual
      const ic = infoCep();
      if (ic) ic.textContent = '';

      // Auto-preenche cidade/bairro se ViaCEP retornou
      if (result.city && result.address) {
        const addr = fieldAddress();
        if (addr && !addr.value) {
          addr.value = result.address;
        }
      }

      ElChefeUtils.showToast(`Frete calculado: ${
        result.fee === 0 ? 'Grátis!' : ElChefeUtils.formatCurrency(result.fee)
      }`, 'success');

    } finally {
      btn.classList.remove('btn--loading');
      btn.disabled = false;
    }
  }

  // ── Coleta dados do cliente ───────────────────────────────────────────────

  function collectCustomerData() {
    customerData = {
      name:       fieldName()?.value.trim(),
      phone:      ElChefeUtils.onlyDigits(fieldPhone()?.value ?? ''),
      cep:        ElChefeUtils.onlyDigits(fieldCep()?.value ?? ''),
      address:    fieldAddress()?.value.trim(),
      complement: fieldComplem()?.value.trim(),
      notes:      fieldNotes()?.value.trim(),
      zone:       shippingResult?.zone ?? '',
      city:       shippingResult?.city ?? 'Ponta Grossa',
    };
  }

  // ── Geração da Guia de Separação ──────────────────────────────────────────

  /**
   * Formata o pedido como texto para o operador da loja.
   * Usado tanto para o dashboard interno quanto para o WhatsApp.
   * @returns {string}
   */
  function buildOrderSummary() {
    const now   = new Date().toLocaleString('pt-BR');
    const items = ElChefeCart.getAll();

    let text = `🗂 GUIA DE SEPARAÇÃO — EL CHEFE\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📅 ${now}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    text += `👤 CLIENTE\n`;
    text += `Nome:     ${customerData.name}\n`;
    text += `Telefone: (${customerData.phone.slice(0,2)}) ${customerData.phone.slice(2,6)}-${customerData.phone.slice(6)}\n`;
    text += `CEP:      ${customerData.cep.slice(0,5)}-${customerData.cep.slice(5)}\n`;
    text += `Endereço: ${customerData.address}${customerData.complement ? ', ' + customerData.complement : ''}\n`;
    if (customerData.notes) text += `Obs:      ${customerData.notes}\n`;

    text += `\n📦 ITENS DO PEDIDO\n`;
    text += `─────────────────────────\n`;
    items.forEach(item => {
      const sub         = ElChefeUtils.formatCurrency(item.price * item.quantity);
      const displayName = item.variant ? `${item.name} (${item.variant})` : item.name;
      text += `${item.emoji} ${displayName}\n`;
      text += `   ${item.quantity}x ${ElChefeUtils.formatCurrency(item.price)} = ${sub}\n`;
    });

    text += `─────────────────────────\n`;
    text += `Subtotal: ${ElChefeUtils.formatCurrency(ElChefeCart.getSubtotal())}\n`;
    text += `Entrega:  ${ElChefeCart.getShipping() === 0 ? 'GRÁTIS' : ElChefeUtils.formatCurrency(ElChefeCart.getShipping() ?? 0)}\n`;
    text += `TOTAL:    ${ElChefeUtils.formatCurrency(ElChefeCart.getTotal())}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `💳 PAGAMENTO: ${paymentMethod.toUpperCase()}\n`;

    const changeVal = document.getElementById('field-change')?.value;
    if (paymentMethod === 'dinheiro' && changeVal) {
      text += `Troco para: R$ ${parseFloat(changeVal).toFixed(2)}\n`;
    }

    return text;
  }

  /**
   * Monta o payload estruturado para o webhook/API.
   * @returns {Object}
   */
  function buildOrderPayload() {
    return {
      timestamp:   new Date().toISOString(),
      orderId:     `ELCH-${Date.now()}`,
      customer:    customerData,
      items:       ElChefeCart.getAll().map(i => ({
        id:       i.id,
        name:     i.name,
        variant:  i.variant || null,
        quantity: i.quantity,
        price:    i.price,
        subtotal: parseFloat((i.price * i.quantity).toFixed(2)),
      })),
      subtotal:    parseFloat(ElChefeCart.getSubtotal().toFixed(2)),
      shipping:    parseFloat((ElChefeCart.getShipping() ?? 0).toFixed(2)),
      total:       parseFloat(ElChefeCart.getTotal().toFixed(2)),
      payment:     paymentMethod,
      change:      paymentMethod === 'dinheiro'
        ? parseFloat(document.getElementById('field-change')?.value ?? 0)
        : null,
      summary:     buildOrderSummary(),
    };
  }

  // ── Envio do Pedido ───────────────────────────────────────────────────────

  /**
   * Orquestra o envio do pedido para o PDV OnSell.
   * O PDV valida estoque, registra a venda e abate o estoque.
   * Se o PDV não estiver configurado, registra localmente (modo offline).
   *
   * @returns {Promise<{ success: boolean, payload: Object, pdvResposta?: Object }>}
   */
  async function sendOrder() {
    const payload = buildOrderPayload();

    // ── Modo independente (PDV_ENABLED = false) ───────────────
    // Pedido finalizado localmente; link WhatsApp gerado na confirmação.
    if (!ElChefePDV.pdvAtivo()) {
      return { success: true, payload, via: 'whatsapp' };
    }

    // ── Modo integrado (PDV_ENABLED = true) ───────────────────
    const resultado = await ElChefePDV.enviarPedido(payload);

    if (!resultado.sucesso) {
      throw new Error(resultado.mensagem);
    }

    return { success: true, payload, via: 'pdv', pdvResposta: resultado.dados };
  }

  // ── Gera link do WhatsApp ─────────────────────────────────────────────────

  function buildWhatsAppLink(summary) {
    const encoded = encodeURIComponent(summary);
    return `https://wa.me/${whatsappNumber()}?text=${encoded}`;
  }

  // ── Renderização da Confirmação ───────────────────────────────────────────

  function renderConfirmation(payload, via) {
    const cm = confirmMsg();
    const cs = confirmSum();
    const cw = confirmWpp();
    const summary = buildOrderSummary();

    if (cm) {
      cm.textContent = via === 'whatsapp'
        ? 'Pedido registrado! Clique abaixo para enviar ao WhatsApp da loja e confirmar sua entrega.'
        : `Pedido #${payload.orderId} confirmado! Entraremos em contato pelo WhatsApp em breve.`;
    }

    if (cs) cs.textContent = summary;

    if (cw) {
      cw.href = buildWhatsAppLink(summary);
      // Modo WhatsApp: botão é o CTA principal — destaque visual
      if (via === 'whatsapp') {
        cw.textContent = '📲 Enviar Pedido pelo WhatsApp';
        cw.style.fontSize = '1.1rem';
      }
    }
  }

  // ── Abrir / Fechar Modal ──────────────────────────────────────────────────

  function open() {
    if (ElChefeCart.isEmpty()) {
      ElChefeUtils.showToast('Seu carrinho está vazio.', 'error');
      return;
    }

    // Reseta estado do checkout
    currentStep    = 1;
    customerData   = {};
    shippingResult = null;
    clearErrors();
    goToStep(1);

    // Reseta frete no carrinho
    ElChefeCart.setShipping(null);
    const sr = shippingRes();
    if (sr) sr.hidden = true;
    const ic = infoCep();
    if (ic) ic.textContent = '';

    // Fecha o drawer do carrinho
    ElChefeUtils.closeOverlay(document.getElementById('cart-drawer'));

    ElChefeUtils.openOverlay(modal());
    fieldName()?.focus();
  }

  function close() {
    ElChefeUtils.closeOverlay(modal());
  }

  // ── Eventos ───────────────────────────────────────────────────────────────

  function bindEvents() {
    // Abre checkout
    document.getElementById('btn-checkout')?.addEventListener('click', open);
    document.getElementById('checkout-close')?.addEventListener('click', close);

    // Fecha ao clicar fora do modal
    modal()?.addEventListener('click', e => {
      if (e.target === modal()) close();
    });

    // Máscara do CEP
    fieldCep()?.addEventListener('input', e => {
      e.target.value = ElChefeUtils.maskCEP(e.target.value);
    });

    // Máscara do telefone
    fieldPhone()?.addEventListener('input', e => {
      e.target.value = ElChefeUtils.maskPhone(e.target.value);
    });

    // Auto-cálculo ao sair do campo CEP (blur)
    fieldCep()?.addEventListener('blur', () => {
      const cep = ElChefeUtils.onlyDigits(fieldCep()?.value ?? '');
      if (cep.length === 8) handleCalcShipping();
    });

    // Botão Calcular Frete
    btnCalcShip()?.addEventListener('click', handleCalcShipping);

    // Submit Step 1 → Step 2
    formCustomer()?.addEventListener('submit', e => {
      e.preventDefault();
      if (!validateStep1()) return;
      collectCustomerData();
      goToStep(2);
    });

    // Mostra/oculta campo de troco
    formPayment()?.addEventListener('change', e => {
      if (e.target.name === 'payment') {
        paymentMethod = e.target.value;
        const cg = changeGroup();
        if (cg) cg.hidden = paymentMethod !== 'dinheiro';
      }
    });

    // Submit Step 2 → Step 3
    formPayment()?.addEventListener('submit', async e => {
      e.preventDefault();

      const btn = formPayment()?.querySelector('[type="submit"]');
      if (btn) {
        btn.classList.add('btn--loading');
        btn.disabled = true;
      }

      try {
        const { payload, via } = await sendOrder();
        renderConfirmation(payload, via);
        goToStep(3);
        ElChefeCart.clear();
      } catch (err) {
        // Exibe a mensagem real do PDV (ex: "Estoque insuficiente para X")
        const msg = err.message ?? 'Erro ao enviar pedido. Tente novamente.';
        ElChefeUtils.showToast(msg, 'error', 5000);
        console.error('[ElChefe] Erro ao finalizar pedido:', err);
      } finally {
        if (btn) {
          btn.classList.remove('btn--loading');
          btn.disabled = false;
        }
      }
    });

    // Voltar Step 2 → Step 1
    document.getElementById('btn-back-customer')?.addEventListener('click', () => goToStep(1));

    // Novo pedido
    document.getElementById('btn-new-order')?.addEventListener('click', () => {
      close();
    });

    // ESC fecha o modal
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !modal()?.hidden) close();
    });
  }

  // ── Inicialização ────────────────────────────────────────────────────────

  function init() {
    bindEvents();
  }

  return {
    init,
    open,
    close,
    buildOrderSummary,
  };

})();
