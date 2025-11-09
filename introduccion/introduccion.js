// Introducción v2: modal “Leer más”, 3 columnas y sin texto visible en cards
document.addEventListener('DOMContentLoaded', () => {
  // Cierre con tecla ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeIntroModal();
  });

  // Delegación para abrir y cierre controlado
  document.addEventListener('click', (ev) => {
    const overlay = document.getElementById('introModalOverlay');
    const modal = document.querySelector('.intro-modal');

    // Abrir: capturar cualquier botón "Leer más"
    if (!overlay || !overlay.classList.contains('active')) {
      const btn = ev.target.closest('.expand-btn');
      if (btn) {
        ev.preventDefault();
        toggleCard(btn);
        return;
      }
    }

    // Cerrar: solo si el click ocurre dentro del overlay y fuera del modal
    if (overlay && overlay.classList.contains('active')) {
      const clickedOnOverlay = !!ev.target.closest('#introModalOverlay');
      if (clickedOnOverlay && modal && !modal.contains(ev.target)) {
        closeIntroModal();
      }
    }
  });
});

// Abre modal con info de la tarjeta
function toggleCard(button) {
  const card = button.closest('.intro-card');
  const title = card.querySelector('.card-title h3')?.textContent || 'Detalle';
  const year = card.querySelector('.card-year')?.textContent || '';
  const expanded = card.querySelector('.card-expanded');
  const htmlExpanded = expanded ? expanded.innerHTML : '';
  const imageSrc = card.dataset.img || '../aadocumentos/imagenes/guitarra.jpg';

  openIntroModal({ title, subtitle: year, html: htmlExpanded, imageSrc });
}

function openIntroModal({ title, subtitle, html, imageSrc }) {
  const overlay = document.getElementById('introModalOverlay');
  const img = document.getElementById('introModalImage');
  const titleEl = document.getElementById('introModalTitle');
  const subtitleEl = document.getElementById('introModalSubtitle');
  const bodyEl = document.getElementById('introModalBody');
  if (!overlay || !img || !titleEl || !subtitleEl || !bodyEl) return;

  titleEl.textContent = title;
  subtitleEl.textContent = subtitle || '';
  bodyEl.innerHTML = html || '';
  img.src = imageSrc;
  overlay.classList.add('active');
}

function closeIntroModal() {
  const overlay = document.getElementById('introModalOverlay');
  if (overlay) overlay.classList.remove('active');
}

window.toggleCard = toggleCard;
window.closeIntroModal = closeIntroModal;