'use strict';

const express = require('express');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ── Cache headers ────────────────────────────────────────────
app.use((req, res, next) => {
  const url = req.path;
  if (/\.(js|css|woff2?|ttf|eot)$/.test(url)) {
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
