# Use SolidStart as a static PWA

Jot will start as a static progressive web app because the first deployable version must not require a backend. We will use SolidStart only through its static build path so routing and application structure can grow without introducing server-side runtime assumptions; Google authentication, Drive sync, Photos integration, and local draft persistence remain browser-side concerns. If SolidStart's static path becomes the main source of complexity, plain Solid with Vite is the fallback.
