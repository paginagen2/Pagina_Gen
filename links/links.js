// ============ FUNCIONES DE COPIADO ============
function copyEmail() {
  const emailText = 'pagina.gen.2@gmail.com';
  const copyBtn = document.getElementById('copyBtn');
  const copyIcon = document.getElementById('copyIcon');
  
  navigator.clipboard.writeText(emailText).then(function() {
    copyIcon.textContent = '✅';
    copyBtn.style.background = '#27ae60';
    
    setTimeout(function() {
      copyIcon.textContent = '📋';
      copyBtn.style.background = '#3498db';
    }, 1500);
  }).catch(function(err) {
    console.log('Error al copiar: ', err);
    selectEmailText();
  });
}

function selectEmailText() {
  const emailElement = document.querySelector('.email-text');
  const range = document.createRange();
  range.selectNode(emailElement);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
}

// ============ SISTEMA DE CATEGORÍAS ============
const categoryData = {
  cancionero: {
    title: "🎸 Reportes del Cancionero",
    suggestions: [
      "¿Hay errores en alguna canción? Especifica el título y describe el problema",
      "¿Faltan acordes o están incorrectos? Menciona qué canción necesita corrección",
      "¿Los enlaces no funcionan? Indica cuáles están rotos"
    ],
    tip: "💡 <strong>Asunto del email:</strong> Cancionero"
  },
  
  animadores: {
    title: "🎯 Reportes de Gen Animadores",
    suggestions: [
      "¿Hay problemas con alguna dinámica? Especifica cuál y qué no funciona",
      "¿Los materiales están dañados o son inaccesibles? Indica cuáles",
      "¿Necesitas ayuda con recursos para tu grupo? Especifica edad y contexto"
    ],
    tip: "💡 <strong>Asunto del email:</strong> Gen Animadores"
  },
  
  experiencia: {
    title: "💝 Compartir Experiencia",
    suggestions: [
      "Cuenta tu experiencia con detalles: ¿qué pasó y cómo te marcó?",
      "Incluye reflexiones: ¿qué aprendiste de esta vivencia?",
      "Menciona tu nombre y país para identificar el testimonio",
      "Si tienes fotos relacionadas, puedes adjuntarlas"
    ],
    tip: "💡 <strong>Asunto del email:</strong> Experiencia de vida"
  },
  
  biblioteca: {
    title: "📚 Biblioteca",
    suggestions: [
      "¿Buscas un documento específico? Describe el tema, autor o título",
      "¿Hay enlaces rotos o archivos dañados? Indica cuáles exactamente",
      "¿Necesitas material sobre algún tema del movimiento? Sé específico"
    ],
    tip: "💡 <strong>Asunto del email:</strong> Biblioteca"
  },
  
  movimiento: {
    title: "❤️ Sobre el Movimiento",
    suggestions: [
      "¿Tienes dudas sobre historia o espiritualidad? Formula preguntas específicas",
      "¿Quieres corregir información? Cita fuentes y especifica qué cambiar",
      "¿Buscas material sobre algún aspecto del carisma? Menciona qué tema"
    ],
    tip: "💡 <strong>Asunto del email:</strong> Sobre el Movimiento"
  },
  
  colaboracion: {
    title: "🤝 Colaboración",
    suggestions: [
      "¿En qué área te gustaría colaborar? Especifica tus habilidades",
      "¿Propones un nuevo proyecto? Describe la idea y cómo ayudaría",
    ],
    tip: "💡 <strong>Asunto del email:</strong> Colaboración"
  },
  
  mejoras: {
    title: "💡 Mejoras para la Página",
    suggestions: [
      "¿Encontraste un error? Describe qué estabas haciendo cuando ocurrió",
      "¿Tienes ideas para nuevas funciones? Explica cómo mejorarían la experiencia",
      "¿Hay problemas de diseño? Especifica dispositivo, navegador y pantalla",
      "¿La página es lenta? Menciona tu conexión y ubicación"
    ],
    tip: "💡 <strong>Asunto del email:</strong> Mejoras página"
  },
  
  general: {
    title: "💭 Contacto General",
    suggestions: [
      "¿Tienes preguntas sobre cómo participar? Especifica qué te interesa",
      "¿Necesitas contacto de otros centros? Indica ubicación o región",
      "¿Quieres información general del movimiento? Sé específico",
      "¿Tienes dudas que no encajan en otras categorías? Explica tu situación"
    ],
    tip: "💡 <strong>Asunto del email:</strong> Consulta general"
  }
};

function selectCategory(category) {
  // Actualizar botones
  document.querySelectorAll('.categoria-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  const selectedBtn = document.querySelector(`[data-category="${category}"]`);
  selectedBtn.classList.add('active');
  
  // Actualizar área de sugerencias
  const sugerenciasArea = document.getElementById('sugerenciasArea');
  const sugerenciaContent = document.getElementById('sugerenciaContent');
  
  const data = categoryData[category];
  
  if (data) {
    sugerenciaContent.innerHTML = `
      <h5>${data.title}</h5>
      
      <div class="intro-email">
        <p>"Hola equipo Gen 2, les escribo para contactarlos sobre ${data.title.replace(/🎸|🎯|💝|📚|❤️|🤝|💡|💭/g, '').trim()}, breve descripción del mensaje.</p>
        <p>Mensaje completo"</p>
      </div>
      
      <ul>
        ${data.suggestions.map(suggestion => `<li>${suggestion}</li>`).join('')}
      </ul>
      
      <div class="tip">
        ${data.tip}
      </div>
    `;
  }
  
  // Animación suave
  sugerenciasArea.style.opacity = '0.7';
  setTimeout(() => {
    sugerenciasArea.style.opacity = '1';
  }, 150);
}

// ============ NAVEGACIÓN ============
function scrollToSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (section) {
    section.scrollIntoView({ 
      behavior: 'smooth',
      block: 'start'
    });
  }
}

// ============ INICIALIZACIÓN ============
window.addEventListener('load', function() {
  if (window.location.hash === '#contacto' || document.referrer.includes('experiencias.html')) {
    setTimeout(function() {
      scrollToSection('contacto');
    }, 300);
  }
});

// ============ DETECCIÓN DE TEMA ============
if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.classList.add('dark');
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
    if (event.matches) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
});

console.log('✅ Links renovado cargado correctamente');