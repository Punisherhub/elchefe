/**
 * shipping.js — El Chefe
 *
 * Calcula o frete com base na distância real entre a loja e o CEP do cliente.
 *
 * ESTRATÉGIA:
 *  1. ViaCEP  → valida o CEP e obtém o endereço completo.
 *  2. Nominatim (OpenStreetMap) → geocodifica o CEP para coordenadas (lat/lng).
 *  3. Haversine → distância em linha reta × fator de rota (1.35) ≈ km percorridos.
 *  4. Tabela de faixas de km → determina a taxa de entrega.
 *
 * Coordenadas da loja:
 *   Lat: -25.0952, Lng: -50.1622
 *   (João Rabelo Coutinho 2560, Ponta Grossa - PR)
 */

'use strict';

const ElChefeShipping = (() => {

  // ── Configuração ─────────────────────────────────────────────────────────

  const STORE_LAT = -25.0952;
  const STORE_LNG = -50.1622;

  /**
   * Fator de correção de linha reta → distância por rota.
   * 1.35 é uma estimativa conservadora para áreas urbanas.
   */
  const ROAD_FACTOR = 1.35;

  /** Frete grátis acima deste valor em R$. 0 = desativado. */
  const FREE_SHIPPING_THRESHOLD = 0;

  // ── Tabela de faixas de distância ────────────────────────────────────────
  //
  //  Cada entrada: { maxKm, fee }
  //  O sistema percorre a tabela de cima para baixo e aplica a taxa da
  //  primeira faixa onde distância estimada ≤ maxKm.
  //  CEPs acima do maior maxKm ficam fora da área de entrega.

  const DISTANCE_FEES = [
    { maxKm: 1.0, fee:  5.00 },
    { maxKm: 2.0, fee:  8.00 },
    { maxKm: 3.0, fee: 10.00 },
    { maxKm: 4.0, fee: 12.00 },
    { maxKm: 5.0, fee: 14.00 },
    { maxKm: 6.5, fee: 15.00 },
  ];

  // ── Funções Internas ─────────────────────────────────────────────────────

  /**
   * Fórmula de Haversine — distância em km entre dois pontos geográficos.
   * @param {number} lat1
   * @param {number} lng1
   * @param {number} lat2
   * @param {number} lng2
   * @returns {number} km
   */
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

  /**
   * Busca a taxa na tabela conforme a distância estimada.
   * Acima da última faixa, aplica a taxa máxima (R$ 15,00 fixo).
   * @param {number} km
   * @returns {{ fee: number, maxKm: number }}
   */
  function lookupFee(km) {
    for (const entry of DISTANCE_FEES) {
      if (km <= entry.maxKm) return entry;
    }
    return DISTANCE_FEES[DISTANCE_FEES.length - 1];
  }

  /**
   * Consulta ViaCEP para obter endereço a partir de um CEP.
   * @param {string} cep
   * @returns {Promise<object|null>}
   */
  async function fetchViaCEP(cep) {
    const digits = cep.replace(/\D/g, '');
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
   * Geocodifica um CEP usando a API do Nominatim (OpenStreetMap).
   * Tenta primeiro pelo CEP puro; se falhar, tenta pelo endereço completo.
   * @param {string} cep       - 8 dígitos
   * @param {object} [viaCep]  - dados do ViaCEP para fallback de busca
   * @returns {Promise<{ lat: number, lng: number }|null>}
   */
  async function geocodeCEP(cep, viaCep) {
    const digits  = cep.replace(/\D/g, '');
    const headers = { 'User-Agent': 'ElChefe-Delivery/1.0 (contato@elchefe.com.br)' };

    // Tentativa 1: busca direta pelo CEP
    try {
      const url = `https://nominatim.openstreetmap.org/search`
        + `?postalcode=${digits}&country=BR&format=json&limit=1`;
      const res  = await fetch(url, { headers });
      const data = await res.json();
      if (data.length) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
    } catch { /* segue para próxima tentativa */ }

    // Tentativa 2: busca por cidade + estado (quando o CEP não retorna resultado)
    if (viaCep?.localidade && viaCep?.uf) {
      try {
        const query = encodeURIComponent(`${viaCep.localidade}, ${viaCep.uf}, Brasil`);
        const url   = `https://nominatim.openstreetmap.org/search`
          + `?q=${query}&format=json&limit=1`;
        const res  = await fetch(url, { headers });
        const data = await res.json();
        if (data.length) {
          return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }
      } catch { /* geocodificação falhou */ }
    }

    return null;
  }

  // ── API Pública ──────────────────────────────────────────────────────────

  /**
   * Calcula o frete para um CEP informado.
   *
   * @param {string} cep
   * @param {number} [orderTotal=0]
   * @returns {Promise<ShippingResult>}
   *
   * @typedef {Object} ShippingResult
   * @property {boolean}     success
   * @property {number}      fee          - valor do frete em R$
   * @property {boolean}     isFree
   * @property {string}      zone         - faixa de distância
   * @property {string}      city
   * @property {string}      address
   * @property {string}      neighborhood
   * @property {number|null} distanceKm   - distância estimada por rota
   * @property {string}      message      - texto para exibição
   * @property {string}      error        - mensagem de erro (se !success)
   */
  async function calculate(cep, orderTotal = 0) {
    const digits = cep.replace(/\D/g, '');

    if (digits.length !== 8) {
      return { success: false, error: 'CEP inválido. Verifique e tente novamente.', fee: 0 };
    }

    // Frete grátis
    if (FREE_SHIPPING_THRESHOLD > 0 && orderTotal >= FREE_SHIPPING_THRESHOLD) {
      return {
        success: true, fee: 0, isFree: true,
        zone: 'Frete Grátis',
        message: `Frete grátis para pedidos acima de R$ ${FREE_SHIPPING_THRESHOLD}!`,
        distanceKm: null,
      };
    }

    // 1. Valida o CEP e obtém endereço
    const viaCep = await fetchViaCEP(digits);
    if (!viaCep) {
      return { success: false, error: 'CEP não encontrado. Verifique e tente novamente.', fee: 0 };
    }

    // 2. Geocodifica para coordenadas
    const coords = await geocodeCEP(digits, viaCep);
    if (!coords) {
      return {
        success: false,
        error: 'Não conseguimos calcular a distância para esse CEP. Entre em contato com a loja.',
        fee: 0,
      };
    }

    // 3. Calcula distância linha reta × fator de rota
    const straightKm  = haversineKm(STORE_LAT, STORE_LNG, coords.lat, coords.lng);
    const estimatedKm = parseFloat((straightKm * ROAD_FACTOR).toFixed(2));

    // 4. Busca taxa na tabela
    const maxFaixa = DISTANCE_FEES[DISTANCE_FEES.length - 1];
    const entry    = lookupFee(estimatedKm);
    const acimaMax = estimatedKm > maxFaixa.maxKm;

    return {
      success:      true,
      fee:          entry.fee,
      isFree:       false,
      zone:         acimaMax ? `Acima de ${maxFaixa.maxKm} km` : `Até ${entry.maxKm} km`,
      city:         viaCep.localidade ?? '',
      address:      viaCep.logradouro ?? '',
      neighborhood: viaCep.bairro     ?? '',
      distanceKm:   estimatedKm,
      durationMin:  null,
      message:      `Distância estimada: ~${estimatedKm} km`,
    };
  }

  /**
   * Preenche campos de endereço com dados do ViaCEP.
   * @param {string} cep
   * @returns {Promise<object|null>}
   */
  async function autofillAddress(cep) {
    return fetchViaCEP(cep);
  }

  /** Mantido por compatibilidade — não utilizado nesta implementação. */
  function setGoogleMapsKey(_key) {}

  return { calculate, autofillAddress, setGoogleMapsKey };

})();
