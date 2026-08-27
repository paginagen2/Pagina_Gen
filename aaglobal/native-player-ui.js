(function () {
  'use strict';
  if (!window.AndroidNativeAudio || window.GenNativePlayerUI) return;

  let root;
  let title;
  let artist;
  let position;
  let duration;
  let seek;
  let playPause;
  let lastState = null;

  function formatTime(milliseconds) {
    const seconds = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function readState() {
    try { return JSON.parse(window.AndroidNativeAudio.getState() || '{"active":false}'); }
    catch { return { active: false }; }
  }

  function button(label, action, className = '') {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = className;
    element.setAttribute('aria-label', label);
    element.title = label;
    element.textContent = label;
    element.addEventListener('click', action);
    return element;
  }

  function mount() {
    if (root || !document.body) return;
    root = document.createElement('section');
    root.className = 'gen-native-player';
    root.hidden = true;
    root.setAttribute('aria-label', 'Reproductor de Gen');

    const info = document.createElement('div');
    info.className = 'gen-native-player-info';
    const mark = document.createElement('span');
    mark.className = 'gen-native-player-mark';
    mark.textContent = '♪';
    const copy = document.createElement('div');
    title = document.createElement('strong');
    artist = document.createElement('small');
    copy.append(title, artist);
    info.append(mark, copy);

    const controls = document.createElement('div');
    controls.className = 'gen-native-player-controls';
    controls.append(
      button('Anterior', () => window.AndroidNativeAudio.previous(), 'is-secondary'),
      (playPause = button('Pausar', () => {
        const state = readState();
        if (state.playing) window.AndroidNativeAudio.pause();
        else window.AndroidNativeAudio.play();
        setTimeout(refresh, 120);
      }, 'is-primary')),
      button('Siguiente', () => window.AndroidNativeAudio.next(), 'is-secondary'),
      button('Cerrar reproductor', () => window.AndroidNativeAudio.stop(), 'is-close')
    );

    const timeline = document.createElement('div');
    timeline.className = 'gen-native-player-timeline';
    position = document.createElement('span');
    duration = document.createElement('span');
    seek = document.createElement('input');
    seek.type = 'range';
    seek.min = '0';
    seek.step = '1000';
    seek.value = '0';
    seek.setAttribute('aria-label', 'Posición de reproducción');
    seek.addEventListener('change', () => window.AndroidNativeAudio.seekTo(Number(seek.value) || 0));
    timeline.append(position, seek, duration);

    root.append(info, controls, timeline);
    document.body.append(root);
  }

  function refresh() {
    mount();
    if (!root) return;
    const state = readState();
    lastState = state;
    root.hidden = !state.active;
    document.body.classList.toggle('with-gen-native-player', Boolean(state.active));
    if (!state.active) return;
    title.textContent = state.title || 'Audio de Gen';
    artist.textContent = [state.artist, state.count > 1 ? `${Number(state.index) + 1} de ${state.count}` : ''].filter(Boolean).join(' · ');
    playPause.textContent = state.playing ? 'Pausar' : 'Reproducir';
    playPause.setAttribute('aria-label', playPause.textContent);
    const total = Math.max(0, Number(state.duration) || 0);
    const current = Math.min(total || Number.MAX_SAFE_INTEGER, Math.max(0, Number(state.position) || 0));
    seek.max = String(total || Math.max(current, 1));
    seek.value = String(current);
    seek.disabled = total <= 0;
    position.textContent = formatTime(current);
    duration.textContent = formatTime(total);
  }

  window.GenNativePlayerUI = { refresh, state: () => lastState };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
  else refresh();
  setInterval(refresh, 750);
  window.addEventListener('pageshow', refresh);
})();
