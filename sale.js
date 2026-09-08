/**
 * PIXEL LED LIGHTS — NAVRATRI SALE 2026 (OFFER PAGES)
 * build.js v4 ka hi design. Repo root mein rakho, build.js ke bagal mein.
 *
 * Har category ka SIRF EK page banta hai — poore products list nahi hote.
 * Page par: category ka naam, MRP kata hua, sale rate, % OFF,
 *           kitne products hain, aur kuch sample photos.
 *
 * Collection ka handle likhne ki zaroorat NAHI — menu.json se khud dhoondh leta hai.
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

  SAMPLES: 6,        // offer page par kitni sample photo. 0 karo to bilkul photo nahi
  ITEMS_FILE: 'sale-items.json',   // individual SKU wale products
  PER_ROW: 4,        // product card kitne per row
  IMG_PX: 300,
  ITEM_IMG_PX: 220,
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
   SALE LIST — sirf yahan badalna hai.
   'menu' = menu.json mein us category ka naam (poora ya thoda sa bhi chalega).
   Agar menu.json mein na mile to 'handle' use ho jayega.
   ========================================================================= */
const SALE = [
  { name: 'ALL WIFI CONTROLLER',   menu: 'Wi-Fi controllers',       mrp: 1000, sale: 900 },
  { name: 'ALL IC CONTROLLER',     menu: 'IC controllers',          mrp: 200,  sale: 150 },
  { name: 'ALL SHINOTIC',          menu: 'Shinotic',                mrp: 700,  sale: 600 },
  { name: 'SHINOTIC WIFI',         menu: 'Shinotic Wifi',           handle: 'shinotic-wifi-controller', mrp: 700, sale: 600 },
  { name: 'ALL SMART CONTROLLER',  menu: 'Smart Controller',        handle: 'smart-controllers',        mrp: 300, sale: 200 }
];

/* ---------- HELPERS (build.js jaise hi) ---------- */
const money = n => 'Rs. ' + Math.round(n).toLocaleString('en-IN');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const stamp = () => new Date().toLocaleString('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: true
}).replace(/\s*(am|pm)/i, m => ' ' + m.trim().toUpperCase());

/* ---------- MENU.JSON ---------- */
/* build.js jaisa hi walk — naam se collection handle nikaalta hai */
function loadMenu() {
  const file = path.join(__dirname, 'menu.json');
  if (!fs.existsSync(file)) { console.log('menu.json nahi mila — sirf handle use honge'); return []; }
  const menu = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = [];
  (function walk(node, trail) {
    for (const [name, v] of Object.entries(node)) {
      const p = [...trail, name];
      const h = (v.url || '').split('/collections/')[1];
      if (h) list.push({ name, path: p, handle: h.split('?')[0].replace(/\/$/, '') });
      walk(v.children || {}, p);
    }
  })(menu, []);
  return list;
}

/* SALE entry se menu.json ke SAARE matching collections nikalo
   (parent + uske sub-collections). Parent khali ho to bhi products mil jayenge. */
function resolveNodes(entry, menu) {
  const term = String(entry.menu || '').toLowerCase().trim();
  let hits = [];

  if (term) {
    const tokens = term.split(/\s+/).filter(Boolean);
    const hasAll = txt => tokens.every(t =>
      new RegExp('(^|[^a-z0-9])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)', 'i').test(txt));

    // jis node ka naam match kare
    const direct = menu.filter(m => hasAll(m.name));

    // + un nodes ke saare sub-collections
    const all = new Set(direct.map(d => d.handle));
    for (const d of direct) {
      const pre = d.path.join(' > ') + ' > ';
      for (const m of menu) if ((m.path.join(' > ') + ' > ').startsWith(pre)) all.add(m.handle);
    }
    hits = menu.filter(m => all.has(m.handle));
  }

  // menu me kuch na mile to diya hua handle
  if (!hits.length) return entry.handle ? { main: entry.handle, handles: [entry.handle] } : null;

  // sabse upar wala node = offer page ka link
  hits.sort((a, b) => a.path.length - b.path.length || a.name.length - b.name.length);
  return { main: hits[0].handle, handles: [...new Set(hits.map(h => h.handle))] };
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

/* Ek collection ke saare product IDs + photos */
async function collectionProducts(handle) {
  const out = [];
  let cursor = null, more = true, guard = 0;
  while (more && guard++ < 40) {
    const d = await gql(`
      query($h: String!, $cursor: String, $px: Int!) {
        collectionByHandle(handle: $h) {
          products(first: 250, after: $cursor, sortKey: BEST_SELLING) {
            nodes {
              id
              featuredImage { url(transform: {maxWidth: $px, maxHeight: $px, preferredContentType: WEBP}) }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`, { h: handle, cursor, px: CFG.IMG_PX });

    if (!d.collectionByHandle) return null;
    const pr = d.collectionByHandle.products;
    out.push(...pr.nodes);
    more = pr.pageInfo.hasNextPage;
    cursor = pr.pageInfo.endCursor;
  }
  return out;
}

/* Sab handles ko jodo, duplicate hatao */
async function fetchGroup(handles) {
  const seen = new Set();
  const samples = [];
  let missing = 0;

  for (const h of handles) {
    const prods = await collectionProducts(h);
    if (prods === null) { missing++; continue; }
    for (const p of prods) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      if (p.featuredImage && samples.length < CFG.SAMPLES) samples.push(p.featuredImage.url);
    }
  }
  if (missing) console.log(`  (${missing} collection Shopify me nahi mile)`);
  return { count: seen.size, samples };
}

