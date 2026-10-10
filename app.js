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
  $('#posts').innerHTML = b.posts.map((p) => `
    <details class="post">
      <summary><b>${esc(p.title || fmt.format(p.date))}</b><time datetime="${p.date.toISOString()}">${fmt.format(p.date)}</time></summary>
      <div class="body">${sanitize(p.html)}<br><a class="src" href="${esc(p.link)}" target="_blank" rel="noopener">Otevřít na Bloggeru →</a></div>
    </details>`).join('') || '<p class="muted">Zatím žádné příspěvky.</p>';
}

async function initBlogs() {
  const urls = await loadBlogList();
  const blogs = (await Promise.all(urls.map((u) => loadFeed(u.replace(/\/$/, '')).catch(() => null)))).filter(Boolean);
  blogs.sort((a, b) => a.title.localeCompare(b.title, 'cs'));
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

// ---------- Přepínač návrhů vzhledu (dočasný, k výběru) ----------
function setDesign(d) {
  root.dataset.design = d;
  document.querySelectorAll('#designs button').forEach((b) => b.classList.toggle('on', b.dataset.d === d));
  try { localStorage.setItem('design', d); } catch {}
}
let initial = new URLSearchParams(location.search).get('d');
try { initial = initial || localStorage.getItem('design'); } catch {}
setDesign(['aurora', 'editorial', 'terminal'].includes(initial) ? initial : 'aurora');
$('#designs').onclick = (e) => { if (e.target.dataset.d) setDesign(e.target.dataset.d); };
