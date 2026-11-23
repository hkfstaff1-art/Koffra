# Frontend KOFFRA — React + TypeScript + Vite

## Démarrage

```bash
npm install
npm run dev        # http://localhost:5173 — /api et /sanctum sont proxifiés vers l'API (port 8000)
```

L'API doit tourner (`cd ../backend && composer dev`). Autre adresse d'API : variable `KOFFRA_API_URL`.

## Scripts

| Commande | Rôle |
|---|---|
| `npm run typecheck` | TypeScript strict |
| `npm run lint` | oxlint |
| `npm test` | Vitest + Testing Library (jsdom) |
| `npm run build` | build de production dans `dist/` |

## Organisation (`src/`)
`app` (racine, providers, routes) · `pages` · `features` · `components` · `services/api` (client HTTP) · `crypto` (module de chiffrement, étape 1) · `hooks` · `types` · `styles` · `test`.

## Règles
- Aucun secret, token ou donnée de coffre dans `localStorage`, `sessionStorage`, IndexedDB ou le cache du service worker.
- Client HTTP : cookies même origine, en-tête `X-XSRF-TOKEN`, `cache: 'no-store'` (`src/services/api/client.ts`).
