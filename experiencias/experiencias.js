function toggleExperiencia(button) {
  const container = button.closest('.experiencia_destacada');
  const expanded = container.querySelector('.experiencia_expandida');
  const icon = button.querySelector('.btn-icon');
  const text = button.querySelector('.btn-text');
  
  expanded.classList.toggle('expanded');
  
  if (expanded.classList.contains('expanded')) {
    icon.textContent = '−';
    text.textContent = 'Leer menos';
  } else {
    icon.textContent = '+';
    text.textContent = 'Leer más';
  }
}

function toggleExperienciaCard(button) {
  const card = button.closest('.experiencia_card');
  const expanded = card.querySelector('.experiencia_card_expandida');
  const icon = button.querySelector('.btn-icon-small');
  const text = button.querySelector('.btn-text-small');
  
  expanded.classList.toggle('expanded');
  
  if (expanded.classList.contains('expanded')) {
    icon.textContent = '−';
    text.textContent = 'Leer menos';
  } else {
    icon.textContent = '+';
    text.textContent = 'Leer completa';
  }
}