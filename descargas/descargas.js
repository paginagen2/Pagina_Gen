document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('matrixCanvas');
    const ctx = canvas.getContext('2d');

    // Ajustar el tamaño del canvas al contenedor hero
    const resizeCanvas = () => {
        const hero = canvas.parentElement;
        canvas.width = hero.offsetWidth;
        canvas.height = hero.offsetHeight;
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas(); // Establecer tamaño inicial

    // Caracteres para la lluvia de código (solo 0 y 1)
    const characters = ['0', '1'];

    // Tamaño de la fuente y columnas
    const fontSize = 16;
    const columns = Math.floor(canvas.width / fontSize);

    // Array para almacenar la posición 'y' de cada columna
    const drops = [];
    for (let i = 0; i < columns; i++) {
        drops[i] = 1; // Empezar desde la parte superior
    }

    // Función para dibujar la animación
    function draw() {
        // Fondo semi-transparente para el efecto de rastro
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Color y estilo de la fuente (verde Matrix)
        ctx.fillStyle = '#0F0'; // Verde brillante
        ctx.font = `${fontSize}px monospace`;

        // Dibujar cada gota
        for (let i = 0; i < drops.length; i++) {
            // Seleccionar un carácter aleatorio
            const text = characters[Math.floor(Math.random() * characters.length)];

            // Dibujar el carácter
            ctx.fillText(text, i * fontSize, drops[i] * fontSize);

            // Reiniciar la gota si llega al final o aleatoriamente
            if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                drops[i] = 0; // Volver arriba
            }

            // Mover la gota hacia abajo
            drops[i]++;
        }
    }

    // Iniciar la animación
    setInterval(draw, 33); // Aproximadamente 30 FPS
});