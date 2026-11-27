// ============================================================================
// DEMAN · PWA — registro do service worker, aviso de atualização,
// faixa "sem conexão" e convite para instalar o app.
// ============================================================================
(function(){
  'use strict';

  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;

  // ─── Estilos (injetados aqui para não mexer no style.css) ──────────────────
  var st = document.createElement('style');
  st.textContent =
    '.pwa-bar{position:fixed;left:50%;transform:translateX(-50%);z-index:10050;display:flex;align-items:center;gap:10px;' +
      'background:#1D2530;border:1px solid #303A47;color:#E7ECF2;border-radius:12px;padding:10px 12px;' +
      'font:500 13px/1.35 Inter,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.55);max-width:calc(100vw - 24px);}' +
    '.pwa-bar.baixo{bottom:calc(12px + env(safe-area-inset-bottom,0px));}' +
    '.pwa-bar b{color:#E8A93A;}' +
    '.pwa-bar button{font:600 12px Inter,system-ui,sans-serif;border-radius:8px;padding:7px 12px;cursor:pointer;border:1px solid #303A47;background:#252E3B;color:#E7ECF2;touch-action:manipulation;}' +
    '.pwa-bar button.primario{background:#E8A93A;border-color:#E8A93A;color:#10141A;}' +
    '.pwa-bar button.fechar{background:transparent;border:none;color:#93A0B0;font-size:16px;padding:4px 6px;}' +
    '#pwaOffline{top:calc(8px + env(safe-area-inset-top,0px));background:#3a2a12;border-color:#E8A93A;display:none;}' +
    '@media print{.pwa-bar{display:none !important;}}';
  document.head.appendChild(st);

  function barra(id, html, classe){
    var el = document.createElement('div');
    el.id = id; el.className = 'pwa-bar ' + (classe || 'baixo'); el.setAttribute('role', 'status');
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
  }

  // ─── Faixa "sem conexão" ───────────────────────────────────────────────────
  var offline = barra('pwaOffline', '<span>📡 <b>Sem conexão</b> — mostrando os últimos dados salvos.</span>', 'topo');
  function atualizarRede(){ offline.style.display = navigator.onLine ? 'none' : 'flex'; }
  window.addEventListener('online', atualizarRede);
  window.addEventListener('offline', atualizarRede);
  atualizarRede();

  // ─── Service worker + aviso de nova versão ────────────────────────────────
  var atualizacaoSolicitada = false;
  function mostrarAtualizacao(worker){
    if(document.getElementById('pwaUpdate')) return;
    var el = barra('pwaUpdate', '<span>🔄 <b>Nova versão disponível.</b></span>' +
      '<button class="primario" id="pwaUpdateBtn" type="button">Atualizar</button>' +
      '<button class="fechar" id="pwaUpdateX" type="button" aria-label="Dispensar">✕</button>');
    document.getElementById('pwaUpdateBtn').onclick = function(){
      atualizacaoSolicitada = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    };
    document.getElementById('pwaUpdateX').onclick = function(){ el.remove(); };
  }

  if('serviceWorker' in navigator){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('sw.js', { scope: './' }).then(function(reg){
        if(reg.waiting && navigator.serviceWorker.controller) mostrarAtualizacao(reg.waiting);
        reg.addEventListener('updatefound', function(){
          var novo = reg.installing; if(!novo) return;
          novo.addEventListener('statechange', function(){
            if(novo.state === 'installed' && navigator.serviceWorker.controller) mostrarAtualizacao(novo);
          });
        });
        // procura versão nova ao voltar para o app e a cada 30 minutos
        document.addEventListener('visibilitychange', function(){ if(!document.hidden) reg.update().catch(function(){}); });
        setInterval(function(){ reg.update().catch(function(){}); }, 30 * 60 * 1000);
      }).catch(function(e){ console.warn('Service worker não registrado:', e); });

      // só recarrega quando o usuário clicou em "Atualizar" (evita recarga na 1ª instalação)
      navigator.serviceWorker.addEventListener('controllerchange', function(){
        if(atualizacaoSolicitada) location.reload();
      });
    });
  }

  // ─── Convite para instalar ────────────────────────────────────────────────
  var CHAVE = 'deman_pwa_dispensado';
  function dispensado(dias){
    try{ var t = Number(localStorage.getItem(CHAVE) || 0); return t && (Date.now() - t) < dias * 86400000; }catch(e){ return false; }
  }
  function dispensar(){ try{ localStorage.setItem(CHAVE, String(Date.now())); }catch(e){} }

  if(!standalone){
    var adiado = null;
    window.addEventListener('beforeinstallprompt', function(e){
      e.preventDefault(); adiado = e;
      if(dispensado(14)) return;
      setTimeout(function(){
        if(!adiado || document.getElementById('pwaInstall')) return;
        var el = barra('pwaInstall', '<span>📲 Instalar o <b>DEMAN</b> no aparelho?</span>' +
          '<button class="primario" id="pwaInstallBtn" type="button">Instalar</button>' +
          '<button class="fechar" id="pwaInstallX" type="button" aria-label="Dispensar">✕</button>');
        document.getElementById('pwaInstallBtn').onclick = function(){
          el.remove();
          adiado.prompt();
          adiado.userChoice.finally(function(){ adiado = null; });
        };
        document.getElementById('pwaInstallX').onclick = function(){ dispensar(); el.remove(); };
      }, 4000);
    });
    window.addEventListener('appinstalled', function(){
      var el = document.getElementById('pwaInstall'); if(el) el.remove(); adiado = null;
    });

    // iPhone/iPad (Safari): não há botão automático, então mostramos a instrução
    var ua = navigator.userAgent || '';
    var ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var safari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
    if(ios && safari && !dispensado(30)){
      setTimeout(function(){
        if(document.getElementById('pwaInstall')) return;
        var el = barra('pwaInstall', '<span>📲 Para instalar: toque em <b>Compartilhar</b> ⬆️ e depois em <b>Adicionar à Tela de Início</b>.</span>' +
          '<button class="fechar" id="pwaInstallX" type="button" aria-label="Dispensar">✕</button>');
        document.getElementById('pwaInstallX').onclick = function(){ dispensar(); el.remove(); };
      }, 5000);
    }
  }
})();
