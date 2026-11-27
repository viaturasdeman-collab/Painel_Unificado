// ============================================================================
// DEMAN · Service Worker (PWA)
//
// >>> A CADA PUBLICAÇÃO, MUDE A VERSÃO ABAIXO (ex.: '7.3' → '7.4'). <<<
// É isso que faz o aviso "Nova versão disponível" aparecer nos aparelhos.
//
// - index.html: rede primeiro (se a rede demorar mais de 4s, usa a cópia guardada)
// - css/js/ícones do próprio site: guardados, abrem instantaneamente
// - fontes e papaparse (CDN): guardados, atualizados em segundo plano
// - Apps Script (dados) e qualquer outro domínio: SEMPRE direto na rede, nunca em cache
// ============================================================================
const VERSAO = '7.4';
const CACHE  = 'deman-' + VERSAO;

const BASICOS = [
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-48.png'
];
const HOSTS_TERCEIROS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];
const TIMEOUT_NAVEGACAO_MS = 4000;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);

    // 1) index.html sempre fresco (ignora o cache HTTP do navegador)
    const resp = await fetch('./index.html', { cache: 'reload' });
    if(!resp.ok) throw new Error('index.html indisponível');
    await cache.put('./index.html', resp.clone());
    await cache.put('./', resp.clone());
    const html = await resp.clone().text();

    // 2) arquivos do site referenciados no HTML (style.css?v=..., app.js?v=..., pwa.js?v=...)
    const proprios = new Set(BASICOS);
    const externos = new Set();
    const re = /(?:href|src)=["']([^"']+\.(?:css|js)(?:\?[^"']*)?)["']/g;
    let m;
    while((m = re.exec(html))){
      const u = m[1];
      if(u.startsWith('data:')) continue;
      if(/^https?:\/\//.test(u)){
        try{ if(HOSTS_TERCEIROS.includes(new URL(u).hostname)) externos.add(u); }catch(e){}
      } else {
        proprios.add(u.startsWith('.') || u.startsWith('/') ? u : './' + u);
      }
    }
    await Promise.all([
      ...[...proprios].map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})),
      ...[...externos].map(u => fetch(u, { mode: 'no-cors' }).then(r => cache.put(u, r)).catch(() => {}))
    ]);
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter(n => n.startsWith('deman-') && n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// O aviso "Atualizar" da página pede para ativar a versão nova.
self.addEventListener('message', event => {
  if(event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);

  if(url.origin === self.location.origin){
    if(url.pathname.endsWith('/sw.js')) return;                   // o navegador cuida da atualização
    if(req.mode === 'navigate'){
      // Só a página principal usa o index.html guardado. Qualquer outro endereço
      // aberto direto (um ícone, o manifest...) vai normalmente para a rede.
      const raiz = new URL('./', self.location).pathname;
      if(url.pathname === raiz || url.pathname === raiz + 'index.html') return event.respondWith(navegacao());
      return;
    }
    return event.respondWith(cacheFirst(req));
  }
  if(HOSTS_TERCEIROS.includes(url.hostname)) return event.respondWith(staleWhileRevalidate(req));
  // Apps Script e demais domínios: não intercepta (vai direto para a rede)
});

async function navegacao(){
  const cache = await caches.open(CACHE);
  const rede = fetch('./index.html', { cache: 'no-cache' }).then(r => {
    if(r && r.ok){ cache.put('./index.html', r.clone()); cache.put('./', r.clone()); }
    return r;
  });
  rede.catch(() => {});
  try{
    return await Promise.race([
      rede,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_NAVEGACAO_MS))
    ]);
  }catch(e){
    return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
}

async function cacheFirst(req){
  const cache = await caches.open(CACHE);
  const guardado = await cache.match(req);
  if(guardado) return guardado;
  const resp = await fetch(req);
  if(resp && resp.ok) cache.put(req, resp.clone());
  return resp;
}

async function staleWhileRevalidate(req){
  const cache = await caches.open(CACHE);
  const guardado = await cache.match(req);
  const rede = fetch(req).then(r => {
    if(r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone());
    return r;
  }).catch(() => null);
  return guardado || (await rede) || Response.error();
}