/* ---------- ITEM PRODUCTS (sale-items.json ke SKU) ---------- */
function loadItems() {
  const f = path.join(__dirname, CFG.ITEMS_FILE);
  if (!fs.existsSync(f)) { console.log(`${CFG.ITEMS_FILE} nahi mila — sirf offer pages banenge`); return []; }
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

/* SKU se title + photo + link — 40 SKU ek baar mein */
async function fetchBySkus(skus) {
  const found = {};
  for (let i = 0; i < skus.length; i += 40) {
    const chunk = skus.slice(i, i + 40);
    const q = chunk.map(s => `sku:${s}`).join(' OR ');
    const d = await gql(`
      query($q: String!, $px: Int!) {
        productVariants(first: 100, query: $q) {
          nodes {
            sku
            product {
              title handle status
              featuredImage { url(transform: {maxWidth: $px, maxHeight: $px, preferredContentType: WEBP}) }
            }
          }
        }
      }`, { q, px: CFG.ITEM_IMG_PX });

    for (const v of d.productVariants.nodes) {
      if (!v.sku || found[v.sku]) continue;
      found[v.sku] = {
        title: v.product.title,
        img: v.product.featuredImage ? v.product.featuredImage.url : '',
        url: `https://${CFG.WEBSITE.replace(/^www\./, '')}/products/${v.product.handle}`
      };
    }
    console.log(`  SKU ${i + 1}-${i + chunk.length} loaded`);
  }
  return found;
}

/* group ke hisaab se sections banao */
function buildSections(items, found) {
  const secs = [];
  for (const it of items) {
    const p = found[it.sku];
    if (!p) { console.log(`  !! SKU ${it.sku} Shopify mein nahi mila — skip`); continue; }
    let sec = secs.find(s => s.name === it.group);
    if (!sec) { sec = { name: it.group, items: [] }; secs.push(sec); }
    sec.items.push({ ...it, ...p });
  }
  return secs;
}

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

/* ---------- HEADER / FOOTER (build.js se hu-ba-hu) ---------- */
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
const CSS = `
@page { size: A4; }
* { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { margin:0; font-family:Arial,"Helvetica Neue",Helvetica,sans-serif; color:#111827; }

.cover { height:210mm; display:flex; flex-direction:column; align-items:center;
         justify-content:center; text-align:center; page-break-after:always; }
.cover .logo { width:230px; margin-bottom:26px; }
.cover h1 { font-size:38px; letter-spacing:3px; margin:0; }
.cover .tag { color:#6B7280; font-size:15px; margin-top:10px; }
.cover .rule { width:130px; height:5px; background:${CFG.BLUE}; border-radius:3px; margin:28px 0; }
.cover h2 { font-size:27px; margin:0; padding:0 30px; color:${CFG.RED}; letter-spacing:1px; }
.cover .win { font-size:15px; font-weight:bold; color:${CFG.BLUE_DARK}; margin-top:14px;
              background:${CFG.PILL_BG}; padding:8px 20px; border-radius:20px; }
.cover .meta { color:#6B7280; font-size:14px; margin-top:14px; }
.cover .contact { margin-top:45px; font-size:15px; font-weight:bold; }

/* ===== EK CATEGORY = EK PAGE ===== */
.offer { height:205mm; page-break-after:always; break-after:page;
         display:flex; flex-direction:column; align-items:center; text-align:center;
         padding-top:6mm; }
.offer:last-of-type { page-break-after:auto; }

.offer .kicker { font-size:11px; font-weight:bold; letter-spacing:3px; color:${CFG.BLUE};
                 text-transform:uppercase; }
.offer h3 { font-size:34px; line-height:1.15; margin:10px 24px 0; letter-spacing:1px; }
.offer .cnt { display:inline-block; margin-top:12px; background:${CFG.PILL_BG};
              color:${CFG.BLUE_DARK}; font-size:12px; font-weight:bold;
              padding:5px 16px; border-radius:20px; }

.ratebox { margin-top:22px; background:#111827; color:#fff; border-radius:16px;
           padding:20px 46px; display:inline-flex; align-items:center; gap:20px; }
.ratebox .mrp { font-size:20px; color:#9CA3AF; text-decoration:line-through; }
.ratebox .now { font-size:46px; font-weight:bold; color:#93C5FD; line-height:1; }
.ratebox .off { background:${CFG.RED}; color:#fff; font-size:14px; font-weight:bold;
                padding:7px 15px; border-radius:20px; }

.shots { display:flex; flex-wrap:wrap; justify-content:center; gap:10px;
         margin-top:26px; padding:0 14mm; }
.shots div { width:104px; height:104px; background:${CFG.IMG_BG};
             border:1px solid ${CFG.BORDER}; border-radius:14px;
             display:flex; align-items:center; justify-content:center; overflow:hidden; }
.shots img { max-width:88px; max-height:88px; object-fit:contain; }

.cta { margin-top:auto; padding-bottom:6mm; }
.cta a { display:inline-block; background:${CFG.BLUE}; color:#fff !important;
         text-decoration:none; font-size:13px; font-weight:bold; letter-spacing:.6px;
         padding:13px 40px; border-radius:11px; }
.cta .u { display:block; font-size:10px; color:#6B7280; margin-top:9px; }

/* ===== INDIVIDUAL PRODUCT SECTIONS ===== */
.sec { background:#111827; color:#fff; border-radius:8px; padding:9px 14px;
       margin:16px 0 11px; font-size:13.5px; font-weight:bold; letter-spacing:.5px;
       display:flex; justify-content:space-between; align-items:center;
       page-break-after:avoid; break-after:avoid; }
.sec span { font-size:10px; font-weight:normal; color:#9CA3AF; }
.sec.first { page-break-before:always; break-before:page; margin-top:0; }

.grid { display:flex; flex-wrap:wrap; gap:8px; }
.card { width:calc((100% - ${(CFG.PER_ROW - 1) * 8}px) / ${CFG.PER_ROW});
        border:1px solid ${CFG.BORDER}; border-radius:14px; overflow:hidden;
        background:#fff; page-break-inside:avoid; break-inside:avoid; text-align:center; }
.card .imgbox { background:${CFG.IMG_BG}; padding:10px; }
.card .imgbox img { width:88px; height:88px; object-fit:contain; display:block; margin:0 auto; }
.card .title { font-size:10px; font-weight:bold; line-height:13px; height:26px; overflow:hidden;
               margin:9px 6px 0; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.card .sku { display:inline-block; background:${CFG.PILL_BG}; color:${CFG.BLUE_DARK};
             font-size:9px; font-weight:bold; padding:3px 9px; border-radius:20px; margin-top:7px; }
.card .price { margin-top:7px; }
.card .price s { font-size:10px; color:#9CA3AF; margin-right:5px; }
.card .price b { font-size:14px; color:${CFG.RED}; }
.card .price b.plain { color:#111827; }
.card .btn { display:block; background:${CFG.BLUE}; color:#fff !important; text-decoration:none;
             font-size:9px; font-weight:bold; letter-spacing:.4px;
             padding:8px 0; border-radius:9px; margin:8px 6px 9px; }

.back { height:200mm; display:flex; flex-direction:column; align-items:center;
        justify-content:center; text-align:center; page-break-before:always; }
.back .ph { font-size:32px; font-weight:bold; color:${CFG.BLUE_DARK}; margin-top:14px; }
.back .note { font-size:12px; color:#6B7280; margin-top:26px; }
`;

/* ---------- PAGE ---------- */
function offerPage(c) {
  const off = Math.round((1 - c.sale / c.mrp) * 100);
  const link = `https://${CFG.WEBSITE.replace(/^www\./, '')}/collections/${c.handle}`;
  const shots = c.samples.slice(0, CFG.SAMPLES);

  return `<div class="offer">
    <div class="kicker">${esc(CFG.SALE_NAME)}</div>
    <h3>${esc(c.name)}</h3>
    <div><span class="cnt">${c.count} Products</span></div>

    <div><div class="ratebox">
      <span class="mrp">${money(c.mrp)}</span>
      <span class="now">${money(c.sale)}</span>
      <span class="off">${off}% OFF</span>
    </div></div>

    ${shots.length ? `<div class="shots">${shots.map(s => `<div><img src="${s}"></div>`).join('')}</div>` : ''}

    <div class="cta">
      <a href="${link}">ORDER ONLINE</a>
      <span class="u">${esc(link)}</span>
    </div>
  </div>`;
}

function itemCard(p) {
  const hasSale = p.sale && p.sale < p.mrp;
  return `<div class="card">
    <div class="imgbox">${p.img ? `<img src="${p.img}">` : '<div style="height:88px"></div>'}</div>
    <div class="title">${esc(p.title)}</div>
    <div><span class="sku">SKU: ${esc(p.sku)}</span></div>
    <div class="price">${hasSale
      ? `<s>${money(p.mrp)}</s><b>${money(p.sale)}</b>`
      : `<b class="plain">${money(p.mrp)}</b>`}</div>
    <a class="btn" href="${p.url}">ORDER ONLINE</a>
  </div>`;
}

function sectionHtml(sec, first) {
  return `<div class="sec${first ? ' first' : ''}">${esc(sec.name)}<span>${sec.items.length} Products</span></div>
    <div class="grid">${sec.items.map(itemCard).join('')}</div>`;
}

function docHtml(cats, secs, logo) {
  const totalItems = secs.reduce((n, s) => n + s.items.length, 0);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
    <div class="cover">
      ${logo ? `<img class="logo" src="${logo}">` : ''}
      <h1>${CFG.STORE_NAME}</h1>
      <div class="tag">${CFG.TAGLINE}</div>
      <div class="rule"></div>
      <h2>${esc(CFG.SALE_NAME)}</h2>
      <div class="win">${esc(CFG.SALE_DATES)}</div>
      <div class="meta">Updated: ${stamp()} &nbsp;|&nbsp; ${cats.length} Category Offers &nbsp;|&nbsp; ${totalItems} Products</div>
      <div class="contact">${CFG.PHONE} &nbsp;|&nbsp; ${CFG.WEBSITE}</div>
    </div>
    ${cats.map(offerPage).join('')}
    ${secs.map((sc, i) => sectionHtml(sc, i === 0)).join('')}
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

  const menu = loadMenu();
  console.log(`menu.json: ${menu.length} collections mile`);

  const logo = await toDataUri(CFG.LOGO_URL);
  console.log(logo ? 'Logo loaded' : 'Logo missing — text logo use hoga');

  const cats = [];
  for (const e of SALE) {
    const node = resolveNodes(e, menu);
    if (!node) { console.log(`SKIP ${e.name} — menu.json me bhi nahi, handle bhi nahi diya`); continue; }

    const data = await fetchGroup(node.handles);
    if (!data.count) { console.log(`SKIP ${e.name} — ${node.handles.length} collection dekhe, 0 products`); continue; }

    console.log(`${e.name}  ->  ${node.main}  +${node.handles.length - 1} sub  =  ${data.count} products`);
    cats.push({ ...e, handle: node.main, count: data.count, samples: data.samples });
  }

  const items = loadItems();
  let secs = [];
  if (items.length) {
    console.log(`\n${CFG.ITEMS_FILE}: ${items.length} SKU`);
    const found = await fetchBySkus(items.map(i => i.sku));
    secs = buildSections(items, found);
    console.log(`Sections: ${secs.length}, products: ${secs.reduce((n, s) => n + s.items.length, 0)}`);
  }

  if (!cats.length && !secs.length) throw new Error('Kuch nahi mila — SALE list aur sale-items.json check karo');

  fs.mkdirSync(CFG.OUT, { recursive: true });
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setContent(docHtml(cats, secs, logo), { waitUntil: 'networkidle0', timeout: 120000 });

  const file = path.join(CFG.OUT, CFG.OUT_FILE);
  await page.pdf({
    path: file, format: 'A4', printBackground: true, displayHeaderFooter: true,
    headerTemplate: headerTpl(logo, `${CFG.SALE_NAME} • ${CFG.SALE_DATES}`),
    footerTemplate: footerTpl(),
    margin: { top: '30mm', bottom: '20mm', left: '10mm', right: '10mm' }
  });
  await browser.close();

  const mb = fs.statSync(file).size / 1048576;
  console.log(`\n${CFG.OUT_FILE}  ${mb.toFixed(2)} MB  |  ${cats.length} offer pages + ${secs.reduce((n, s) => n + s.items.length, 0)} products`);
  console.log(`Link: https://catalogue.pixelledlights.com/${CFG.OUT_FILE}`);
})();
