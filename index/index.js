// Variables del carrusel
let currentSlide = 0;
const totalSlides = 3;
let carouselInterval;

// Inicialización
document.addEventListener('DOMContentLoaded', function() {
    initializePage();
});

// Inicializar página
function initializePage() {
    setCurrentDate();
    startCarousel();
    setupEventListeners();
}

// Configurar fecha actual en pasapalabra
function setCurrentDate() {
    const dateElement = document.getElementById('fechaHoy');
    if (dateElement) {
        const today = new Date();
        const options = { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric'
        };
        dateElement.textContent = today.toLocaleDateString('es-ES', options);
    }
}

// Inicializar carrusel automático
function startCarousel() {
    if (carouselInterval) clearInterval(carouselInterval);
    
    carouselInterval = setInterval(() => {
        changeSlide(1);
    }, 6000); // Cambio cada 6 segundos
}

// Pausar carrusel cuando el usuario interactúa
function pauseCarousel() {
    if (carouselInterval) {
        clearInterval(carouselInterval);
        // Reanudar después de 10 segundos
        setTimeout(() => {
            startCarousel();
        }, 10000);
    }
}

// Cambiar slide del carrusel
function changeSlide(direction) {
    const slides = document.querySelectorAll('.experiencia-slide');
    const indicators = document.querySelectorAll('.indicator');
    
    if (slides.length === 0) return;
    
    // Remover clase active del slide actual
    slides[currentSlide].classList.remove('active');
    indicators[currentSlide].classList.remove('active');
    
    // Calcular nuevo slide
    currentSlide = (currentSlide + direction + totalSlides) % totalSlides;
    
    // Agregar clase active al nuevo slide
    slides[currentSlide].classList.add('active');
    indicators[currentSlide].classList.add('active');
    
    pauseCarousel();
}

// Ir a slide específico
function goToSlide(index) {
    const slides = document.querySelectorAll('.experiencia-slide');
    const indicators = document.querySelectorAll('.indicator');
    
    if (slides.length === 0 || index === currentSlide) return;
    
    slides[currentSlide].classList.remove('active');
    indicators[currentSlide].classList.remove('active');
    
    currentSlide = index;
    
    slides[currentSlide].classList.add('active');
    indicators[currentSlide].classList.add('active');
    
    pauseCarousel();
}

// Event listeners
function setupEventListeners() {
    // Pausar carrusel al pasar el mouse sobre experiencias
    const experienciasContainer = document.querySelector('.experiencias-container');
    if (experienciasContainer) {
        experienciasContainer.addEventListener('mouseenter', () => {
            if (carouselInterval) clearInterval(carouselInterval);
        });
        
        experienciasContainer.addEventListener('mouseleave', () => {
            startCarousel();
        });
    }
    
    // Detectar cambios de tema
    setupThemeDetection();
}

// Detectar tema del sistema
function setupThemeDetection() {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    // Aplicar tema inicial
    updateTheme(mediaQuery.matches);
    
    // Escuchar cambios de tema
    mediaQuery.addEventListener('change', (e) => {
        updateTheme(e.matches);
    });
}

// Actualizar tema
function updateTheme(isDark) {
    if (isDark) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}

// Limpiar intervalos al salir de la página
window.addEventListener('beforeunload', () => {
    if (carouselInterval) clearInterval(carouselInterval);
});

// Funciones globales para HTML
window.changeSlide = changeSlide;
window.goToSlide = goToSlide;

console.log('✅ Index optimizado cargado correctamente');