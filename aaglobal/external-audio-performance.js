(function setupExternalAudioPerformance() {
  if (window.GenExternalAudio) return;

  const connectedOrigins = new Set();
  let warmPlayer = null;
  let warmUrl = '';

  function preconnect(url) {
    let origin;
    try { origin = new URL(url, location.href).origin; } catch { return; }
    if (origin === location.origin || connectedOrigins.has(origin)) return;
    connectedOrigins.add(origin);
    ['preconnect', 'dns-prefetch'].forEach(relation => {
      const link = document.createElement('link'); link.rel = relation; link.href = origin;
      if (relation === 'preconnect') link.crossOrigin = 'anonymous';
      document.head.append(link);
    });
  }

  function audioUrl(player) {
    return player.currentSrc || player.src || player.querySelector('source')?.src || '';
  }

  function enhance(player) {
    if (!(player instanceof HTMLAudioElement) || player.dataset.genAudioOptimized === 'true') return;
    player.dataset.genAudioOptimized = 'true';
    const url = audioUrl(player); if (url) preconnect(url);
    const status = document.createElement('span'); status.className = 'gen-audio-loading-status'; status.textContent = 'Cargando audio…'; status.hidden = true;
    player.insertAdjacentElement('afterend', status);
    const setLoading = loading => {
      status.hidden = !loading; player.classList.toggle('gen-audio-is-loading', loading);
      if (loading) player.setAttribute('aria-busy', 'true'); else player.removeAttribute('aria-busy');
    };
    ['loadstart', 'waiting', 'stalled'].forEach(type => player.addEventListener(type, () => setLoading(true)));
    ['canplay', 'playing', 'pause', 'ended', 'error', 'emptied'].forEach(type => player.addEventListener(type, () => setLoading(false)));
    if (player.autoplay && player.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) setLoading(true);
  }

  function scan(root = document) { root.querySelectorAll?.('audio').forEach(enhance); if (root instanceof HTMLAudioElement) enhance(root); }

  function preload(url) {
    if (!url || url === warmUrl || navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType || '')) return false;
    preconnect(url); warmPlayer?.pause();
    warmPlayer = new Audio(); warmUrl = url; warmPlayer.preload = 'auto'; warmPlayer.muted = true; warmPlayer.src = url;
    // El navegador descarga sólo lo que considera necesario para llegar a canplay.
    const ready = () => { if (!warmPlayer) return; warmPlayer.pause(); warmPlayer.preload = 'none'; };
    warmPlayer.addEventListener('canplay', ready, { once: true }); warmPlayer.addEventListener('error', ready, { once: true }); warmPlayer.load();
    return true;
  }

  const style = document.createElement('style'); style.textContent = `
    .gen-audio-loading-status{display:inline-flex;min-height:28px;align-items:center;gap:8px;margin:7px 0 0;color:#aaa3af;font:600 .78rem/1.3 Inter,Arial,sans-serif}
    .gen-audio-loading-status::before{content:"";width:13px;height:13px;flex:0 0 13px;border:2px solid rgba(181,138,255,.25);border-top-color:#b58aff;border-radius:50%;animation:gen-audio-spin .75s linear infinite}
    .gen-audio-loading-status[hidden]{display:none!important}.gen-audio-is-loading{opacity:.82}
    @keyframes gen-audio-spin{to{transform:rotate(360deg)}}
    @media(prefers-reduced-motion:reduce){.gen-audio-loading-status::before{animation:none}}
  `; document.head.append(style);

  preconnect('https://www.googleapis.com'); preconnect('https://drive.google.com');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scan(), { once: true }); else scan();
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => { if (node.nodeType === 1) scan(node); })))
    .observe(document.documentElement, { childList: true, subtree: true });

  window.GenExternalAudio = { enhance, preload, preconnect };
}());
