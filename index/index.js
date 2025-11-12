import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js';
import {
    getFirestore,
    collection,
    getDocs,
    query,
    where
} from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js';

// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyB7US5r--cM82usyzLqd-ckamgIdyewfKE",
    authDomain: "pagina-gen.firebaseapp.com",
    projectId: "pagina-gen",
    storageBucket: "pagina-gen.appspot.com",
    messagingSenderId: "876893109130",
    appId: "1:876893109130:web:862f79fc7a609e512ee673"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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
    cargarFraseAleatoria();
    cargarTituloPasapalabraHoy();
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

// Cargar frase aleatoria desde Firebase
async function cargarFraseAleatoria() {
    const fraseElement = document.querySelector('.hero-banner p');
    
    try {
        const querySnapshot = await getDocs(collection(db, 'frases'));
        const frases = [];
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.activa !== false) {
                frases.push(data);
            }
        });
        
        if (frases.length > 0) {
            const fraseAleatoria = frases[Math.floor(Math.random() * frases.length)];
            fraseElement.textContent = fraseAleatoria.frase || 'Jóvenes comprometidos en construir un mundo más unido';
        } else {
            fraseElement.textContent = 'Jóvenes comprometidos en construir un mundo más unido';
        }
    } catch (error) {
        console.error('Error al cargar frase:', error);
        fraseElement.textContent = 'Jóvenes comprometidos en construir un mundo más unido';
    }
}

// Funciones auxiliares para pasapalabra
function parseFecha(fechaStr) {
    if (!fechaStr) return null;
    const partes = fechaStr.split('/');
    if (partes.length === 3) {
        const dia = parseInt(partes[0], 10);
        const mes = parseInt(partes[1], 10) - 1;
        const anio = parseInt(partes[2], 10);
        return new Date(anio, mes, dia);
    }
    return null;
}

function obtenerFechaHoy() {
    const hoy = new Date();
    const dia = String(hoy.getDate()).padStart(2, '0');
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const anio = hoy.getFullYear();
    return `${dia}/${mes}/${anio}`;
}

function formatearFechaLegible(fechaStr) {
    const meses = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];
    
    const partes = fechaStr.split('/');
    if (partes.length === 3) {
        const dia = parseInt(partes[0], 10);
        const mes = parseInt(partes[1], 10) - 1;
        const anio = partes[2];
        return `${dia} de ${meses[mes]} de ${anio}`;
    }
    return fechaStr;
}

// Cargar título del pasapalabra de hoy
async function cargarTituloPasapalabraHoy() {
    const tituloElement = document.querySelector('.pasapalabra-title');
    const fechaElement = document.querySelector('.pasapalabra-date');
    
    try {
        const fechaHoy = obtenerFechaHoy();
        
        const q = query(
            collection(db, 'pasapalabra'),
            where('estado', '==', 'publicado')
        );
        
        const querySnapshot = await getDocs(q);
        let pasapalabraEncontrado = null;

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.fecha === fechaHoy) {
                pasapalabraEncontrado = data;
            }
        });

        if (pasapalabraEncontrado) {
            tituloElement.textContent = pasapalabraEncontrado.titulo || '...';
            fechaElement.textContent = formatearFechaLegible(pasapalabraEncontrado.fecha);
        } else {
            tituloElement.textContent = '...';
            fechaElement.textContent = formatearFechaLegible(fechaHoy);
        }
    } catch (error) {
        console.error('Error al cargar pasapalabra de hoy:', error);
        tituloElement.textContent = '...';
        fechaElement.textContent = formatearFechaLegible(obtenerFechaHoy());
    }
}

// Inicializar carrusel automático
function startCarousel() {
    if (carouselInterval) clearInterval(carouselInterval);
    
    carouselInterval = setInterval(() => {
        changeSlide(1);
    }, 6000);
}

// Pausar carrusel cuando el usuario interactúa
function pauseCarousel() {
    if (carouselInterval) {
        clearInterval(carouselInterval);
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
    
    slides[currentSlide].classList.remove('active');
    indicators[currentSlide].classList.remove('active');
    
    currentSlide = (currentSlide + direction + totalSlides) % totalSlides;
    
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
    const experienciasContainer = document.querySelector('.experiencias-container');
    if (experienciasContainer) {
        experienciasContainer.addEventListener('mouseenter', () => {
            if (carouselInterval) clearInterval(carouselInterval);
        });
        
        experienciasContainer.addEventListener('mouseleave', () => {
            startCarousel();
        });
    }
    
    setupThemeDetection();
}

// Detectar tema del sistema
function setupThemeDetection() {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    updateTheme(mediaQuery.matches);
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