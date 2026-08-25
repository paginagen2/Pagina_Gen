let activePlayer = null;
let cleanupActivePlayer = null;

function safeAction(action, handler) {
  try { navigator.mediaSession?.setActionHandler(action, handler); } catch { /* Acción no disponible en este Android. */ }
}

function updatePosition(player) {
  if (!navigator.mediaSession || !Number.isFinite(player.duration) || player.duration <= 0) return;
  const position = Math.min(Math.max(0, player.currentTime || 0), player.duration);
  try { navigator.mediaSession.setPositionState({ duration: player.duration, playbackRate: player.playbackRate || 1, position }); } catch { /* El audio todavía no tiene duración válida. */ }
}

export function clearMediaSession(player = activePlayer) {
  if (player && activePlayer && player !== activePlayer) return;
  cleanupActivePlayer?.();
  cleanupActivePlayer = null;
  activePlayer = null;
  if (!navigator.mediaSession) return;
  navigator.mediaSession.playbackState = 'none';
  try { navigator.mediaSession.setPositionState(); } catch { /* Compatibilidad con WebView anterior. */ }
}

export function connectMediaSession(player, audio = {}, controls = {}) {
  if (!player || !('mediaSession' in navigator)) return () => {};
  clearMediaSession();
  activePlayer = player;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: audio.nombre || audio.titulo || 'Audio de la canción',
    artist: audio.artista || audio.autor || 'Gen',
    album: controls.album || 'Cancionero Gen',
    artwork: [{ src: new URL('../aadocumentos/imagenes/og-image.jpg', location.href).href, sizes: '512x512', type: 'image/jpeg' }]
  });
  safeAction('play', () => void player.play());
  safeAction('pause', () => player.pause());
  safeAction('seekbackward', event => { player.currentTime = Math.max(0, player.currentTime - (event.seekOffset || 10)); updatePosition(player); });
  safeAction('seekforward', event => { player.currentTime = Math.min(player.duration || Infinity, player.currentTime + (event.seekOffset || 10)); updatePosition(player); });
  safeAction('seekto', event => { if (Number.isFinite(event.seekTime)) { player.currentTime = event.seekTime; updatePosition(player); } });
  safeAction('previoustrack', typeof controls.previous === 'function' ? controls.previous : null);
  safeAction('nexttrack', typeof controls.next === 'function' ? controls.next : null);

  const onPlay = () => { navigator.mediaSession.playbackState = 'playing'; updatePosition(player); };
  const onPause = () => { navigator.mediaSession.playbackState = 'paused'; updatePosition(player); };
  const onPosition = () => updatePosition(player);
  const onEnded = () => { if (activePlayer === player && typeof controls.next !== 'function') clearMediaSession(player); };
  player.addEventListener('play', onPlay);
  player.addEventListener('pause', onPause);
  player.addEventListener('loadedmetadata', onPosition);
  player.addEventListener('durationchange', onPosition);
  player.addEventListener('timeupdate', onPosition);
  player.addEventListener('ratechange', onPosition);
  player.addEventListener('ended', onEnded);
  const cleanup = () => {
    player.removeEventListener('play', onPlay);
    player.removeEventListener('pause', onPause);
    player.removeEventListener('loadedmetadata', onPosition);
    player.removeEventListener('durationchange', onPosition);
    player.removeEventListener('timeupdate', onPosition);
    player.removeEventListener('ratechange', onPosition);
    player.removeEventListener('ended', onEnded);
  };
  cleanupActivePlayer = cleanup;
  return () => clearMediaSession(player);
}
