/**
 * utils.js — El Chefe
 * Funções utilitárias compartilhadas por todos os módulos.
 */

'use strict';

const ElChefeUtils = (() => {

  /**
   * Formata um valor numérico para moeda BRL.
   * @param {number} value
   * @returns {string} ex: "R$ 12,90"
   */
  function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }

  /**
   * Aplica máscara de CEP enquanto o usuário digita.
   * @param {string} value  - valor bruto
   * @returns {string}      - "00000-000"
   */
  function maskCEP(value) {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }

  /**
   * Aplica máscara de telefone brasileiro.
   * @param {string} value
   * @returns {string} "(42) 9 0000-0000"
   */
  function maskPhone(value) {
    const d = value.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2)  return `(${d}`;
    if (d.length <= 3)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
    if (d.length <= 7)  return `(${d.slice(0,2)}) ${d.slice(2,3)} ${d.slice(3)}`;
    if (d.length <= 11) return `(${d.slice(0,2)}) ${d.slice(2,3)} ${d.slice(3,7)}-${d.slice(7)}`;
    return value;
  }

  /**
   * Remove todos os não-dígitos de uma string.
   * @param {string} value
   * @returns {string}
   */
  function onlyDigits(value) {
    return value.replace(/\D/g, '');
  }

  /**
   * Exibe um toast na tela.
   * @param {string} message
   * @param {'success'|'error'|'info'} type
   * @param {number} duration  - milissegundos
   */
  function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.setAttribute('role', 'alert');
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast--exit');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, duration);
  }

  /**
   * Debounce — evita chamadas excessivas em eventos.
   * @param {Function} fn
   * @param {number} delay
   * @returns {Function}
   */
  function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  /**
   * Shallow clone de objeto (evita mutação acidental).
   * @param {Object} obj
   * @returns {Object}
   */
  function clone(obj) {
    return Object.assign({}, obj);
  }

  /**
   * Fecha um drawer/modal e restitui o scroll da página.
   * @param {HTMLElement} el  - elemento com atributo hidden
   */
  function closeOverlay(el) {
    el.setAttribute('hidden', '');
    document.body.style.overflow = '';
  }

  /**
   * Abre um drawer/modal e trava o scroll da página.
   * @param {HTMLElement} el
   */
  function openOverlay(el) {
    el.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
  }

  return {
    formatCurrency,
    maskCEP,
    maskPhone,
    onlyDigits,
    showToast,
    debounce,
    clone,
    closeOverlay,
    openOverlay,
  };

})();
