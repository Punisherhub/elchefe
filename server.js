'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// Arquivo onde o mapa de imagens PDV é persistido no servidor
const PDV_IMAGES_PATH = path.join(__dirname, 'pdv-images.json');

function readPdvImageMap() {
  try {
    if (fs.existsSync(PDV_IMAGES_PATH)) {
      return JSON.parse(fs.readFileSync(PDV_IMAGES_PATH, 'utf8'));
    }
  } catch (_) {}
  return {};
}

function writePdvImageMap(map) {
  fs.writeFileSync(PDV_IMAGES_PATH, JSON.stringify(map));
}

app.use(express.json());

// ── Cache headers ────────────────────────────────────────────
app.use((req, res, next) => {
  const url = req.path;
  if (/\/(admin\.js|admin\.css)$/.test(url)) {
    // Painel admin muda com frequência — sem cache
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  } else if (/\.(js|css|woff2?|ttf|eot)$/.test(url)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (/\.(jpg|jpeg|png|webp|gif|svg|ico)$/.test(url)) {
    res.setHeader('Cache-Control', 'public, max-age=604800');
  } else if (/\.html$/.test(url) || url === '/') {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  }
  next();
});

// ── Arquivos estáticos ───────────────────────────────────────
app.use(express.static(path.join(__dirname)));

// ── Rewrite /admin → admin.html ──────────────────────────────
app.get('/admin', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ── Mapa de imagens PDV (compartilhado entre dispositivos) ───
app.get('/api/pdv-images', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.json(readPdvImageMap());
});

app.post('/api/pdv-images', (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Payload inválido' });
  }
  try {
    writePdvImageMap(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Cloudinary delete proxy ──────────────────────────────────
app.post('/api/cloudinary/delete', async (req, res) => {
  const { productId } = req.body ?? {};
  if (!productId) return res.status(400).json({ error: 'productId obrigatório' });

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return res.status(500).json({ error: 'Cloudinary não configurado no servidor' });
  }

  const publicId = `elchefe-pdv-${productId}`;
  const auth     = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload?public_ids[]=${encodeURIComponent(publicId)}`,
      { method: 'DELETE', headers: { Authorization: `Basic ${auth}` } }
    );
    const data = await response.json();
    res.json({ success: true, deleted: data.deleted ?? {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`El Chefe rodando na porta ${PORT}`);
});
