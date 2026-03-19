/**
 * shipping.js — El Chefe
 *
 * Lógica de cálculo de frete para Ponta Grossa - PR.
 *
 * ESTRATÉGIA HÍBRIDA:
 *  1. Tabela de faixas de CEP para bairros de PG (resolução imediata, sem API).
 *  2. Fallback para API ViaCEP + Google Distance Matrix se o CEP não for de PG.
 *
 * Para ativar a Google Distance Matrix API, configure:
 *   ElChefeShipping.GOOGLE_MAPS_API_KEY = 'SUA_CHAVE_AQUI';
 *
 * Coordenadas da loja:
 *   Lat: -25.0952, Lng: -50.1622
 *   (João Rabelo Coutinho 2560, Ponta Grossa - PR)
 */

'use strict';

const ElChefeShipping = (() => {

  // ── Configuração ─────────────────────────────────────────────────────────

  /** @type {string} Chave da Google Maps Distance Matrix API (preencha depois) */
  let GOOGLE_MAPS_API_KEY = ''; // TODO: adicione sua chave aqui

  const STORE_LAT = -25.0952;
  const STORE_LNG = -50.1622;

  /** Frete grátis acima deste valor (R$). 0 = desativado. */
  const FREE_SHIPPING_THRESHOLD = 0;

  /** Taxa mínima de entrega */
  const BASE_FEE = 5.00;

  // ── Tabela de faixas de CEP — Ponta Grossa/PR ────────────────────────────
  //
  //  Cada entrada: [cepInicio, cepFim, taxa, nomeZona]
  //  CEPs de Ponta Grossa vão de 84000-000 a 84999-999 (aprox.)
  //  Dividimos em zonas por distância estimada do centro/loja.

  const CEP_ZONES = [
    // Zona 1 — Vizinhança imediata / Centro (~0-3 km)
    { from: 84010000, to: 84020999, fee: 5.00,  zone: 'Centro / Zona 1' },
    { from: 84021000, to: 84040999, fee: 6.00,  zone: 'Centro Expandido / Zona 1' },

    // Zona 2 — Bairros próximos (~3-7 km)
    { from: 84041000, to: 84070999, fee: 8.00,  zone: 'Bairros Norte / Zona 2' },
    { from: 84071000, to: 84090999, fee: 8.00,  zone: 'Bairros Sul / Zona 2' },
    { from: 84091000, to: 84110999, fee: 8.00,  zone: 'Bairros Leste / Zona 2' },

    // Zona 3 — Bairros intermediários (~7-12 km)
    { from: 84111000, to: 84160999, fee: 10.00, zone: 'Zona 3 — Intermediário' },
    { from: 84161000, to: 84200999, fee: 10.00, zone: 'Zona 3 — Intermediário' },

    // Zona 4 — Periferia e distritos (~12-20 km)
    { from: 84201000, to: 84400999, fee: 14.00, zone: 'Zona 4 — Periferia' },

    // Zona 5 — Grande Ponta Grossa / Região (~20-40 km)
    { from: 84401000, to: 84999999, fee: 20.00, zone: 'Zona 5 — Região Metropolitana' },
  ];

  // Frete para fora de Ponta Grossa (calculado por distância via API)
  const OUT_OF_CITY_BASE_FEE = 25.00;
  const FEE_PER_KM           =  0.80; // R$/km acima dos primeiros 20 km

  // ── Funções Internas ─────────────────────────────────────────────────────

  /**
   * Normaliza o CEP para número inteiro (8 dígitos).
   * @param {string} cep
   * @returns {number|null}
   */
  function parseCEP(cep) {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return null;
    return parseInt(digits, 10);
  }

  /**
   * Busca a taxa de entrega na tabela de faixas de CEP.
   * @param {number} cepNum  - CEP como inteiro
   * @returns {{ fee: number, zone: string }|null}
   */
  function lookupCepZone(cepNum) {
    for (const entry of CEP_ZONES) {
      if (cepNum >= entry.from && cepNum <= entry.to) {
        return { fee: entry.fee, zone: entry.zone };
      }
    }
    return null;
  }

  /**
   * Consulta ViaCEP para obter cidade/estado de um CEP.
   * @param {string} cep
   * @returns {Promise<{localidade:string, uf:string, logradouro:string, bairro:string}|null>}
   */
  async function fetchViaCEP(cep) {
    const digits = cep.replace(/\D/g, '');
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.erro) return null;
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Calcula distância via Google Distance Matrix API.
   * Requer GOOGLE_MAPS_API_KEY configurada.
   * @param {string} destinationCep
   * @returns {Promise<{ distanceKm: number, durationMin: number }|null>}
   */
  async function fetchGoogleDistance(destinationCep) {
    if (!GOOGLE_MAPS_API_KEY) return null;

    const origin      = `${STORE_LAT},${STORE_LNG}`;
    const destination = encodeURIComponent(`CEP ${destinationCep}, Brazil`);

    // ATENÇÃO: Em produção, faça esta chamada pelo seu backend para não expor a chave.
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json`
      + `?origins=${origin}`
      + `&destinations=${destination}`
      + `&key=${GOOGLE_MAPS_API_KEY}`
      + `&language=pt-BR`
      + `&units=metric`;

    try {
      const res  = await fetch(url);
      const data = await res.json();
      const el   = data?.rows?.[0]?.elements?.[0];
      if (!el || el.status !== 'OK') return null;

      return {
        distanceKm:  el.distance.value / 1000,
        durationMin: Math.ceil(el.duration.value / 60),
      };
    } catch {
      return null;
    }
  }

  /**
   * Calcula a taxa de entrega para CEPs fora de Ponta Grossa
   * usando a distância em km.
   * @param {number} km
   * @returns {number}
   */
  function calcOutOfCityFee(km) {
    if (km <= 20) return OUT_OF_CITY_BASE_FEE;
    return OUT_OF_CITY_BASE_FEE + Math.ceil(km - 20) * FEE_PER_KM;
  }

  // ── API Pública ──────────────────────────────────────────────────────────

  /**
   * Calcula o frete para um CEP informado.
   *
   * @param {string} cep  - CEP do cliente (com ou sem máscara)
   * @param {number} [orderTotal=0]  - total do pedido (para frete grátis)
   * @returns {Promise<ShippingResult>}
   *
   * @typedef {Object} ShippingResult
   * @property {boolean} success
   * @property {number}  fee          - valor do frete em R$
   * @property {boolean} isFree       - true se frete grátis
   * @property {string}  zone         - nome da zona
   * @property {string}  city         - cidade encontrada
   * @property {string}  address      - logradouro (do ViaCEP)
   * @property {string}  neighborhood - bairro
   * @property {number|null} distanceKm   - km (quando via Google)
   * @property {number|null} durationMin  - tempo estimado em minutos
   * @property {string}  message      - texto amigável para exibição
   * @property {string}  error        - mensagem de erro (se !success)
   */
  async function calculate(cep, orderTotal = 0) {
    const cepNum = parseCEP(cep);

    if (!cepNum) {
      return {
        success: false,
        error: 'CEP inválido. Verifique e tente novamente.',
        fee: 0,
      };
    }

    // 1. Verifica frete grátis
    if (FREE_SHIPPING_THRESHOLD > 0 && orderTotal >= FREE_SHIPPING_THRESHOLD) {
      return {
        success: true,
        fee: 0,
        isFree: true,
        zone: 'Frete Grátis',
        message: `Frete grátis para pedidos acima de R$ ${FREE_SHIPPING_THRESHOLD}!`,
        distanceKm: null,
        durationMin: null,
      };
    }

    // 2. Busca na tabela de faixas de CEP (Ponta Grossa)
    const zoneEntry = lookupCepZone(cepNum);

    if (zoneEntry) {
      return {
        success: true,
        fee: Math.max(BASE_FEE, zoneEntry.fee),
        isFree: false,
        zone: zoneEntry.zone,
        message: `Entrega para ${zoneEntry.zone}`,
        distanceKm: null,
        durationMin: null,
      };
    }

    // 3. CEP fora da tabela: consulta ViaCEP para validar + Google Distance
    const viaCepData = await fetchViaCEP(cep);

    if (!viaCepData) {
      return {
        success: false,
        error: 'Não conseguimos localizar esse CEP. Verifique e tente novamente.',
        fee: 0,
      };
    }

    const isInPG = viaCepData.localidade?.toLowerCase().includes('ponta grossa');

    // Tenta Google Distance Matrix se a chave estiver configurada
    const googleResult = await fetchGoogleDistance(cep);

    if (googleResult) {
      const fee = isInPG
        ? calcOutOfCityFee(googleResult.distanceKm * 0.5) // PG mas longe — reduz
        : calcOutOfCityFee(googleResult.distanceKm);

      return {
        success: true,
        fee: parseFloat(fee.toFixed(2)),
        isFree: false,
        zone: isInPG ? 'Ponta Grossa — Zona Especial' : `Fora de PG (${viaCepData.localidade}/${viaCepData.uf})`,
        city: viaCepData.localidade,
        address: viaCepData.logradouro,
        neighborhood: viaCepData.bairro,
        distanceKm:  googleResult.distanceKm,
        durationMin: googleResult.durationMin,
        message: `Distância: ~${Math.round(googleResult.distanceKm)} km — Tempo estimado: ${googleResult.durationMin} min`,
      };
    }

    // 4. Fallback: taxa fixa para fora da área mapeada
    const fallbackFee = isInPG ? 18.00 : OUT_OF_CITY_BASE_FEE;

    return {
      success: true,
      fee: fallbackFee,
      isFree: false,
      zone: isInPG ? 'Ponta Grossa — Faixa não mapeada' : `${viaCepData.localidade}/${viaCepData.uf}`,
      city: viaCepData.localidade,
      address: viaCepData.logradouro,
      neighborhood: viaCepData.bairro,
      distanceKm: null,
      durationMin: null,
      message: isInPG
        ? 'Endereço em Ponta Grossa — taxa padrão aplicada.'
        : 'Entrega fora de Ponta Grossa — consulte disponibilidade.',
    };
  }

  /**
   * Preenche campos de endereço automaticamente com dados do ViaCEP.
   * @param {string} cep
   * @returns {Promise<{logradouro:string, bairro:string, localidade:string, uf:string}|null>}
   */
  async function autofillAddress(cep) {
    return fetchViaCEP(cep);
  }

  /** Permite injetar a chave da Google Maps API dinamicamente */
  function setGoogleMapsKey(key) {
    GOOGLE_MAPS_API_KEY = key;
  }

  return {
    calculate,
    autofillAddress,
    setGoogleMapsKey,
  };

})();
