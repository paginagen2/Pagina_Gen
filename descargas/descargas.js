(function setupIosInstall() {
  const button = document.querySelector('[data-ios-install]');
  const dialog = document.querySelector('#ios-install-dialog');
  const status = document.querySelector('[data-ios-status]');
  if (!button || !dialog) return;

  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || navigator.standalone === true;
  const isSafari = isIos
    && /Safari/.test(navigator.userAgent)
    && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);

  if (isStandalone) {
    button.querySelector('strong').textContent = 'Ya está instalada';
    button.querySelector('small').textContent = 'Abriste Gen 2 como aplicación';
    button.classList.add('is-installed');
    button.disabled = true;
    if (status) status.textContent = 'Gen 2 ya está instalada en este dispositivo.';
    return;
  }

  if (isIos && status) {
    status.textContent = isSafari
      ? 'Tu iPhone está listo para instalar Gen 2.'
      : 'Abrí esta página en Safari para instalar Gen 2.';
  }

  button.addEventListener('click', () => {
    dialog.classList.toggle('not-safari', isIos && !isSafari);
    dialog.showModal();
  });

  dialog.querySelectorAll('[data-close-dialog]').forEach(control => {
    control.addEventListener('click', () => dialog.close());
  });

  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
}());
