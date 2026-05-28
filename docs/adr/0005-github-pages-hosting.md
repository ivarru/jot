# Host the static app on GitHub Pages

Jot v1 will be hosted as a static app on GitHub Pages. This fits the no-backend constraint and keeps deployment simple for a personal PWA, but it means OAuth redirects, routing, app-shell caching, and Google API integration must work without server-side request handling. If those constraints become the main blocker, another static host can be reconsidered without changing the core Daily Note model.
