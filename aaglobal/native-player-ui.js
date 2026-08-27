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
  let bubble;
  let panel;
  let lastState = null;
  let expanded = false;
  let dragging = false;
  let suppressClick = false;
  const POSITION_KEY = 'gen-native-player-position-v1';
  const icons = {
    previous: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14M18 6.5 9.5 12l8.5 5.5z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5v14M6 6.5l8.5 5.5L6 17.5z"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>'
  };

  function formatTime(milliseconds) {
    const seconds = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function readState() {
    try { return JSON.parse(window.AndroidNativeAudio.getState() || '{"active":false}'); }
    catch { return { active: false }; }
  }

  function button(label, action, className = '', icon = '') {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = className;
    element.setAttribute('aria-label', label);
    element.title = label;
    element.innerHTML = icon || label;
    element.addEventListener('click', action);
    return element;
  }

  function clampPosition(left, top) {
    const margin = 8;
    const width = root.offsetWidth || 58;
    const height = root.offsetHeight || 58;
    return {
      left: Math.min(Math.max(margin, left), Math.max(margin, innerWidth - width - margin)),
      top: Math.min(Math.max(margin, top), Math.max(margin, innerHeight - height - margin))
    };
  }

  function setPosition(left, top, remember = true) {
    const position = clampPosition(left, top);
    root.style.left = `${position.left}px`;
    root.style.top = `${position.top}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
    if (remember) {
      try { localStorage.setItem(POSITION_KEY, JSON.stringify(position)); }
      catch { /* La posición puede funcionar sin persistencia. */ }
    }
  }

  function restorePosition() {
    try {
      const saved = JSON.parse(localStorage.getItem(POSITION_KEY));
      if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) setPosition(saved.left, saved.top, false);
    } catch { /* La posición guardada es opcional. */ }
  }

  function setExpanded(next) {
    expanded = Boolean(next);
    root.classList.toggle('is-expanded', expanded);
    bubble.setAttribute('aria-expanded', String(expanded));
    bubble.setAttribute('aria-label', expanded ? 'Contraer reproductor' : 'Abrir reproductor');
    requestAnimationFrame(() => {
      if (root.style.left) setPosition(parseFloat(root.style.left), parseFloat(root.style.top), false);
    });
  }

  function bindDrag() {
    bubble.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const startX = event.clientX;
      const startY = event.clientY;
      const rect = root.getBoundingClientRect();
      dragging = false;
      bubble.setPointerCapture(event.pointerId);
      const move = moveEvent => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (!dragging && Math.hypot(dx, dy) < 6) return;
        dragging = true;
        root.classList.add('is-dragging');
        setPosition(rect.left + dx, rect.top + dy, false);
      };
      const finish = upEvent => {
        bubble.removeEventListener('pointermove', move);
        bubble.removeEventListener('pointerup', finish);
        bubble.removeEventListener('pointercancel', finish);
        root.classList.remove('is-dragging');
        if (dragging) {
          suppressClick = true;
          setPosition(parseFloat(root.style.left), parseFloat(root.style.top), true);
          setTimeout(() => { suppressClick = false; }, 0);
        }
        try { bubble.releasePointerCapture(upEvent.pointerId); } catch { /* Ya fue liberado. */ }
      };
      bubble.addEventListener('pointermove', move);
      bubble.addEventListener('pointerup', finish);
      bubble.addEventListener('pointercancel', finish);
    });
    bubble.addEventListener('click', () => { if (!suppressClick) setExpanded(!expanded); });
  }

  function mount() {
    if (root || !document.body) return;
    root = document.createElement('section');
    root.className = 'gen-native-player';
    root.hidden = true;
    root.setAttribute('aria-label', 'Reproductor de Gen');

    bubble = document.createElement('button');
    bubble.type = 'button';
    bubble.className = 'gen-native-player-bubble';
    bubble.innerHTML = '<span>GEN</span><i aria-hidden="true">♪</i>';
    bubble.title = 'Mover o abrir el reproductor';
    bubble.setAttribute('aria-expanded', 'false');
    bubble.setAttribute('aria-label', 'Abrir reproductor');

    panel = document.createElement('div');
    panel.className = 'gen-native-player-panel';

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
      button('Anterior', () => window.AndroidNativeAudio.previous(), 'is-secondary', icons.previous),
      (playPause = button('Pausar', () => {
        const state = readState();
        if (state.playing) window.AndroidNativeAudio.pause();
        else window.AndroidNativeAudio.play();
        setTimeout(refresh, 120);
      }, 'is-primary', icons.pause)),
      button('Siguiente', () => window.AndroidNativeAudio.next(), 'is-secondary', icons.next),
      button('Cerrar reproductor', () => window.AndroidNativeAudio.stop(), 'is-close', icons.close)
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

    panel.append(info, controls, timeline);
    root.append(bubble, panel);
    document.body.append(root);
    bindDrag();
    restorePosition();
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
    const playPauseLabel = state.playing ? 'Pausar' : 'Reproducir';
    playPause.innerHTML = state.playing ? icons.pause : icons.play;
    playPause.setAttribute('aria-label', playPauseLabel);
    playPause.title = playPauseLabel;
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
  window.addEventListener('resize', () => {
    if (root?.style.left) setPosition(parseFloat(root.style.left), parseFloat(root.style.top), false);
  });
})();
