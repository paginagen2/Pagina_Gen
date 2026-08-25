const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'cancionero', 'cancion.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'cancionero', 'cancion.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'cancionero', 'cancion.css'), 'utf8');

const checks = [
  [html.includes('id="mobileToolsTrigger"'), 'falta el acceso único a Herramientas'],
  [html.includes('id="mobileToolsBackdrop"'), 'falta el fondo para cerrar el panel'],
  [html.includes('id="mobileAutoScrollBar"'), 'falta la barra persistente de auto-scroll'],
  [js.includes("history.pushState({ ...(history.state || {}), songToolsPanel: true }"), 'el panel no participa del historial móvil'],
  [js.includes("window.addEventListener('popstate'"), 'Atrás no cierra el panel móvil'],
  [js.includes('autoScrollSession'), 'pausa y cierre de auto-scroll no están separados'],
  [js.includes("visible && !mobile && state.usedChords.length"), 'la guía acoplada sigue habilitada en dispositivos móviles'],
  [css.includes('.song-tools.mobile-open'), 'falta el estado visible del panel inferior'],
  [css.includes('.guide-dock-toggle, .quick-guide-dock { display: none !important; }'), 'la opción de guía acoplada sigue visible en móvil'],
  [css.includes('.mobile-autoscroll-bar:not([hidden])'), 'falta el layout móvil del auto-scroll'],
  [css.includes('env(safe-area-inset-bottom)'), 'no se reserva el área segura inferior'],
  [css.includes('.song-audio-actions { display: grid;'), 'las acciones de audio no tienen distribución móvil segura']
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error(`Regresión móvil en canción:\n- ${failed.join('\n- ')}`);
  process.exit(1);
}

console.log('Vista móvil de canción verificada.');
