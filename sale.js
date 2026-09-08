/**
 * PIXEL LED LIGHTS — NAVRATRI SALE 2026 CATALOGUE
 * build.js v4 ka hi design. Repo root mein rakho, build.js ke bagal mein.
 *
 * Farq sirf itna:
 *  - Products menu.json se nahi, SALE list se aate hain (product_type ya collection)
 *  - Har category apne NAYE PAGE se shuru hoti hai
 *  - Card par MRP kata hua + Sale price
 *
 * Run: node sale.js   ->  out/navratri-sale-2026.pdf
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
  PHONE: '7742539573 | 9114111172 | 9114111173 | 9114111174',
  WEBSITE: 'www.pixelledlights.com',
  LOGO_URL: 'https://cdn.shopify.com/s/files/1/0767/3708/5675/files/Pixel_1_666e0a93-7aff-43c9-88d3-f9b2c0e14d6e.png?v=1752496194',

  SALE_NAME: 'NAVRATRI DHAMAKA SALE 2026',
  SALE_DATES: '22 SEPT - 10 OCT 2026',
  FOOTER_NOTE: 'Rates GST extra | Transport charges alag',

  ONLY_IN_STOCK: false,
  PER_ROW: 4,
  IMG_PX: 200,
  MAX_MB: 90,

  OUT: 'out',
  OUT_FILE: 'navratri-sale-2026.pdf',

  BLUE: '#2563EB',
  BLUE_DARK: '#1D4ED8',
  RED: '#DC2626',
  PILL_BG: '#EEF2FF',
  IMG_BG: '#F4F5F7',
  BORDER: '#E3E6EA'
};

/* =========================================================================
   SALE LIST — sirf yahan badalna hai
   type: 'type'       -> product_type mein ye shabd aata ho
         'collection' -> collection ka handle
   ========================================================================= */
const SALE = [
  { name: 'ALL WIFI CONTROLLER',  type: 'type',       match: 'Wi-Fi',            mrp: 1000, sale: 900 },
  { name: 'ALL IC CONTROLLER',    type: 'type',       match: 'IC controllers',   mrp: 200,  sale: 150 },
  { name: 'ALL SHINOTIC',         type: 'collection', match: 'shinotic',         mrp: 700,  sale: 600 },
  { name: 'SHINOTIC WIFI',        type: 'collection', match: 'shinotic-wifi',    mrp: 700,  sale: 600 },
  { name: 'ALL SMART CONTROLLER', type: 'collection', match: 'smart-controller', mrp: 300,  sale: 200 }
];

/* ---------- HELPERS (build.js jaise hi) ---------- */
const money = n => 'Rs. ' + Math.round(n).toLocaleString('en-IN');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const stamp = () => new Date().toLocaleString('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: true
}).replace(/\s*(am|pm)/i, m => ' ' + m.trim().toUpperCase());

const nat = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
const bySku = (a, b) =>
  (!a.sku && !b.sku) ? nat(a.title, b.title)
  : !a.sku ? 1
  : !b.sku ? -1
  : nat(a.sku, b.sku);

/* ---------- LOGO ---------- */
async function toDataUri(url) {
  if (!url) return '';
  try {
    const r = await fetch(url);
    if (!r.ok) return '';
    const buf = Buffer.from(await r.arrayBuffer());
    return `data:${r.headers.get('content-type') || 'image/png'};base64,${buf.toString('base64')}`;
  } catch (e) { console.log('Logo load fail:', e.message); return ''; }
}

