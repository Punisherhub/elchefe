/**
 * shipping.js — El Chefe
 *
 * Calcula o frete com base na distância real entre a loja e o CEP do cliente.
 *
 * ESTRATÉGIA (cascata):
 *  1. BrasilAPI v2  → valida o CEP, retorna endereço + coordenadas (quando disponível).
 *  2. ViaCEP        → fallback de endereço quando BrasilAPI falha.
 *  3. Nominatim     → geocodifica pelo endereço quando BrasilAPI não tem coordenadas.
 *  4. Haversine     → distância em linha reta × fator de rota (1.35) ≈ km percorridos.
 *  5. Tabela de faixas de km → determina a taxa de entrega.
 *
 * Coordenadas da loja:
 *   Lat: -25.0669528, Lng: -50.1756617
 *   (Av. João Rabello Coutinho 2560, Boa Vista, Ponta Grossa - PR, CEP 84071-150)
 */

'use strict';

const ElChefeShipping = (() => {

  // ── Configuração ─────────────────────────────────────────────────────────

  const STORE_LAT = -25.0669528;
  const STORE_LNG = -50.1756617;

  /**
   * Fator de correção de linha reta → distância por rota.
   * 1.35 é uma estimativa conservadora para áreas urbanas.
   */
  const ROAD_FACTOR = 1.35;

  /** Frete grátis acima deste valor em R$. 0 = desativado. */
  const FREE_SHIPPING_THRESHOLD = 0;

  // ── Tabela de faixas de distância ────────────────────────────────────────

  const DISTANCE_FEES = [
    { maxKm: 1.0, fee:  5.00 },
    { maxKm: 2.0, fee:  8.00 },
    { maxKm: 3.0, fee: 10.00 },
    { maxKm: 4.0, fee: 12.00 },
    { maxKm: 5.0, fee: 14.00 },
    { maxKm: 6.5, fee: 15.00 },
  ];

  // ── Funções Internas ─────────────────────────────────────────────────────

  function haversineKm(lat1, lng1, lat2, lng2) {
    const R    = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a    = Math.sin(dLat / 2) ** 2
               + Math.cos(lat1 * Math.PI / 180)
               * Math.cos(lat2 * Math.PI / 180)
               * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function lookupFee(km) {
    for (const entry of DISTANCE_FEES) {
      if (km <= entry.maxKm) return entry;
    }
    return DISTANCE_FEES[DISTANCE_FEES.length - 1];
  }

  /**
   * Busca endereço + coordenadas via BrasilAPI v2.
   * Retorna objeto normalizado com campos comuns ao ViaCEP + lat/lng.
   * @param {string} digits  - 8 dígitos
   * @returns {Promise<object|null>}
   */
  async function fetchBrasilAPI(digits) {
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${digits}`);
      if (!res.ok) return null;
      const d = await res.json();
      if (d.errors || d.message) return null;

      const lat = d.location?.coordinates?.latitude;
      const lng = d.location?.coordinates?.longitude;

      return {
        logradouro: d.street        ?? '',
        bairro:     d.neighborhood  ?? '',
        localidade: d.city          ?? '',
        uf:         d.state         ?? '',
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null,
      };
    } catch {
      return null;
    }
  }

  /**
   * Busca endereço via ViaCEP (fallback).
   * @param {string} digits
   * @returns {Promise<object|null>}
   */
  async function fetchViaCEP(digits) {
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.erro ? null : data;
    } catch {
      return null;
    }
  }

  /**
   * Geocodifica via Nominatim usando dados de endereço do ViaCEP/BrasilAPI.
   * Tenta queries progressivamente menos específicas.
   * @param {object} addr  - { logradouro, bairro, localidade, uf }
   * @returns {Promise<{ lat: number, lng: number }|null>}
   */
  async function geocodeAddress(addr) {
    const rua    = addr.logradouro ?? '';
    const bairro = addr.bairro     ?? '';
    const cidade = addr.localidade ?? '';
    const uf     = addr.uf         ?? '';

    async function nominatim(query) {
      try {
        const url  = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&accept-language=pt-BR`;
        const res  = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.length) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      } catch {}
      return null;
    }

    // Tentativa 1: rua + bairro + cidade
    if (rua && bairro && cidade) {
      const r = await nominatim(`${rua}, ${bairro}, ${cidade}, ${uf}, Brasil`);
      if (r) return r;
    }

    // Tentativa 2: rua + cidade
    if (rua && cidade) {
      const r = await nominatim(`${rua}, ${cidade}, ${uf}, Brasil`);
      if (r) return r;
    }

    // Tentativa 3: bairro + cidade (melhor que centróide da cidade)
    if (bairro && cidade) {
      const r = await nominatim(`${bairro}, ${cidade}, ${uf}, Brasil`);
      if (r) return r;
    }

    return null;
  }

  // ── API Pública ──────────────────────────────────────────────────────────

  /**
   * Calcula o frete para um CEP informado.
   * @param {string} cep
   * @param {number} [orderTotal=0]
   * @returns {Promise<ShippingResult>}
   */
  async function calculate(cep, orderTotal = 0) {
    const digits = cep.replace(/\D/g, '');

    if (digits.length !== 8) {
      return { success: false, error: 'CEP inválido. Verifique e tente novamente.', fee: 0 };
    }

    if (FREE_SHIPPING_THRESHOLD > 0 && orderTotal >= FREE_SHIPPING_THRESHOLD) {
      return {
        success: true, fee: 0, isFree: true,
        zone: 'Frete Grátis',
        message: `Frete grátis para pedidos acima de R$ ${FREE_SHIPPING_THRESHOLD}!`,
        distanceKm: null,
      };
    }

    // 1. BrasilAPI v2 — endereço + coordenadas diretas
    const brasilApi = await fetchBrasilAPI(digits);

    // 2. Fallback de endereço para ViaCEP se BrasilAPI falhar
    const addr = brasilApi ?? await fetchViaCEP(digits);
    if (!addr) {
      return { success: false, error: 'CEP não encontrado. Verifique e tente novamente.', fee: 0 };
    }

    // 3. Coordenadas: usa BrasilAPI diretamente ou geocodifica via Nominatim
    let coords = null;
    if (brasilApi?.lat && brasilApi?.lng) {
      coords = { lat: brasilApi.lat, lng: brasilApi.lng };
    } else {
      coords = await geocodeAddress(addr);
    }

    if (!coords) {
      return {
        success: false,
        error: 'Não conseguimos calcular a distância para esse CEP. Entre em contato com a loja.',
        fee: 0,
      };
    }

    // 4. Haversine × fator de rota
    const straightKm  = haversineKm(STORE_LAT, STORE_LNG, coords.lat, coords.lng);
    const estimatedKm = parseFloat((straightKm * ROAD_FACTOR).toFixed(2));

    // 5. Taxa pela tabela
    const maxFaixa = DISTANCE_FEES[DISTANCE_FEES.length - 1];
    const entry    = lookupFee(estimatedKm);
    const acimaMax = estimatedKm > maxFaixa.maxKm;

    return {
      success:      true,
      fee:          entry.fee,
      isFree:       false,
      zone:         acimaMax ? `Acima de ${maxFaixa.maxKm} km` : `Até ${entry.maxKm} km`,
      city:         addr.localidade ?? '',
      address:      addr.logradouro ?? '',
      neighborhood: addr.bairro     ?? '',
      distanceKm:   estimatedKm,
      durationMin:  null,
      message:      `Distância estimada: ~${estimatedKm} km`,
    };
  }

  async function autofillAddress(cep) {
    const digits = cep.replace(/\D/g, '');
    const brasilApi = await fetchBrasilAPI(digits);
    if (brasilApi) return brasilApi;
    return fetchViaCEP(digits);
  }

  function setGoogleMapsKey(_key) {}

  return { calculate, autofillAddress, setGoogleMapsKey };

})();
