(function renderSharedSidebar() {
  const sidebar = document.querySelector('[data-gen-sidebar]');
  const script = document.currentScript;
  if (!sidebar || !script) return;

  const siteRoot = new URL('../', script.src);
  const siteUrl = relativePath => new URL(relativePath, siteRoot).href;
  const currentPath = decodeURIComponent(window.location.pathname).replace(/\\/g, '/').toLowerCase();

  let pageName = 'general';
  if (currentPath.includes('/pasapalabra/')) pageName = 'pasapalabra';
  else if (currentPath.includes('/meditacion/')) pageName = 'meditacion';
  else if (currentPath.includes('/pdv/')) pageName = 'pdv';
  else if (currentPath.includes('/gen_animadores/')) pageName = 'animadores';
  else if (currentPath.includes('/biblioteca/')) pageName = 'biblioteca';

  let activeSection = 'inicio';
  if (currentPath.includes('/canal/')) activeSection = 'comunicacion';
  else if (currentPath.includes('/cancionero/')) activeSection = 'cancionero';
  else if (currentPath.includes('/gen_animadores/')) activeSection = 'animadores';
  else if (currentPath.includes('/biblioteca/')) activeSection = 'biblioteca';
  else if (currentPath.includes('/introduccion/')) activeSection = 'historia';
  else if (currentPath.includes('/links/')) activeSection = 'contacto';
  else if (currentPath.includes('/admin/')) activeSection = 'admin';
  else if (currentPath.includes('/perfil/')) activeSection = 'perfil';

  const links = [
    { id: 'inicio', href: 'index.html', label: 'Inicio', icon: `<img src="${siteUrl('aadocumentos/svg/casa.svg')}" alt="" class="menu-icon">` },
    { id: 'comunicacion', href: 'canal/canal.html', label: 'Comunicación', symbol: '◎', className: 'communication-menu-item' },
    { type: 'label', label: 'Recursos' },
    { id: 'cancionero', href: 'cancionero/cancionero.html', label: 'Cancionero', symbol: '♫' },
    { id: 'animadores', href: 'gen_animadores/gen-animadores.html', label: 'Gen Animadores', symbol: '✦' },
    { id: 'biblioteca', href: 'biblioteca/biblioteca.html', label: 'Biblioteca', symbol: '▤' },
    { type: 'label', label: 'Información' },
    { id: 'historia', href: 'introduccion/introduccion.html', label: 'Historia', icon: `<img src="${siteUrl('aadocumentos/svg/libro.svg')}" alt="" class="menu-icon">` },
    { id: 'contacto', href: 'links/links.html', label: 'Contacto', symbol: '♡' }
  ];

  const navigation = links.map(item => {
    if (item.type === 'label') return `<span class="home-nav-label">${item.label}</span>`;
    const isActive = item.id === activeSection;
    const icon = item.icon || `<span class="menu-symbol" aria-hidden="true">${item.symbol}</span>`;
    const classes = ['menu-item', item.className, isActive ? 'active' : ''].filter(Boolean).join(' ');
    return `<a href="${siteUrl(item.href)}" class="${classes}"${isActive ? ' aria-current="page"' : ''}>${icon}<span class="menu-text">${item.label}</span></a>`;
  }).join('');

  sidebar.className = 'sidebar home-sidebar site-sidebar';
  sidebar.dataset.activeSection = activeSection;
  sidebar.setAttribute('aria-label', 'Navegación principal');
  sidebar.innerHTML = `
    <div class="sidebar-header">
      <a class="home-brand" href="${siteUrl('index.html')}" aria-label="Gen 2, inicio"><span class="brand-full">Gen 2</span><span class="brand-short" aria-hidden="true">G2</span></a>
      <button class="sidebar-pin" type="button" aria-label="Anclar menú abierto" aria-pressed="false" title="Anclar menú abierto">
        <span aria-hidden="true">📌</span>
      </button>
    </div>
    <nav class="home-nav">${navigation}</nav>
    <div class="sidebar-account-area">
      <div id="sidebar-role-links" class="sidebar-role-links"></div>
      <div id="auth-button-container" class="auth-sidebar-container"></div>
    </div>`;

  document.body.classList.add('with-site-sidebar', `site-page-${pageName}`);
  if (sidebar.querySelector && sidebar.addEventListener && sidebar.classList) {
    const pinButton = sidebar.querySelector('.sidebar-pin');
    const storageKey = 'gen2-sidebar-pinned';
    let pinned = false;
    try { pinned = localStorage.getItem(storageKey) === 'true'; } catch (_) {}

    const applyPinnedState = value => {
      pinned = value;
      sidebar.classList.toggle('is-pinned', pinned);
      sidebar.classList.toggle('is-expanded', pinned);
      document.body.classList.toggle('sidebar-pinned', pinned);
      pinButton?.setAttribute('aria-pressed', String(pinned));
      pinButton?.setAttribute('aria-label', pinned ? 'Desanclar menú' : 'Anclar menú abierto');
      pinButton?.setAttribute('title', pinned ? 'Desanclar menú' : 'Anclar menú abierto');
      try { localStorage.setItem(storageKey, String(pinned)); } catch (_) {}
    };

    applyPinnedState(pinned);
    pinButton?.addEventListener('click', event => {
      event.stopPropagation();
      applyPinnedState(!pinned);
      if (!pinned) {
        pinButton.blur();
        sidebar.classList.add('suppress-hover');
      }
    });
    sidebar.addEventListener('click', event => {
      if (pinned || sidebar.classList.contains('is-expanded') || window.matchMedia('(hover: hover)').matches) return;
      const link = event.target.closest('a');
      if (link) event.preventDefault();
      sidebar.classList.add('is-expanded');
    });
    document.addEventListener('pointerdown', event => {
      if (!pinned && !sidebar.contains(event.target)) sidebar.classList.remove('is-expanded');
    });
    sidebar.addEventListener('mouseleave', () => {
      sidebar.classList.remove('suppress-hover');
      if (!pinned && !sidebar.matches(':focus-within')) sidebar.classList.remove('is-expanded');
    });
  }

  if (['pasapalabra', 'meditacion', 'pdv'].includes(pageName)) {
    document.body.classList.add('site-kind-daily');
  }

  sidebar.querySelectorAll?.('.menu-item').forEach(link => {
    const label = link.querySelector('.menu-text')?.textContent?.trim();
    if (label) link.title = label;
  });

  const finishPageSetup = () => {
    const main = document.querySelector('main, .main:not(.site-sidebar)');
    if (main) {
      if (!main.id) main.id = 'contenido-principal';
      if (!document.querySelector('.skip-link')) {
        const skipLink = document.createElement('a');
        skipLink.className = 'skip-link';
        skipLink.href = `#${main.id}`;
        skipLink.textContent = 'Saltar al contenido';
        document.body.prepend(skipLink);
      }
    }

    document.querySelectorAll?.('img:not([loading])').forEach((image, index) => {
      if (index > 0 && !image.closest('.hero-banner, .div-header, .introduccion-hero')) image.loading = 'lazy';
      image.decoding = 'async';
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', finishPageSetup, { once: true });
  else finishPageSetup();
}());