/* ---------- SHOPIFY ---------- */
async function gql(query, variables) {
  const r = await fetch(`https://${CFG.SHOP}/admin/api/${CFG.API_VER}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': CFG.TOKEN },
    body: JSON.stringify({ query, variables })
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const NODE_FIELDS = `
  nodes {
    title handle totalInventory
    featuredImage { url(transform: {maxWidth: $px, maxHeight: $px, preferredContentType: WEBP}) }
    variants(first: 1) { nodes { sku } }
  }
  pageInfo { hasNextPage endCursor }
`;

function shape(n) {
  return {
    title: n.title,
    sku: (n.variants.nodes[0] || {}).sku || '',
    img: n.featuredImage ? n.featuredImage.url : '',
    url: 'https://' + CFG.WEBSITE.replace(/^www\./, '') + '/products/' + n.handle,
    stock: n.totalInventory
  };
}

async function byType(word) {
  const out = [];
  let cursor = null, more = true, guard = 0;
  while (more && guard++ < 60) {
    const d = await gql(`
      query($q: String!, $cursor: String, $px: Int!) {
        products(first: 100, after: $cursor, query: $q, sortKey: TITLE) { ${NODE_FIELDS} }
      }`, { q: `status:active AND product_type:*${word}*`, cursor, px: CFG.IMG_PX });
    out.push(...d.products.nodes.map(shape));
    more = d.products.pageInfo.hasNextPage;
    cursor = d.products.pageInfo.endCursor;
  }
  return out;
}

async function byCollection(handle) {
  const out = [];
  let cursor = null, more = true, guard = 0;
  while (more && guard++ < 60) {
    const d = await gql(`
      query($h: String!, $cursor: String, $px: Int!) {
        collectionByHandle(handle: $h) {
          products(first: 100, after: $cursor) { ${NODE_FIELDS} }
        }
      }`, { h: handle, cursor, px: CFG.IMG_PX });
    if (!d.collectionByHandle) {
      console.log(`  !! collection "${handle}" nahi mila — SKIP`);
      return [];
    }
    out.push(...d.collectionByHandle.products.nodes.map(shape));
    more = d.collectionByHandle.products.pageInfo.hasNextPage;
    cursor = d.collectionByHandle.products.pageInfo.endCursor;
  }
  return out;
}

async function loadCat(cat) {
  const raw = cat.type === 'type' ? await byType(cat.match) : await byCollection(cat.match);
  const seen = new Set();
  return raw
    .filter(p => !CFG.ONLY_IN_STOCK || p.stock > 0)
    .filter(p => { const k = p.sku + '|' + p.title; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort(bySku);
}

/* ---------- HEADER / FOOTER (build.js se same) ---------- */
function headerTpl(logo, rightText) {
  return `
  <div style="width:100%;height:100%;margin:0;padding:0;position:relative;
              font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;">
    <div style="position:absolute;top:0;right:0;width:58%;height:66%;background:${CFG.BLUE_DARK};
                clip-path:polygon(18% 0, 100% 0, 100% 100%, 0 100%);"></div>
    <div style="position:absolute;top:0;right:0;width:58%;height:66%;background:${CFG.BLUE};opacity:.40;
                clip-path:polygon(34% 0, 100% 0, 100% 100%, 16% 100%);"></div>
    ${logo
      ? `<img src="${logo}" style="position:absolute;left:34px;top:12px;height:30px;">`
      : `<div style="position:absolute;left:34px;top:17px;font-size:14px;font-weight:bold;
                     color:${CFG.BLUE_DARK};letter-spacing:1px;">${CFG.STORE_NAME}</div>`}
    <div style="position:absolute;right:34px;top:20px;color:#ffffff;
                font-size:9px;font-weight:bold;letter-spacing:1px;">${rightText}</div>
  </div>`;
}

function footerTpl() {
  return `
  <div style="width:100%;height:100%;margin:0;padding:0;position:relative;
              font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;">
    <div style="position:absolute;bottom:0;left:0;width:100%;height:28px;
                background:${CFG.BLUE_DARK};color:#ffffff;font-size:8.5px;">
      <div style="position:absolute;left:34px;top:9px;font-weight:bold;">${CFG.WEBSITE}</div>
      <div style="position:absolute;left:0;right:0;top:9px;text-align:center;">
        WhatsApp: ${CFG.PHONE} &nbsp;&nbsp;|&nbsp;&nbsp; ${CFG.FOOTER_NOTE}
      </div>
      <div style="position:absolute;right:34px;top:9px;font-weight:bold;">
        <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>
    </div>
  </div>`;
}

/* ---------- CSS ---------- */
function css() {
  const perRow = CFG.PER_ROW, imgW = perRow >= 4 ? 88 : 118;
  return `
  @page { size: A4; }
  * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { margin:0; font-family:Arial,"Helvetica Neue",Helvetica,sans-serif; color:#111827; }

  .cover { height:210mm; display:flex; flex-direction:column; align-items:center;
           justify-content:center; text-align:center; page-break-after:always; }
  .cover .logo { width:230px; margin-bottom:26px; }
  .cover h1 { font-size:38px; letter-spacing:3px; margin:0; }
  .cover .tag { color:#6B7280; font-size:15px; margin-top:10px; }
  .cover .rule { width:130px; height:5px; background:${CFG.BLUE}; border-radius:3px; margin:28px 0; }
  .cover h2 { font-size:26px; margin:0; padding:0 30px; color:${CFG.RED}; letter-spacing:1px; }
  .cover .win { font-size:15px; font-weight:bold; color:${CFG.BLUE_DARK}; margin-top:14px;
                background:${CFG.PILL_BG}; padding:7px 18px; border-radius:20px; }
  .cover .meta { color:#6B7280; font-size:14px; margin-top:14px; }
  .cover .contact { margin-top:45px; font-size:15px; font-weight:bold; }

  /* har category naye page se */
  .cat { page-break-before:always; break-before:page;
         background:#111827; color:#fff; border-radius:8px;
         padding:10px 14px; margin:0 0 11px;
         display:flex; justify-content:space-between; align-items:center;
         page-break-after:avoid; break-after:avoid; }
  .cat .nm { font-size:14px; font-weight:bold; letter-spacing:.5px; }
  .cat .cnt { font-size:10px; color:#9CA3AF; margin-top:3px; }
  .cat .rt { font-size:12px; white-space:nowrap; }
  .cat .rt s { color:#9CA3AF; margin-right:7px; }
  .cat .rt b { color:#93C5FD; font-size:15px; }
  .cat .rt em { font-style:normal; background:${CFG.RED}; color:#fff; font-weight:bold;
                font-size:10px; padding:3px 8px; border-radius:12px; margin-left:8px; }

  .grid { display:flex; flex-wrap:wrap; gap:8px; }
  .card { width:calc((100% - ${(perRow - 1) * 8}px) / ${perRow});
          border:1px solid ${CFG.BORDER}; border-radius:14px; overflow:hidden;
          background:#fff; page-break-inside:avoid; break-inside:avoid; text-align:center; }

  .imgbox { background:${CFG.IMG_BG}; padding:10px; }
  .imgbox img { width:${imgW}px; height:${imgW}px; object-fit:contain; display:block; margin:0 auto; }

  .title { font-size:${perRow >= 4 ? 10 : 11}px; font-weight:bold;
           line-height:${perRow >= 4 ? 13 : 14}px; height:${perRow >= 4 ? 26 : 28}px;
           overflow:hidden; margin:9px 6px 0;
           display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }

  .sku { display:inline-block; background:${CFG.PILL_BG}; color:${CFG.BLUE_DARK};
         font-size:9px; font-weight:bold; padding:3px 9px; border-radius:20px; margin-top:7px; }

  .price { margin-top:7px; }
  .price s { font-size:${perRow >= 4 ? 10 : 11}px; color:#9CA3AF; margin-right:5px; }
  .price b { font-size:${perRow >= 4 ? 14 : 16}px; color:${CFG.RED}; }

  .btn { display:block; background:${CFG.BLUE}; color:#fff !important; text-decoration:none;
         font-size:${perRow >= 4 ? 9 : 10.5}px; font-weight:bold; letter-spacing:.4px;
         padding:8px 0; border-radius:9px; margin:8px 6px 9px; }

  .back { height:200mm; display:flex; flex-direction:column; align-items:center;
          justify-content:center; text-align:center; page-break-before:always; }
  .back .ph { font-size:32px; font-weight:bold; color:${CFG.BLUE_DARK}; margin-top:14px; }
  .back .note { font-size:12px; color:#6B7280; margin-top:26px; }
  `;
}

function cardHtml(p, cat) {
  const blank = CFG.PER_ROW >= 4 ? 88 : 118;
  return `<div class="card">
    <div class="imgbox">${p.img ? `<img src="${p.img}">` : `<div style="height:${blank}px"></div>`}</div>
    <div class="title">${esc(p.title)}</div>
    ${p.sku ? `<div><span class="sku">SKU: ${esc(p.sku)}</span></div>` : ''}
    <div class="price"><s>${money(cat.mrp)}</s><b>${money(cat.sale)}</b></div>
    <a class="btn" href="${p.url}">ORDER ONLINE</a>
  </div>`;
}

function docHtml(cats, total, logo) {
  let body = '';
  for (const c of cats) {
    const off = Math.round((1 - c.sale / c.mrp) * 100);
    body += `<div class="cat">
      <div><div class="nm">${esc(c.name)}</div><div class="cnt">${c.items.length} Products</div></div>
      <div class="rt"><s>${money(c.mrp)}</s><b>${money(c.sale)}</b><em>${off}% OFF</em></div>
    </div><div class="grid">${c.items.map(p => cardHtml(p, c)).join('')}</div>`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><style>${css()}</style></head><body>
    <div class="cover">
      ${logo ? `<img class="logo" src="${logo}">` : ''}
      <h1>${CFG.STORE_NAME}</h1>
      <div class="tag">${CFG.TAGLINE}</div>
      <div class="rule"></div>
      <h2>${esc(CFG.SALE_NAME)}</h2>
      <div class="win">${esc(CFG.SALE_DATES)}</div>
      <div class="meta">Updated: ${stamp()} &nbsp;|&nbsp; ${total} Products</div>
      <div class="contact">${CFG.PHONE} &nbsp;|&nbsp; ${CFG.WEBSITE}</div>
    </div>
    ${body}
    <div class="back">
      <div style="font-size:22px;font-weight:bold;">Order ke liye Call ya WhatsApp karein</div>
      <div class="ph">${CFG.PHONE}</div>
      <div style="font-size:16px;margin-top:12px;">${CFG.WEBSITE}</div>
      <div class="note">Sale rates sirf ${esc(CFG.SALE_DATES)} tak. Rates bina notice ke change ho sakte hain.</div>
    </div>
  </body></html>`;
}

/* ---------- MAIN ---------- */
(async () => {
  if (!CFG.SHOP || !CFG.TOKEN) throw new Error('SHOPIFY_SHOP / SHOPIFY_TOKEN missing');

  const logo = await toDataUri(CFG.LOGO_URL);
  console.log(logo ? 'Logo loaded' : 'Logo missing — text logo use hoga');

  const cats = [];
  for (const c of SALE) {
    console.log(`Loading ${c.name} ...`);
    const items = await loadCat(c);
    console.log(`  -> ${items.length} products`);
    if (items.length) cats.push({ ...c, items });
  }
  if (!cats.length) throw new Error('Ek bhi product nahi mila — SALE list check karo');

  const total = cats.reduce((n, c) => n + c.items.length, 0);
  fs.mkdirSync(CFG.OUT, { recursive: true });

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setContent(docHtml(cats, total, logo), { waitUntil: 'networkidle0', timeout: 240000 });

  const file = path.join(CFG.OUT, CFG.OUT_FILE);
  await page.pdf({
    path: file, format: 'A4', printBackground: true, displayHeaderFooter: true,
    headerTemplate: headerTpl(logo, `${CFG.SALE_NAME} • ${CFG.SALE_DATES}`),
    footerTemplate: footerTpl(),
    margin: { top: '30mm', bottom: '20mm', left: '10mm', right: '10mm' }
  });
  await browser.close();

  const mb = fs.statSync(file).size / 1048576;
  console.log(`\n${CFG.OUT_FILE}  ${mb.toFixed(1)} MB  |  ${total} products  |  ${cats.length} categories`);
  if (mb > CFG.MAX_MB) console.log('!! 90MB se upar — IMG_PX kam karo');
  console.log(`Link: https://catalogue.pixelledlights.com/${CFG.OUT_FILE}`);
})();
