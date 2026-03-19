/**
 * generate-pdv-manifest.js
 * Gera assets/img/pdv/manifest.json com todos os arquivos de imagem da pasta.
 * Uso: npm run manifest
 */

const fs   = require('fs');
const path = require('path');

const dir      = path.join(__dirname, '..', 'assets', 'img', 'pdv');
const outFile  = path.join(dir, 'manifest.json');
const exts     = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

const files = fs.readdirSync(dir)
  .filter(f => exts.includes(path.extname(f).toLowerCase()))
  .sort();

fs.writeFileSync(outFile, JSON.stringify(files, null, 2) + '\n');
console.log(`manifest.json gerado com ${files.length} imagem(ns):`);
files.forEach(f => console.log(`  - ${f}`));
