/**
 * pdv-api.js — El Chefe
 *
 * Camada de comunicação com o PDV OnSell.
 * Todos os requests ao PDV passam por aqui.
 *
 * ENDPOINTS CONSUMIDOS:
 *   GET  /api/site/produtos          → lista produtos publicados
 *   POST /api/site/pedido            → registra pedido + abate estoque
 *
 * AUTENTICAÇÃO: header X-API-Key (configurado em config.js)
 *
 * FALLBACK: se PDV_API_KEY estiver vazio ou a API retornar erro,
 * usa os dados locais de products-data.js automaticamente.
 */

'use strict';

const ElChefePDV = (() => {

  // ── Helpers internos ─────────────────────────────────────────

  function cfg() {
    return window.ElChefeConfig;
  }

  function isConfigured() {
    return !!(
      cfg().PDV_ENABLED === true &&
      cfg().PDV_API_KEY &&
      cfg().PDV_API_KEY.trim().length > 0
    );
  }

  /**
   * Fetch com timeout automático.
   * @param {string} url
   * @param {RequestInit} options
   * @returns {Promise<Response>}
   */
  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      cfg().API_TIMEOUT_MS
    );

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Headers padrão para todas as chamadas ao PDV.
   * @returns {HeadersInit}
   */
  function headers() {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': cfg().PDV_API_KEY,
    };
  }

  // ── Normalização ──────────────────────────────────────────────

  /**
   * Converte o formato de produto do PDV para o formato
   * interno do site El Chefe.
   *
   * PDV retorna:
   *   { id, nome, categoria, descricao, preco, preco_promocional,
   *     em_promocao, destaque, estoque_disponivel, foto_url }
   *
   * Site espera:
   *   { id, name, category, description, price, priceOriginal,
   *     isPromo, isFeatured, stock, image, emoji }
   *
   * @param {Object} p  produto vindo do PDV
   * @returns {Object}
   */
  /**
   * Corrige double-encoding UTF-8 → Latin-1 que ocorre na serialização do PDV.
   * Ex: "Bebidas alcÃ³licas" → "Bebidas alcoólicas"
   * @param {string} str
   * @returns {string}
   */
  function fixEncoding(str) {
    if (!str) return str;
    try {
      return decodeURIComponent(escape(str));
    } catch {
      return str;
    }
  }

  function normalizeProduct(p) {
    const categoria = fixEncoding(p.categoria ?? '');
    return {
      id:            String(p.id),
      name:          fixEncoding(p.nome),
      slug:          p.nome?.toLowerCase().replace(/\s+/g, '-'),
      category:      categoria.toLowerCase(),
      description:   p.descricao ?? '',
      price:         p.em_promocao && p.preco_promocional
                       ? parseFloat(p.preco_promocional)
                       : parseFloat(p.preco_venda ?? p.preco),
      priceOriginal: p.em_promocao && p.preco_promocional
                       ? parseFloat(p.preco_venda ?? p.preco)
                       : null,
      isPromo:       !!p.em_promocao,
      isFeatured:    !!(p.destaque_site ?? p.destaque),
      stock:         parseInt(p.estoque_disponivel ?? 0, 10),
      image:         p.foto_url ?? null,
      emoji:         emojiForCategory(categoria),
      // Variantes: array de grupos { nome, opcoes[] } vindo do PDV
      variantes:     Array.isArray(p.variantes) ? p.variantes : [],
    };
  }

  /**
   * Emoji padrão por categoria (fallback visual quando sem foto).
   * @param {string} categoria
   * @returns {string}
   */
  function emojiForCategory(categoria) {
    const map = {
      // Categorias do PDV OnSell
      'bebidas alcoólicas':     '🍺',
      'bebidas não alcoólicas': '🥤',
      'tabacaria':              '🚬',
      'comidas':                '🍿',
      'doces':                  '🍬',
      'diversos':               '📦',
      'padaria':                '🥐',
      'higiene':                '🧴',
      'animais':                '🐾',
      // Genéricos / fallback
      destilados: '🥃',
      whisky:     '🥃',
      vodka:      '🍶',
      gin:        '🍸',
      cervejas:   '🍺',
      vinhos:     '🍷',
      espumante:  '🥂',
      energetico: '⚡',
      agua:       '💧',
      cigarro:    '🚬',
      narguilé:   '🪔',
      snacks:     '🍿',
    };
    const key = (categoria ?? '').toLowerCase();
    return map[key] ?? '📦';
  }

  // ── Imagens locais para produtos do PDV ──────────────────────

  /**
   * Aplica imagens do Cloudinary aos produtos do PDV.
   * Usa URL determinística baseada no public_id (elchefe-pdv-{id}).
   * Fallback: localStorage (admin — sessão atual).
   */
  async function enrichWithImages(produtos) {
    const cloudName = window.ElChefeConfig?.CLOUDINARY_CLOUD_NAME;

    let localMap = {};
    try {
      const raw = localStorage.getItem('elchefe_pdv_images');
      if (raw) localMap = JSON.parse(raw);
    } catch (_) {}

    return produtos.map(p => {
      const key            = String(p.id);
      const hasEntry       = Object.prototype.hasOwnProperty.call(localMap, key);
      const mappedUrl      = localMap[key]; // null = removida explicitamente

      // cloudUrl só é usado se o admin nunca tocou nessa imagem (sem entrada no mapa)
      const cloudUrl = (!hasEntry && cloudName)
        ? `https://res.cloudinary.com/${cloudName}/image/upload/elchefe-pdv-${p.id}`
        : null;

      return {
        ...p,
        image: p.image ?? mappedUrl ?? cloudUrl,
      };
    });
  }

  // ── Produtos locais (admin localStorage tem prioridade) ──────

  /**
   * Retorna a lista de produtos local.
   * Prioridade: localStorage (painel admin) → products-data.js
   *
   * IMPORTANTE: quando o PDV está ativo, o painel admin é ignorado
   * completamente — somente os produtos do PDV são exibidos.
   */
  function getLocalProducts() {
    // PDV ativo → nunca mistura com produtos do painel admin
    if (isConfigured()) {
      return window.ELCHEFE_PRODUCTS ?? [];
    }

    try {
      const raw = localStorage.getItem('elchefe_products');
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.length > 0) {
          console.info(`[ElChefe PDV] ${list.length} produto(s) carregado(s) do painel admin.`);
          return list;
        }
      }
    } catch (_) {}
    return window.ELCHEFE_PRODUCTS ?? [];
  }

  // ── API Pública ───────────────────────────────────────────────

  /**
   * Busca produtos publicados no PDV.
   * Retorna dados locais como fallback se necessário.
   *
   * @returns {Promise<{ produtos: Object[], fonte: 'pdv'|'local', erro?: string }>}
   */
  async function fetchProdutos() {
    if (!isConfigured()) {
      console.info('[ElChefe PDV] API Key não configurada — usando dados locais.');
      return {
        produtos: getLocalProducts(),
        fonte: 'local',
      };
    }

    try {
      const url = `${cfg().PDV_BASE_URL}/api/site/produtos`;
      const res = await fetchWithTimeout(url, {
        method: 'GET',
        headers: headers(),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const lista = Array.isArray(data) ? data : (data.produtos ?? []);
      const produtos = await enrichWithImages(lista.map(normalizeProduct));

      console.info(`[ElChefe PDV] ${produtos.length} produto(s) carregado(s) do PDV.`);

      return { produtos, fonte: 'pdv' };

    } catch (err) {
      const motivo = err.name === 'AbortError' ? 'timeout' : err.message;
      console.warn(`[ElChefe PDV] Falha ao buscar produtos (${motivo}).`);

      if (cfg().USE_LOCAL_FALLBACK) {
        console.info('[ElChefe PDV] Usando fallback local.');
        return {
          produtos: await enrichWithImages(getLocalProducts()),
          fonte: 'local',
          erro: motivo,
        };
      }

      return { produtos: [], fonte: 'local', erro: motivo };
    }
  }

  /**
   * Envia um pedido finalizado para o PDV.
   * O PDV valida estoque, registra a venda e abate o estoque.
   *
   * @param {Object} pedido  payload completo do pedido
   * @returns {Promise<{ sucesso: boolean, mensagem: string, dados?: Object }>}
   */
  async function enviarPedido(pedido) {
    if (!isConfigured()) {
      // Sem PDV configurado: simula sucesso e registra no console
      console.info('[ElChefe PDV] Modo offline — pedido registrado localmente:', pedido);
      return {
        sucesso: true,
        mensagem: 'Pedido registrado (modo offline).',
        dados: { order_id: pedido.order_id },
      };
    }

    try {
      const url = `${cfg().PDV_BASE_URL}/api/site/pedido`;

      // Adapta o payload do site para o formato esperado pelo PDV
      const payload = {
        order_id:  pedido.orderId,
        origem:    'site',
        itens:     pedido.items.map(i => ({
          produto_id:     i.id,
          nome:           i.name,
          quantidade:     i.quantity,
          preco_unitario: i.price,
          subtotal:       i.subtotal,
        })),
        total:     pedido.total,
        cliente: {
          nome:      pedido.customer.name,
          telefone:  pedido.customer.phone,
          endereco:  pedido.customer.address,
          complemento: pedido.customer.complement ?? '',
          cep:       pedido.customer.cep,
          observacoes: pedido.customer.notes ?? '',
        },
        pagamento: pedido.payment,
        troco_para: pedido.change ?? null,
        frete:     pedido.shipping,
        subtotal:  pedido.subtotal,
      };

      const res = await fetchWithTimeout(url, {
        method:  'POST',
        headers: headers(),
        body:    JSON.stringify(payload),
      });

      const data = await res.json();

      // PDV retornou 409 = estoque insuficiente
      if (res.status === 409) {
        return {
          sucesso:  false,
          mensagem: data.mensagem ?? 'Estoque insuficiente para um ou mais itens.',
          dados:    data,
        };
      }

      if (!res.ok) {
        throw new Error(data.mensagem ?? `HTTP ${res.status}`);
      }

      console.info('[ElChefe PDV] Pedido enviado com sucesso:', data);
      return {
        sucesso:  true,
        mensagem: data.mensagem ?? 'Pedido confirmado!',
        dados:    data,
      };

    } catch (err) {
      const motivo = err.name === 'AbortError'
        ? 'Tempo limite excedido ao confirmar pedido.'
        : err.message;

      console.error('[ElChefe PDV] Erro ao enviar pedido:', motivo);

      return {
        sucesso:  false,
        mensagem: `Erro ao confirmar pedido: ${motivo}`,
      };
    }
  }

  /**
   * Salva as variantes de um produto no PDV.
   * @param {string} productId
   * @param {Array<{nome: string, opcoes: string[]}>} variantes
   * @returns {Promise<{ sucesso: boolean, mensagem: string }>}
   */
  async function salvarVariantes(productId, variantes) {
    if (!isConfigured()) {
      return { sucesso: false, mensagem: 'PDV não configurado.' };
    }

    try {
      const url = `${cfg().PDV_BASE_URL}/api/site/produtos/${productId}/variantes`;
      const res = await fetchWithTimeout(url, {
        method:  'PUT',
        headers: headers(),
        body:    JSON.stringify({ variantes }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.mensagem ?? `HTTP ${res.status}`);
      }

      return { sucesso: true, mensagem: 'Variantes salvas com sucesso!' };
    } catch (err) {
      const motivo = err.name === 'AbortError' ? 'Tempo limite excedido.' : err.message;
      return { sucesso: false, mensagem: `Erro ao salvar variantes: ${motivo}` };
    }
  }

  /**
   * Retorna true se o PDV está configurado (API Key preenchida).
   * Usado pelos outros módulos para ajustar comportamento.
   */
  function pdvAtivo() {
    return isConfigured();
  }

  return {
    fetchProdutos,
    enviarPedido,
    salvarVariantes,
    pdvAtivo,
  };

})();
