# Inicio diario sin lecturas de Firestore por visitante

La portada consume `datos/inicio.json`. GitHub Actions regenera ese archivo una vez por día mediante la API web pública de Firestore y las mismas reglas de seguridad que usa el sitio.

## Configuración

No requiere una cuenta de servicio ni el secreto `FIREBASE_SERVICE_ACCOUNT`. La API key web identifica el proyecto pero no concede privilegios: `firestore.rules` decide qué documentos públicos puede leer el proceso.

## Ejecución

El workflow `.github/workflows/generar-inicio-diario.yml` se ejecuta todos los días a las 00:05 de `America/Argentina/Buenos_Aires`. También puede ejecutarse manualmente.

Si falla, la portada conserva el último `datos/inicio.json` válido. El proceso informa en el registro cuántos documentos leyó durante la generación.

La portada no vuelve a consultar las colecciones de frases, meditaciones, Pasapalabra, PdV, carrusel o Canal. Los usuarios anónimos leen solamente el JSON estático; una sesión iniciada puede seguir leyendo su propio perfil para autenticación.

## Reglas e índices

`firestore.rules` y `firestore.indexes.json` están versionados, pero deben publicarse en Firebase para tener efecto:

```powershell
firebase deploy --only firestore
```

Antes de publicarlas en producción conviene validarlas con Firebase Emulator Suite y una copia representativa de los documentos.
