import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Spinner } from '../components/ui'
import { VaultProvider } from '../features/vault/VaultProvider'
import { ActivityPage } from '../pages/ActivityPage'
import { AdminsPage } from '../pages/AdminsPage'
import { CategoriesPage } from '../pages/CategoriesPage'
import { DashboardPage } from '../pages/DashboardPage'
import { DevicesPage } from '../pages/DevicesPage'
import { GeneratorPage } from '../pages/GeneratorPage'
import { SettingsPage } from '../pages/SettingsPage'
import { InstallPage } from '../pages/auth/InstallPage'
import { InvitationPage } from '../pages/auth/InvitationPage'
import { LoginPage, UnlockPage } from '../pages/auth/LoginPage'
import { RecoveryPage } from '../pages/auth/RecoveryPage'
import { ItemDetailPage } from '../pages/vault/ItemDetailPage'
import { ItemEditorPage } from '../pages/vault/ItemEditorPage'
import { VaultListPage } from '../pages/vault/VaultListPage'
import { koffra } from '../services/api/koffra'
import { AppLayout } from './AppLayout'
import { ReauthProvider } from './reauth'
import { SessionProvider, useSession } from './session'

function PublicRoutes() {
  const status = useQuery({ queryKey: ['setup-status'], queryFn: koffra.setupStatus })
  if (status.isPending) return <Spinner />
  const installed = status.data?.installed ?? true

  return (
    <Routes>
      <Route path="/installation" element={installed ? <Navigate to="/connexion" replace /> : <InstallPage />} />
      <Route path="/invitation" element={<InvitationPage />} />
      <Route path="/recuperation" element={<RecoveryPage />} />
      <Route path="/connexion" element={<LoginPage />} />
      <Route path="*" element={<Navigate to="/connexion" replace />} />
    </Routes>
  )
}

function PrivateRoutes() {
  return (
    <ReauthProvider>
      <VaultProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="coffre" element={<VaultListPage />}>
              <Route path="nouveau" element={<ItemEditorPage />} />
              <Route path=":uuid" element={<ItemDetailPage />} />
              <Route path=":uuid/modifier" element={<ItemEditorPage />} />
            </Route>
            <Route path="generateur" element={<GeneratorPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="appareils" element={<DevicesPage />} />
            <Route path="administrateurs" element={<AdminsPage />} />
            <Route path="journal" element={<ActivityPage />} />
            <Route path="parametres" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </VaultProvider>
    </ReauthProvider>
  )
}

function Gate() {
  const { phase } = useSession()
  if (phase === 'loading') return <Spinner />
  if (phase === 'anonymous') return <PublicRoutes />
  if (phase === 'locked') return <UnlockPage />
  return <PrivateRoutes />
}

export function App() {
  // Cache TanStack Query en mémoire uniquement (jamais persisté sur disque).
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } } }))

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionProvider>
          <Gate />
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
