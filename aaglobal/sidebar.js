(function renderSharedSidebar() {
  const sidebar = document.querySelector('[data-gen-sidebar]');
  const script = document.currentScript;
  if (!sidebar || !script) return;

  const siteRoot = new URL('../', script.src);
  const siteUrl = relativePath => new URL(relativePath, siteRoot).href;
  const spriteUrl = siteUrl('aadocumentos/svg/iconos-gen.svg?v=20260730-11');
  const renderIcon = (name, className = 'menu-symbol') =>
    `<svg class="${className} icon-${name}" aria-hidden="true"><use href="${spriteUrl}#${name}"></use></svg>`;
  const currentPath = decodeURIComponent(window.location.pathname).replace(/\\/g, '/').toLowerCase();

  if (document.createElement && !window.GenOffline && !document.querySelector('script[data-gen-offline-manager]')) {
    const offlineScript = document.createElement('script');
    offlineScript.src = siteUrl('aaglobal/offline-manager.js?v=20260730-1');
    offlineScript.dataset.genOfflineManager = 'true';
    offlineScript.addEventListener('load', () => window.dispatchEvent(new CustomEvent('gen:offline-ready')));
    document.head.appendChild(offlineScript);
  }

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
    { id: 'inicio', href: 'index.html', label: 'Inicio', icon: renderIcon('inicio') },
    { id: 'comunicacion', href: 'canal/canal.html', label: 'Comunicación', icon: renderIcon('comunicacion'), className: 'communication-menu-item' },
    { type: 'label', label: 'Recursos' },
    { id: 'cancionero', href: 'cancionero/cancionero.html', label: 'Cancionero', icon: renderIcon('musica') },
    { id: 'animadores', href: 'gen_animadores/gen-animadores.html', label: 'Gen Animadores', icon: renderIcon('animadores') },
    { id: 'biblioteca', href: 'biblioteca/biblioteca.html', label: 'Biblioteca', icon: renderIcon('biblioteca') },
    { type: 'label', label: 'Información' },
    { id: 'historia', href: 'introduccion/introduccion.html', label: 'Historia', icon: renderIcon('historia') },
    { id: 'contacto', href: 'links/links.html', label: 'Contacto', icon: renderIcon('contacto') }
  ];

  const navigation = links.map(item => {
    if (item.type === 'label') return `<span class="home-nav-label">${item.label}</span>`;
    const isActive = item.id === activeSection;
    const classes = ['menu-item', item.className, isActive ? 'active' : ''].filter(Boolean).join(' ');
    return `<a href="${siteUrl(item.href)}" class="${classes}"${isActive ? ' aria-current="page"' : ''}>${item.icon}<span class="menu-text">${item.label}</span></a>`;
  }).join('');

  const isDailyPage = ['pasapalabra', 'meditacion', 'pdv'].includes(pageName);
  const mobileActiveSection = isDailyPage ? 'hoy' : activeSection;
  const mobilePrimaryLinks = [
    { id: 'inicio', href: 'index.html', label: 'Inicio', icon: renderIcon('inicio', 'mobile-nav-icon') },
    { id: 'comunicacion', href: 'canal/canal.html', label: 'Canal', icon: renderIcon('canal', 'mobile-nav-icon') },
    { id: 'cancionero', href: 'cancionero/cancionero.html', label: 'M\u00fasica', icon: renderIcon('musica', 'mobile-nav-icon') },
    { id: 'hoy', href: 'index.html#contenido-hoy', label: 'Hoy', icon: renderIcon('hoy', 'mobile-nav-icon') }
  ];
  const mobilePrimaryNavigation = mobilePrimaryLinks.map(item => {
    const isActive = item.id === mobileActiveSection;
    return `<a href="${siteUrl(item.href)}" class="mobile-nav-item${isActive ? ' active' : ''}"${isActive ? ' aria-current="page"' : ''}>${item.icon}<span>${item.label}</span></a>`;
  }).join('');

  const mobileMoreLinks = [
    { href: 'pasapalabra/pasapalabra_de_hoy.html', label: 'Pasapalabra', icon: 'pasapalabra' },
    { href: 'meditacion/meditacion_diaria.html', label: 'Meditaci\u00f3n', icon: 'meditacion' },
    { href: 'pdv/pdv_todas.html', label: 'Palabra de Vida', icon: 'pdv' },
    { href: 'gen_animadores/gen-animadores.html', label: 'Gen Animadores', icon: 'animadores' },
    { href: 'biblioteca/biblioteca.html', label: 'Biblioteca', icon: 'biblioteca' },
    { href: 'introduccion/introduccion.html', label: 'Historia', icon: 'historia' },
    { href: 'links/links.html', label: 'Contacto', icon: 'contacto' }
  ].map(item => `<a href="${siteUrl(item.href)}" class="mobile-more-link">${renderIcon(item.icon, 'mobile-more-icon')}<strong>${item.label}</strong></a>`).join('');

  sidebar.className = 'sidebar home-sidebar site-sidebar';
  sidebar.dataset.activeSection = activeSection;
  sidebar.setAttribute('aria-label', 'Navegación principal');
  sidebar.innerHTML = `
    <div class="sidebar-header">
      <a class="home-brand" href="${siteUrl('index.html')}" aria-label="Gen 2, inicio"><span class="brand-full">Gen 2</span><span class="brand-short" aria-hidden="true">G2</span></a>
      <button class="sidebar-pin" type="button" aria-label="Anclar menú abierto" aria-pressed="false" title="Anclar menú abierto">
        ${renderIcon('chincheta', 'sidebar-pin-icon')}
      </button>
    </div>
    <nav class="home-nav">${navigation}</nav>
    <div class="sidebar-account-area">
      <div id="sidebar-role-links" class="sidebar-role-links"></div>
      <div id="auth-button-container" class="auth-sidebar-container"></div>
    </div>
    <nav class="mobile-bottom-nav" aria-label="Navegaci&oacute;n m&oacute;vil">
      ${mobilePrimaryNavigation}
      <button class="mobile-nav-item mobile-more-trigger" type="button" aria-expanded="false" aria-controls="mobile-more-menu">
        <span aria-hidden="true">&bull;&bull;&bull;</span><span>M&aacute;s</span>
      </button>
    </nav>
    <div class="mobile-more-backdrop" hidden></div>
    <section class="mobile-more-menu" id="mobile-more-menu" aria-label="M&aacute;s secciones" aria-hidden="true">
      <div class="mobile-more-handle" aria-hidden="true"></div>
      <div class="mobile-more-heading">
        <div><span>Gen 2</span><h2>M&aacute;s secciones</h2></div>
        <button class="mobile-more-close" type="button" aria-label="Cerrar men&uacute;">&times;</button>
      </div>
      <div class="mobile-more-grid">${mobileMoreLinks}</div>
      <div class="mobile-more-account-slot" aria-label="Cuenta"></div>
    </section>`;

  document.body.classList.add('with-site-sidebar', `site-page-${pageName}`);
  if (sidebar.querySelector && sidebar.addEventListener && sidebar.classList) {
    const pinButton = sidebar.querySelector('.sidebar-pin');
    const storageKey = 'gen2-sidebar-pinned';
    let pinned = true;
    try {
      const savedPinnedState = localStorage.getItem(storageKey);
      pinned = savedPinnedState === null ? true : savedPinnedState === 'true';
    } catch (_) {}

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
      if (window.matchMedia('(max-width: 820px)').matches) return;
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

  if (sidebar.querySelector && sidebar.classList) {
    const moreTrigger = sidebar.querySelector('.mobile-more-trigger');
    const moreMenu = sidebar.querySelector('.mobile-more-menu');
    const moreBackdrop = sidebar.querySelector('.mobile-more-backdrop');
    const moreClose = sidebar.querySelector('.mobile-more-close');
    const setMobileMenuOpen = open => {
      sidebar.classList.toggle('mobile-more-open', open);
      moreTrigger?.setAttribute('aria-expanded', String(open));
      moreMenu?.setAttribute('aria-hidden', String(!open));
      if (moreBackdrop) moreBackdrop.hidden = !open;
      document.body.classList.toggle('mobile-menu-open', open);
      if (open) moreClose?.focus();
      else moreTrigger?.focus();
    };
    moreTrigger?.addEventListener('click', event => {
      event.stopPropagation();
      setMobileMenuOpen(!sidebar.classList.contains('mobile-more-open'));
    });
    moreClose?.addEventListener('click', () => setMobileMenuOpen(false));
    moreBackdrop?.addEventListener('click', () => setMobileMenuOpen(false));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && sidebar.classList.contains('mobile-more-open')) setMobileMenuOpen(false);
    });

    const accountArea = sidebar.querySelector('.sidebar-account-area');
    const desktopNav = sidebar.querySelector('.home-nav');
    const mobileAccountSlot = sidebar.querySelector('.mobile-more-account-slot');
    const mobileQuery = window.matchMedia('(max-width: 820px)');
    const syncAccountPlacement = event => {
      if (!accountArea || !desktopNav || !mobileAccountSlot) return;
      if ((event?.matches ?? mobileQuery.matches)) mobileAccountSlot.append(accountArea);
      else desktopNav.after(accountArea);
    };
    syncAccountPlacement();
    mobileQuery.addEventListener?.('change', syncAccountPlacement);
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
