const PROFILE_ID = '12479569623414008742';
const GH_USER = 'hronek';
const FALLBACK_BLOGS = [
  'https://hronek-izrael.blogspot.com',
  'https://hronek-velehrad.blogspot.com',
  'https://hronek-rim.blogspot.com',
];
const FALLBACK_REPOS = [
  { name: 'EcotrendIstaCzHA', description: 'ista EcoTrend CZ integration for Home Assistant', language: 'Python', stargazers_count: 0, html_url: 'https://github.com/hronek/EcotrendIstaCzHA' },
  { name: 'cropAndRotate', description: '', language: 'Python', stargazers_count: 0, html_url: 'https://github.com/hronek/cropAndRotate' },
];

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

document.getElementById('year').textContent = new Date().getFullYear();

// Theme toggle
const root = document.documentElement;
try { const t = localStorage.getItem('theme'); if (t) root.dataset.theme = t; } catch {}
$('#theme').onclick = () => {
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('theme', root.dataset.theme); } catch {}
};

// ---------- Blogs ----------
// Seznam blogů z profilu udržuje GitHub Action (blogs.json, každou hodinu) – profil Bloggeru nelze z prohlížeče číst (CORS).
async function loadBlogList() {
  try {
    const r = await fetch('blogs.json', { cache: 'no-cache' });
    if (r.ok) { const j = await r.json(); if (j.length) return j; }
  } catch {}
  return FALLBACK_BLOGS;
}

function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = 'bcb' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    window[cb] = (d) => { delete window[cb]; s.remove(); resolve(d); };
    s.onerror = () => { delete window[cb]; s.remove(); reject(new Error('jsonp')); };
    s.src = `${url}/feeds/posts/default?alt=json-in-script&max-results=500&callback=${cb}`;
    document.head.appendChild(s);
  });
}

async function loadFeed(url) {
  let data;
  try {
    const r = await fetch(`${url}/feeds/posts/default?alt=json&max-results=500`);
    data = await r.json();
  } catch { data = await jsonp(url); }
  const feed = data.feed;
  const own = (feed.author || []).some((a) => (a.uri?.$t || '').includes(PROFILE_ID));
  if (!own) return null;
  const posts = (feed.entry || []).map((e) => ({
    title: e.title?.$t || '',
    date: new Date(e.published.$t),
    html: e.content?.$t || e.summary?.$t || '',
    link: (e.link.find((l) => l.rel === 'alternate') || {}).href,
  })).sort((a, b) => a.date - b.date);
  return { title: feed.title.$t, url, posts };
}

function sanitize(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,object,embed,link,meta').forEach((n) => n.remove());
  // Obrázky: odbalit z odkazů na velký soubor (aby se neodskakovalo), zvětšit z náhledu, zobrazit inline
  doc.querySelectorAll('a').forEach((a) => {
    const img = a.querySelector('img');
    if (img && a.textContent.trim() === '') a.replaceWith(img);
  });
  doc.querySelectorAll('*').forEach((n) => {
    [...n.attributes].forEach((a) => {
      if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name);
    });
    if (n.tagName === 'IMG') {
      const big = (n.getAttribute('src') || '').replace(/\/(s\d+|w\d+-h\d+)(-[a-z]+)*\//, '/s1600/');
      ['width', 'height', 'style', 'srcset'].forEach((k) => n.removeAttribute(k));
      n.src = big;
      n.dataset.full = big;
      n.loading = 'lazy';
      n.referrerPolicy = 'no-referrer';
    }
    if (n.tagName === 'A') { n.target = '_blank'; n.rel = 'noopener'; }
  });
  return doc.body.innerHTML;
}

// Lightbox: klik na obrázek ho zvětší přímo na stránce
const lb = document.createElement('dialog');
lb.className = 'lightbox';
lb.innerHTML = '<img alt="">';
document.body.appendChild(lb);
lb.onclick = () => lb.close();
document.addEventListener('click', (e) => {
  const img = e.target.closest('.body img');
  if (!img) return;
  lb.firstChild.src = img.dataset.full || img.src;
  lb.showModal();
});

const fmt = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });

function showBlog(b) {
  const posts = b.posts.map((p, i) => `
    <details class="post"${i === 0 ? ' open' : ''}>
      <summary><b>${esc(p.title || fmt.format(p.date))}</b><time datetime="${p.date.toISOString()}">${fmt.format(p.date)}</time></summary>
      <div class="body">${sanitize(p.html)}<br><a class="src" href="${esc(p.link)}" target="_blank" rel="noopener">Otevřít na Bloggeru →</a></div>
    </details>`).join('');
  $('#posts').innerHTML = b.posts.length
    ? `<div class="toolbar"><button class="tab" data-all="1">Rozbalit vše</button><button class="tab" data-all="0">Sbalit vše</button></div>${posts}`
    : '<p class="muted">Zatím žádné příspěvky.</p>';
}

$('#posts').addEventListener('click', (e) => {
  const t = e.target.closest('[data-all]'); if (!t) return;
  document.querySelectorAll('#posts details.post').forEach((d) => { d.open = t.dataset.all === '1'; });
});

