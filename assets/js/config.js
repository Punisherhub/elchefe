/**
 * config.js — El Chefe
 * Configuração central do site.
 *
 * ═══════════════════════════════════════════════════════════
 *  MODO ATUAL: PDV_ENABLED = false  →  site funciona de forma
 *  independente, pedidos enviados via WhatsApp.
 *
 *  PARA ATIVAR A INTEGRAÇÃO COM O PDV:
 *   1. Acesse pdv-onsell.up.railway.app
 *      → Configurações → Integração Site → Gerar API Key
 *   2. Cole a chave em PDV_API_KEY abaixo
 *   3. Mude PDV_ENABLED para true
 *   4. Salve. Pronto.
 * ═══════════════════════════════════════════════════════════
 */

'use strict';

window.ElChefeConfig = {

  // ── Chave mestra da integração ───────────────────────────
  //
  //  false → site independente, pedidos via WhatsApp (modo atual)
  //  true  → site integrado ao PDV OnSell
  //
  PDV_ENABLED: true,

  // ── PDV OnSell (usado apenas quando PDV_ENABLED = true) ──
  PDV_BASE_URL: 'https://sasconv-production-4532.up.railway.app',
  PDV_API_KEY: '6ed1466645f7c20362ed681d23f61ec01c823c1a50aefc404916a2d6a9f3440b', // cole aqui a API Key gerada no PDV

  // ── Fallback e timeout (usado apenas quando PDV_ENABLED = true) ──
  USE_LOCAL_FALLBACK: true,
  API_TIMEOUT_MS: 8000,

  // ── WhatsApp da loja ─────────────────────────────────────
  // TODO: substitua pelo número real (DDI + DDD + número, sem espaços)
  WHATSAPP_NUMBER: '5542999959547',

  // ── ImgBB (hospedagem de imagens para o painel admin) ────
  IMGBB_API_KEY: 'c989aa37bfd4a3680b312c2237a27a88',

};
