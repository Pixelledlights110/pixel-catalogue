/**
 * PIXEL LED LIGHTS — AUTO PDF CATALOGUE (Chrome engine)
 * Shopify Admin API -> HTML -> Chrome print -> category-wise PDFs
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const CFG = {
  SHOP: process.env.SHOPIFY_SHOP,        // pixelledlights.myshopify.com
  TOKEN: process.env.SHOPIFY_TOKEN,      // shpat_...
  API_VER: '2025-01',

  STORE_NAME: 'PIXEL LED LIGHTS',
  TAGLINE: 'Pixel Controller | SMPS | Connection Patta | Readymade Setup',
  PHONE: '+91-XXXXXXXXXX',
  WEBSITE: 'www.pixelledlights.com',
  LOGO_URL: '',                          // public logo URL (optional)

  SHOW_PRICE: true,
  ONLY_IN_STOCK: false,
  PER_ROW: 3,
  IMG_PX: 400,

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

/* ---------------- SHOPIFY ---------------- */
async function fetchProducts() {
  const out = [];
  let cursor = null, hasNext = true, guard = 0;

  const query = `
    query($cursor: String, $px: Int!) {
      products(first: 100, after: $cursor, query: "status:active", sortKey: TITLE) {
        pageInfo { hasNextPage endCursor }
        nodes {
          title handle productType totalInventory
          featuredImage { url(transform: {maxWidth: $px, maxHeight: $px}) }
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

/* ---------------- HTML ---------------- */
function css() {
  return `
  @page { size: A4; margin: 14mm 10mm 16mm 10mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin:0; font-family: Arial, "Helvetica Neue", Helvetica, sans-serif; color:#111827; }

  .cover { height: 250mm; display:flex; flex-direction:column; align-items:center; justify-content:center;
           text-align:center; page-break-after: always; }
  .cover .logo { width: 230px; margin-bottom: 26px; }
  .cover h1 { font-size: 40px; letter-spacing: 3px; margin: 0; }
  .cover .tag { color:#6B7280; font-size: 15px; margin-top: 10px; }
  .cover .rule { width: 130px; height: 5px; background: ${CFG.BLUE}; border-radius: 3px; margin: 30px 0; }
  .cover h2 { font-size: 26px; margin: 0; }
  .cover .meta { color:#6B7280; font-size: 14px; margin-top: 10px; }
  .cover .contact { margin-top: 55px; font-size: 15px; font-weight: bold; }

  .cat { background:#111827; color:#fff; font-size:15px; font-weight:bold;
         padding:9px 14px; border-radius:8px; margin: 16px 0 12px;
         page-break-after: avoid; break-after: avoid; }

  .grid { display:flex; flex-wrap:wrap; gap:9px; }
  .card { width: calc((100% - ${(CFG.PER_ROW - 1) * 9}px) / ${CFG.PER_ROW});
          border:1px solid ${CFG.BORDER}; border-radius:14px; overflow:hidden;
          background:#fff; page-break-inside: avoid; break-inside: avoid; text-align:center; }

  .imgbox { background:${CFG.IMG_BG}; padding:12px; }
  .imgbox img { width:118px; height:118px; object-fit:contain; display:block; margin:0 auto; }

  .title { font-size:11px; font-weight:bold; line-height:14px; height:28px;
           overflow:hidden; margin:10px 8px 0; color:#111827;
           display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }

  .sku { display:inline-block; background:${CFG.PILL_BG}; color:${CFG.BLUE_DARK};
         font-size:9.5px; font-weight:bold; padding:3px 10px; border-radius:20px; margin-top:8px; }

  .price { font-size:15px; font-weight:bold; color:#111827; margin-top:8px; }

  .btn { display:block; background:${CFG.BLUE}; color:#fff !important; text-decoration:none;
         font-size:10.5px; font-weight:bold; letter-spacing:.4px;
         padding:9px 0; border-radius:9px; margin:9px 8px 10px; }

  .back { height: 240mm; display:flex; flex-direction:column; align-items:center; justify-content:center;
          text-align:center; page-break-before: always; }
  .back .ph { font-size:32px; font-weight:bold; color:${CFG.BLUE_DARK}; margin-top:14px; }
  .back .note { font-size:12px; color:#6B7280; margin-top:28px; }
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

function pageHtml(titleText, products, groupByType) {
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const groups = {};
  products.forEach(p => { (groups[groupByType ? p.type : titleText] ||= []).push(p); });

  let body = '';
  Object.keys(groups).sort().forEach(g => {
    body += `<div class="cat">${esc(g)}</div><div class="grid">`;
    body += groups[g].map(cardHtml).join('');
    body += '</div>';
  });

  return `<!doctype html><html><head><meta charset="utf-8"><style>${css()}</style></head><body>
    <div class="cover">
      ${CFG.LOGO_URL ? `<img class="logo" src="${CFG.LOGO_URL}">` : ''}
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

/* ---------------- PDF ---------------- */
async function printPdf(browser, html, file) {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 180000 });
  await page.pdf({
    path: file,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `<div style="width:100%;font-size:8px;color:#9CA3AF;padding:0 12mm;
        display:flex;justify-content:space-between;font-family:Arial;">
        <span>${CFG.STORE_NAME} &nbsp;|&nbsp; ${CFG.PHONE}</span>
        <span class="pageNumber"></span></div>`,
    margin: { top: '14mm', bottom: '16mm', left: '10mm', right: '10mm' }
  });
  await page.close();
  const mb = (fs.statSync(file).size / 1048576).toFixed(1);
  console.log(`  ${path.basename(file)}  ${mb} MB`);
}

/* ---------------- MAIN ---------------- */
(async () => {
  if (!CFG.SHOP || !CFG.TOKEN) throw new Error('SHOPIFY_SHOP / SHOPIFY_TOKEN missing');

  console.log('Fetching products...');
  const products = await fetchProducts();
  console.log(`Total: ${products.length}`);

  fs.mkdirSync(CFG.OUT, { recursive: true });
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  // category-wise PDFs
  const byCat = {};
  products.forEach(p => { (byCat[p.type] ||= []).push(p); });

  const index = [];
  for (const cat of Object.keys(byCat).sort()) {
    const file = path.join(CFG.OUT, slug(cat) + '.pdf');
    console.log(`Building ${cat} (${byCat[cat].length})`);
    await printPdf(browser, pageHtml(cat, byCat[cat], false), file);
    index.push({ name: cat, file: slug(cat) + '.pdf', count: byCat[cat].length });
  }

  // full catalogue
  console.log(`Building FULL (${products.length})`);
  await printPdf(browser, pageHtml('Full Catalogue', products, true), path.join(CFG.OUT, 'full-catalogue.pdf'));
  index.unshift({ name: 'Full Catalogue', file: 'full-catalogue.pdf', count: products.length });

  await browser.close();

  // index page
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