async function initBlogs() {
  const urls = await loadBlogList();
  const blogs = (await Promise.all(urls.map((u) => loadFeed(u.replace(/\/$/, '')).catch(() => null)))).filter(Boolean);
  // nejnovější blog (podle data posledního příspěvku) první a výchozí
  const last = (b) => (b.posts.length ? b.posts[b.posts.length - 1].date : 0);
  blogs.sort((a, b) => last(b) - last(a));
  if (!blogs.length) { $('#posts').innerHTML = '<p class="muted">Blogy se nepodařilo načíst.</p>'; return; }
  const tabs = $('#tabs');
  tabs.innerHTML = blogs.map((b, i) => `<button class="tab" role="tab" aria-selected="${i === 0}" data-i="${i}">${esc(b.title)} <small>(${b.posts.length})</small></button>`).join('');
  tabs.onclick = (e) => {
    const t = e.target.closest('.tab'); if (!t) return;
    tabs.querySelectorAll('.tab').forEach((x) => x.setAttribute('aria-selected', x === t));
    showBlog(blogs[+t.dataset.i]);
  };
  showBlog(blogs[0]);
}

// ---------- GitHub ----------
async function initRepos() {
  let repos;
  try {
    const r = await fetch(`https://api.github.com/users/${GH_USER}/repos?per_page=100&sort=updated`);
    if (!r.ok) throw 0;
    repos = (await r.json()).filter((x) => !x.fork && x.name !== `${GH_USER}.github.io`);
  } catch { repos = FALLBACK_REPOS; }
  $('#repos').innerHTML = repos.map((r) => `
    <a class="repo" href="${esc(r.html_url)}" target="_blank" rel="noopener">
      <b>${esc(r.name)}</b>
      <p>${esc(r.description || 'Veřejný projekt na GitHubu')}</p>
      <div class="meta">${r.language ? `<span>● ${esc(r.language)}</span>` : ''}<span>★ ${r.stargazers_count}</span></div>
    </a>`).join('');
}

initBlogs();
initRepos();

// ---------- Menu (jedna sekce najednou, výchozí "O mně") ----------
const VIEWS = ['o-mne', 'cestovani', 'programovani', 'verim'];
function route() {
  const id = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'o-mne';
  document.querySelectorAll('.view').forEach((s) => { s.hidden = s.id !== id; });
  document.querySelectorAll('#menu a').forEach((a) => a.classList.toggle('active', a.hash === '#' + id));
  document.querySelectorAll('#cta a').forEach((a) => a.classList.toggle('ghost', a.hash !== '#' + id));
}
addEventListener('hashchange', route);
route();

// ---------- Animované pozadí (Matrix déšť / neuronová síť) ----------
const fx = (() => {
  const c = $('#fx'), ctx = c.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0, mode = '', w = 0, h = 0, drops = [], nodes = [];
  const mouse = { x: -1e4, y: -1e4 };
  addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  const glyphs = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789VĚŘÍMCESTUJIPROGRAMUJI<>{}=+*'.split('');
  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight; c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drops = Array.from({ length: Math.ceil(w / 16) }, () => Math.random() * h / 16);
    const n = Math.min(110, Math.round(w * h / 14000));
    nodes = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35 }));
    if (mode === 'matrix') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); }
  }
  addEventListener('resize', () => mode && size());
  function matrix() {
    ctx.fillStyle = 'rgba(0,0,0,.07)'; ctx.fillRect(0, 0, w, h);
    ctx.font = '15px JetBrains Mono, monospace';
    drops.forEach((y, i) => {
      const ch = glyphs[(Math.random() * glyphs.length) | 0];
      ctx.fillStyle = Math.random() > .975 ? '#d7ffe6' : '#00ff6a';
      ctx.fillText(ch, i * 16, y * 16);
      drops[i] = y * 16 > h && Math.random() > .975 ? 0 : y + .55;
    });
  }
  function neural() {
    ctx.clearRect(0, 0, w, h);
    for (const p of nodes) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx, dy);
      if (d < 140) { p.x += dx / d * .8; p.y += dy / d * .8; }
    }
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 130) { ctx.strokeStyle = 'rgba(140,120,255,' + (1 - d / 130) * .45 + ')'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    }
    for (const p of nodes) { ctx.fillStyle = '#7dd3fc'; ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, 7); ctx.fill(); }
  }
  function loop() { (mode === 'matrix' ? matrix : neural)(); if (!still) raf = requestAnimationFrame(loop); }
  return {
    start(d) {
      cancelAnimationFrame(raf);
      mode = d === 'matrix' || d === 'neural' ? d : '';
      if (!mode) { ctx.clearRect(0, 0, c.width, c.height); return; }
      size();
      if (still && mode === 'matrix') for (let k = 0; k < 120; k++) matrix();
      loop();
    },
  };
})();

// ---------- Přepínač návrhů vzhledu (dočasný, k výběru) ----------
const DESIGNS = ['aurora', 'editorial', 'terminal', 'matrix', 'neural', 'kinetic'];
function setDesign(d) {
  root.dataset.design = d;
  fx.start(d);
  document.querySelectorAll('#designs button').forEach((b) => b.classList.toggle('on', b.dataset.d === d));
  try { localStorage.setItem('design', d); } catch {}
}
let initial = new URLSearchParams(location.search).get('d');
try { initial = initial || localStorage.getItem('design'); } catch {}
setDesign(DESIGNS.includes(initial) ? initial : 'aurora');
$('#designs').onclick = (e) => { if (e.target.dataset.d) setDesign(e.target.dataset.d); };
