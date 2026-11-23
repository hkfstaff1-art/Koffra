import { useQuery } from '@tanstack/react-query'
import { fetchHealth } from '../services/api/health'

/** Écran temporaire de l'étape 0 : vérifie la liaison frontend ↔ API. */
export function HomePage() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, retry: false })

  const state = health.isPending ? 'pending' : health.isError ? 'error' : 'ok'
  const label =
    state === 'pending'
      ? 'Connexion à l’API…'
      : state === 'error'
        ? 'API injoignable'
        : `API opérationnelle (${health.data?.version ?? ''})`

  return (
    <main className="shell">
      <section className="card" aria-labelledby="title">
        <img src="/brand/koffra-logo.png" alt="Logo KOFFRA" width={256} height={171} />
        <h1 id="title" className="sr-only">
          KOFFRA
        </h1>
        <p>Coffre-fort numérique privé — environnement de développement.</p>
        <p className="status" data-state={state} role="status" aria-live="polite">
          {label}
        </p>
      </section>
    </main>
  )
}
