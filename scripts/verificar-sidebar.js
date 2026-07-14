const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.resolve(__dirname, '../aaglobal/sidebar.js'), 'utf8');

function renderSidebar(pathname) {
  const sidebar = {
    className: '',
    dataset: {},
    attributes: {},
    innerHTML: '',
    setAttribute(name, value) { this.attributes[name] = value; }
  };
  const bodyClasses = new Set();
  const context = {
    URL,
    window: { location: { pathname } },
    document: {
      currentScript: { src: 'https://example.test/aaglobal/sidebar.js' },
      querySelector(selector) { return selector === '[data-gen-sidebar]' ? sidebar : null; },
      body: { classList: { add(className) { bodyClasses.add(className); } } }
    }
  };

  vm.runInNewContext(code, context);
  return { sidebar, bodyClasses };
}

const cases = {
  '/Pagina_Gen/index.html': 'inicio',
  '/Pagina_Gen/canal/canal.html': 'comunicacion',
  '/Pagina_Gen/cancionero/cancion.html': 'cancionero',
  '/Pagina_Gen/gen_animadores/juegos-encuentros.html': 'animadores',
  '/Pagina_Gen/biblioteca/biblioteca.html': 'biblioteca',
  '/Pagina_Gen/introduccion/introduccion.html': 'historia',
  '/Pagina_Gen/links/links.html': 'contacto',
  '/Pagina_Gen/admin/admin.html': 'admin'
};

for (const [pathname, expectedSection] of Object.entries(cases)) {
  const { sidebar, bodyClasses } = renderSidebar(pathname);
  assert.equal(sidebar.dataset.activeSection, expectedSection, pathname);
  assert(sidebar.className.includes('site-sidebar'), pathname);
  assert(bodyClasses.has('with-site-sidebar'), pathname);
  assert(sidebar.innerHTML.includes('Comunicación'), pathname);
  assert(sidebar.innerHTML.includes('Gen Animadores'), pathname);
  assert(sidebar.innerHTML.includes('Contacto'), pathname);
  if (expectedSection !== 'admin') assert(sidebar.innerHTML.includes('aria-current="page"'), pathname);
}

console.log(`Estados activos verificados: ${Object.keys(cases).length}`);
