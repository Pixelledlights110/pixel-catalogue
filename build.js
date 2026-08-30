/**
 * PIXEL LED LIGHTS — AUTO PDF CATALOGUE (Chrome engine) — v2
 * Naya: har page par branded HEADER (logo + blue diagonal) aur blue FOOTER bar
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const CFG = {
  SHOP: process.env.SHOPIFY_SHOP,
  TOKEN: process.env.SHOPIFY_TOKEN,
  API_VER: '2025-01',

  STORE_NAME: 'PIXEL LED LIGHTS',
  TAGLINE: 'Pixel Controller | SMPS | Connection Patta | Readymade Setup',
  PHONE: '+91 85020 25110',
  WEBSITE: 'www.pixelledlights.com',
  LOGO_URL: 'https://cdn.shopify.com/s/files/1/0767/3708/5675/files/Pixel_1_666e0a93-7aff-43c9-88d3-f9b2c0e14d6e.png?v=1752496194',

  HEADER_RIGHT: '',                        // khaali = category naam + month auto aayega
  FOOTER_NOTE: 'Rates GST extra | Transport charges alag',

  SHOW_PRICE: true,
  ONLY_IN_STOCK: false,
  PER_ROW: 3,
  IMG_PX: 250,
  MAX_MB: 90,          // GitHub ki limit 100MB — isse upar wali file skip ho jayegi

  BLUE: '#2563EB',
  BLUE_DARK: '#1D4ED8',
  PILL_BG: '#EEF2FF',
  IMG_BG: '#F4F5F7',
  BORDER: '#E3E6EA',

  OUT: 'out'
};

const money = n => 'Rs. ' + Math.round(n).toLocaleString('en-IN');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other';

// "Connection Patta > S Type"  ->  "Connection Patta"
const topCat = s => String(s).split('>')[0].trim() || 'Other Products';

/* ---------- LOGO -> base64 (header mein image tabhi dikhti hai) ---------- */
async function toDataUri(url) {
  if (!url) return '';
  try {
    const r = await fetch(url);
    if (!r.ok) return '';
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get('content-type') || 'image/png';
    return `data:${ct};base64,${buf.toString('base64')}`;
  } catch (e) {
    console.log('Logo load fail:', e.message);
    return '';
  }
}

