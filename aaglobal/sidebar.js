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
    <a class="home-brand" href="${siteUrl('index.html')}" aria-label="Gen 2, inicio"><span>Gen 2</span></a>
    <nav class="home-nav">${navigation}</nav>
    <div class="sidebar-account-area">
      <div id="sidebar-role-links" class="sidebar-role-links"></div>
      <div id="auth-button-container" class="auth-sidebar-container"></div>
    </div>`;

  document.body.classList.add('with-site-sidebar', `site-page-${pageName}`);
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
