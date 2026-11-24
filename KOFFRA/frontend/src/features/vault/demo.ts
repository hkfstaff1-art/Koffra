import type { ItemData, ItemType, VaultEntry } from './model'

/**
 * Données de test (fictives) pour essayer l'interface. Elles sont chiffrées comme de vraies entrées
 * et marquées `demo: true` dans le contenu chiffré, ce qui permet de les retrouver et de les supprimer.
 * Aucune donnée réelle : domaines en example.com, mots de passe inventés, références factices.
 */
export const DEMO_CATEGORIES = ['Démo · Banques', 'Démo · Réseaux sociaux', 'Démo · Outils de travail', 'Démo · Fournisseurs']

interface DemoItem {
  type: ItemType
  title: string
  category: number | null
  favorite?: boolean
  archived?: boolean
  fields: Record<string, string>
  notes?: string
  custom?: { label: string; value: string; secret: boolean }[]
}

const ITEMS: DemoItem[] = [
  { type: 'login', title: 'Banque Atlantique — espace pro', category: 0, favorite: true, fields: { url: 'https://banque.example.com', username: 'compta@example.com', password: 'Atl-2026!Pro#Sûr-9x' } },
  { type: 'bank', title: 'Compte courant société', category: 0, fields: { bank: 'Banque Atlantique (fictive)', holder: 'HKF STAFF (démo)', reference: 'XX00 DEMO 0000 0000 0000', card_last4: '4242' }, notes: 'Référence factice pour les tests.' },
  { type: 'login', title: 'Mobile Money — portail marchand', category: 0, fields: { url: 'https://momo.example.com', username: 'marchand-0001', password: 'azerty123' }, notes: 'Mot de passe volontairement faible (exemple « À renforcer »).' },
  { type: 'email', title: 'Facebook — page entreprise', category: 1, favorite: true, fields: { url: 'https://facebook.example.com', username: 'page@example.com', password: 'Fb-Page_2026-Long!', recovery: 'Téléphone du gérant' } },
  { type: 'email', title: 'Instagram', category: 1, fields: { url: 'https://instagram.example.com', username: '@hkfstaff.demo', password: 'azerty123' }, notes: 'Mot de passe réutilisé (exemple « À renforcer »).' },
  { type: 'email', title: 'LinkedIn', category: 1, fields: { url: 'https://linkedin.example.com', username: 'contact@example.com', password: 'Lk-Reseau!2026-Pro' } },
  { type: 'email', title: 'Gmail — contact', category: 1, fields: { url: 'https://mail.example.com', username: 'contact@example.com', password: 'Soleil2024', recovery: 'contact.secours@example.com' } },
  { type: 'saas', title: 'Hostinger — hPanel', category: 2, favorite: true, fields: { url: 'https://hpanel.example.com', username: 'admin@example.com', password: 'Hp-Tres-Long-Mot-De-Passe-2026', account: 'Compte HKF (démo)' } },
  { type: 'saas', title: 'Google Workspace — administration', category: 2, fields: { url: 'https://admin.example.com', username: 'admin@example.com', password: 'Gw!Adm1n-2026-Sur', account: 'example.com' } },
  { type: 'api', title: 'Clé API — passerelle SMS', category: 2, fields: { service: 'Passerelle SMS (fictive)', key_id: 'demo_key_01', secret: 'sk_demo_4f9a1c7e2b8d6f0a3c5e7b9d1f2a4c6e', expires: '31/12/2026' } },
  { type: 'login', title: 'Canva', category: 2, fields: { url: 'https://canva.example.com', username: 'design@example.com', password: 'Cv-Design#2026!' } },
  { type: 'contact', title: 'Imprimerie du Plateau', category: 3, fields: { company: 'Imprimerie du Plateau (fictive)', phone: '+225 00 00 00 00', email: 'devis@example.com', address: 'Rue des Essais, Plateau\nAbidjan' } },
  { type: 'contact', title: 'Fournisseur informatique', category: 3, fields: { company: 'Tech Fourniture (fictive)', phone: '+225 01 02 03 04', email: 'support@example.com' }, custom: [{ label: 'N° client', value: 'CLI-DEMO-0042', secret: false }] },
  { type: 'note', title: 'Procédure — accès Wi-Fi bureau', category: null, fields: {}, notes: 'Réseau : HKF-Bureau (démo)\nMot de passe affiché à l’accueil.\nChanger tous les 3 mois.' },
  { type: 'other', title: 'Licence logiciel de comptabilité', category: null, fields: {}, custom: [{ label: 'Clé de licence', value: 'DEMO-1234-5678-ABCD', secret: true }, { label: 'Échéance', value: 'Mars 2027', secret: false }] },
  { type: 'login', title: 'Ancien site vitrine (archivé)', category: 2, archived: true, fields: { url: 'https://ancien.example.com', username: 'webmaster', password: 'Old-Site!2019' } },
]

export function demoItems(categoryUuids: string[]): { data: ItemData; categoryUuid: string | null; favorite: boolean; archived: boolean }[] {
  return ITEMS.map((i) => ({
    data: { type: i.type, title: i.title, fields: i.fields, custom: i.custom ?? [], notes: i.notes ?? '', attachments: [], demo: true },
    categoryUuid: i.category === null ? null : (categoryUuids[i.category] ?? null),
    favorite: i.favorite ?? false,
    archived: i.archived ?? false,
  }))
}

export const DEMO_COUNT = ITEMS.length

export function isDemo(entry: VaultEntry): boolean {
  return entry.data.demo === true
}