/* ---------- SHOPIFY ---------- */
async function fetchProducts() {
  const out = [];
  let cursor = null, hasNext = true, guard = 0;

  const query = `
    query($cursor: String, $px: Int!) {
      products(first: 100, after: $cursor, query: "status:active", sortKey: TITLE) {
        pageInfo { hasNextPage endCursor }
        nodes {
          title handle productType totalInventory
          featuredImage { url(transform: {maxWidth: $px, maxHeight: $px, preferredContentType: WEBP}) }
          priceRangeV2 { minVariantPrice { amount } maxVariantPrice { amount } }
          variants(first: 1) { nodes { sku } }
        }
      }
    }`;

  while (hasNext && guard++ < 60) {
    const r = await fetch(`https://${CFG.SHOP}/admin/api/${CFG.API_VER}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': CFG.TOKEN },
      body: JSON.stringify({ query, variables: { cursor, px: CFG.IMG_PX } })
    });
    const j = await r.json();
    if (j.errors) throw new Error(JSON.stringify(j.errors));

    for (const n of j.data.products.nodes) {
      if (CFG.ONLY_IN_STOCK && n.totalInventory <= 0) continue;
      out.push({
        title: n.title,
        type: n.productType || 'Other Products',
        sku: (n.variants.nodes[0] || {}).sku || '',
        img: n.featuredImage ? n.featuredImage.url : '',
        url: 'https://' + CFG.WEBSITE.replace(/^www\./, '') + '/products/' + n.handle,
        min: Number(n.priceRangeV2.minVariantPrice.amount),
        max: Number(n.priceRangeV2.maxVariantPrice.amount)
      });
    }
    hasNext = j.data.products.pageInfo.hasNextPage;
    cursor = j.data.products.pageInfo.endCursor;
  }
  return out;
}

/* ---------- HEADER / FOOTER (har page par) ---------- */
function headerTpl(logo, rightText) {
  return `
  <div style="width:100%;height:100%;margin:0;padding:0;position:relative;
              font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;">
    <div style="position:absolute;top:0;right:0;width:58%;height:100%;
                background:${CFG.BLUE_DARK};
                clip-path:polygon(18% 0, 100% 0, 100% 100%, 0 100%);"></div>
    <div style="position:absolute;top:0;right:0;width:58%;height:100%;
                background:${CFG.BLUE};opacity:.40;
                clip-path:polygon(34% 0, 100% 0, 100% 100%, 16% 100%);"></div>
    ${logo
      ? `<img src="${logo}" style="position:absolute;left:34px;top:14px;height:34px;">`
      : `<div style="position:absolute;left:34px;top:20px;font-size:15px;font-weight:bold;
                     color:${CFG.BLUE_DARK};letter-spacing:1px;">${CFG.STORE_NAME}</div>`}
    <div style="position:absolute;right:34px;top:24px;color:#ffffff;
                font-size:10px;font-weight:bold;letter-spacing:1.2px;">${rightText}</div>
  </div>`;
}

function footerTpl() {
  return `
  <div style="width:100%;height:100%;margin:0;padding:0;position:relative;
              font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;">
    <div style="position:absolute;bottom:0;left:0;width:100%;height:30px;
                background:${CFG.BLUE_DARK};color:#ffffff;font-size:8.5px;">
      <div style="position:absolute;left:34px;top:10px;font-weight:bold;">${CFG.WEBSITE}</div>
      <div style="position:absolute;left:0;right:0;top:10px;text-align:center;">
        WhatsApp: ${CFG.PHONE} &nbsp;&nbsp;|&nbsp;&nbsp; ${CFG.FOOTER_NOTE}
      </div>
      <div style="position:absolute;right:34px;top:10px;font-weight:bold;">
        <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>
    </div>
  </div>`;
}

/* ---------- PAGE CSS ---------- */
function css() {
  return `
  @page { size: A4; }
  * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { margin:0; font-family:Arial,"Helvetica Neue",Helvetica,sans-serif; color:#111827; }

  .cover { height:225mm; display:flex; flex-direction:column; align-items:center;
           justify-content:center; text-align:center; page-break-after:always; }
  .cover .logo { width:230px; margin-bottom:26px; }
  .cover h1 { font-size:40px; letter-spacing:3px; margin:0; }
  .cover .tag { color:#6B7280; font-size:15px; margin-top:10px; }
  .cover .rule { width:130px; height:5px; background:${CFG.BLUE}; border-radius:3px; margin:30px 0; }
  .cover h2 { font-size:26px; margin:0; }
  .cover .meta { color:#6B7280; font-size:14px; margin-top:10px; }
  .cover .contact { margin-top:50px; font-size:15px; font-weight:bold; }

  .cat { background:#111827; color:#fff; font-size:15px; font-weight:bold;
         padding:9px 14px; border-radius:8px; margin:14px 0 11px;
         page-break-after:avoid; break-after:avoid; }

  .grid { display:flex; flex-wrap:wrap; gap:9px; }
  .card { width:calc((100% - ${(CFG.PER_ROW - 1) * 9}px) / ${CFG.PER_ROW});
          border:1px solid ${CFG.BORDER}; border-radius:14px; overflow:hidden;
          background:#fff; page-break-inside:avoid; break-inside:avoid; text-align:center; }

  .imgbox { background:${CFG.IMG_BG}; padding:12px; }
  .imgbox img { width:118px; height:118px; object-fit:contain; display:block; margin:0 auto; }

  .title { font-size:11px; font-weight:bold; line-height:14px; height:28px; overflow:hidden;
           margin:10px 8px 0; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }

  .sku { display:inline-block; background:${CFG.PILL_BG}; color:${CFG.BLUE_DARK};
         font-size:9.5px; font-weight:bold; padding:3px 10px; border-radius:20px; margin-top:8px; }

  .price { font-size:15px; font-weight:bold; color:#111827; margin-top:8px; }

  .btn { display:block; background:${CFG.BLUE}; color:#fff !important; text-decoration:none;
         font-size:10.5px; font-weight:bold; letter-spacing:.4px;
         padding:9px 0; border-radius:9px; margin:9px 8px 10px; }

  .back { height:215mm; display:flex; flex-direction:column; align-items:center;
          justify-content:center; text-align:center; page-break-before:always; }
  .back .ph { font-size:32px; font-weight:bold; color:${CFG.BLUE_DARK}; margin-top:14px; }
  .back .note { font-size:12px; color:#6B7280; margin-top:26px; }
  `;
}

function cardHtml(p) {
  return `<div class="card">
    <div class="imgbox">${p.img ? `<img src="${p.img}">` : '<div style="height:118px"></div>'}</div>
    <div class="title">${esc(p.title)}</div>
    ${p.sku ? `<div><span class="sku">SKU: ${esc(p.sku)}</span></div>` : ''}
    ${CFG.SHOW_PRICE ? `<div class="price">${money(p.min)}${p.max > p.min ? ' +' : ''}</div>` : ''}
    <a class="btn" href="${p.url}">ORDER ONLINE</a>
  </div>`;
}

function pageHtml(titleText, products, logo) {
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const groups = {};
  products.forEach(p => { (groups[p.type] ||= []).push(p); });

  let body = '';
  Object.keys(groups).sort().forEach(g => {
    body += `<div class="cat">${esc(g)}</div><div class="grid">`;
    body += groups[g].map(cardHtml).join('');
    body += '</div>';
  });

  return `<!doctype html><html><head><meta charset="utf-8"><style>${css()}</style></head><body>
    <div class="cover">
      ${logo ? `<img class="logo" src="${logo}">` : ''}
      <h1>${CFG.STORE_NAME}</h1>
      <div class="tag">${CFG.TAGLINE}</div>
      <div class="rule"></div>
      <h2>${esc(titleText.toUpperCase())}</h2>
      <div class="meta">Updated: ${today} &nbsp;|&nbsp; ${products.length} Products</div>
      <div class="contact">${CFG.PHONE} &nbsp;|&nbsp; ${CFG.WEBSITE}</div>
    </div>
    ${body}
    <div class="back">
      <div style="font-size:22px;font-weight:bold;">Order ke liye Call ya WhatsApp karein</div>
      <div class="ph">${CFG.PHONE}</div>
      <div style="font-size:16px;margin-top:12px;">${CFG.WEBSITE}</div>
      <div class="note">Rates bina notice ke change ho sakte hain. Latest rate website par dekhein.</div>
    </div>
  </body></html>`;
}

/* ---------- PDF ---------- */
async function printPdf(browser, html, file, logo, rightText) {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 240000 });
  await page.pdf({
    path: file,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: headerTpl(logo, rightText),
    footerTemplate: footerTpl(),
    margin: { top: '24mm', bottom: '20mm', left: '10mm', right: '10mm' }
  });
  await page.close();

  const mb = fs.statSync(file).size / 1048576;
  if (mb > CFG.MAX_MB) {
    fs.unlinkSync(file);
    console.log(`  !! ${path.basename(file)}  ${mb.toFixed(1)} MB — bahut bada, SKIP kiya`);
    return false;
  }
  console.log(`  ${path.basename(file)}  ${mb.toFixed(1)} MB`);
  return true;
}

/* ---------- MAIN ---------- */
(async () => {
  if (!CFG.SHOP || !CFG.TOKEN) throw new Error('SHOPIFY_SHOP / SHOPIFY_TOKEN missing');

  const logo = await toDataUri(CFG.LOGO_URL);
  console.log(logo ? 'Logo loaded' : 'Logo missing — text logo use hoga');

  console.log('Fetching products...');
  const products = await fetchProducts();
  console.log(`Total: ${products.length}`);

  fs.mkdirSync(CFG.OUT, { recursive: true });
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  const monthYear = new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }).toUpperCase();

  const byCat = {};
  products.forEach(p => { (byCat[topCat(p.type)] ||= []).push(p); });

  const index = [];
  for (const cat of Object.keys(byCat).sort()) {
    const file = path.join(CFG.OUT, slug(cat) + '.pdf');
    const right = CFG.HEADER_RIGHT || `${cat.toUpperCase()} • ${monthYear}`;
    console.log(`Building ${cat} (${byCat[cat].length})`);
    const ok = await printPdf(browser, pageHtml(cat, byCat[cat], logo), file, logo, right);
    if (ok) index.push({ name: cat, file: slug(cat) + '.pdf', count: byCat[cat].length });
  }

  console.log(`Building FULL (${products.length})`);
  const fullOk = await printPdf(browser, pageHtml('Full Catalogue', products, logo),
                 path.join(CFG.OUT, 'full-catalogue.pdf'), logo,
                 CFG.HEADER_RIGHT || `PRICE LIST • ${monthYear}`);
  if (fullOk) index.unshift({ name: 'Full Catalogue', file: 'full-catalogue.pdf', count: products.length });

  await browser.close();

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  fs.writeFileSync(path.join(CFG.OUT, 'index.html'), `<!doctype html><html><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${CFG.STORE_NAME} — Catalogue</title>
    <style>body{font-family:Arial;max-width:640px;margin:30px auto;padding:0 16px;color:#111827}
    h1{font-size:22px}a{display:block;padding:14px;margin:8px 0;border:1px solid #E3E6EA;border-radius:12px;
    text-decoration:none;color:#111827;font-weight:bold}span{float:right;color:#6B7280;font-weight:normal}
    </style></head><body><h1>${CFG.STORE_NAME} — Catalogue</h1>
    <p style="color:#6B7280">Updated: ${today}</p>
    ${index.map(i => `<a href="${i.file}">${esc(i.name)}<span>${i.count}</span></a>`).join('')}
    </body></html>`);

  console.log('\nDone. Files in /out');
})();
