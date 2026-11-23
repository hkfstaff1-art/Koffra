import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTER, emptyItem, filterEntries, forbiddenDataWarnings, normalizeItem, type VaultEntry } from './model'

function entry(partial: Partial<VaultEntry> & { title: string; fields?: Record<string, string> }): VaultEntry {
  const { title, fields, ...rest } = partial
  return {
    uuid: crypto.randomUUID(),
    revision: 1,
    keyVersion: 1,
    categoryUuid: null,
    favorite: false,
    archivedAt: null,
    deletedAt: null,
    updatedAt: '2026-11-20T10:00:00Z',
    createdAt: '2026-11-01T10:00:00Z',
    serverAttachments: [],
    data: { ...emptyItem('login'), title, fields: fields ?? {} },
    ...rest,
  }
}

describe('filterEntries (recherche locale)', () => {
  const banque = entry({ title: 'Banque Atlantique', fields: { username: 'compta@hkf', password: 'Sésame-Secret-42' } })
  const gmail = entry({ title: 'Gmail', favorite: true, updatedAt: '2026-11-22T10:00:00Z' })
  const archive = entry({ title: 'Ancien hébergeur', archivedAt: '2026-10-01T00:00:00Z' })
  const supprime = entry({ title: 'Supprimé', deletedAt: '2026-11-21T00:00:00Z' })
  const all = [banque, gmail, archive, supprime]

  it('cherche sans tenir compte des accents ni de la casse, sur plusieurs mots', () => {
    expect(filterEntries(all, { ...DEFAULT_FILTER, query: 'BANQUE atlan' })).toEqual([banque])
    expect(filterEntries(all, { ...DEFAULT_FILTER, query: 'compta' })).toEqual([banque])
  })

  it('n’indexe jamais les champs secrets', () => {
    expect(filterEntries(all, { ...DEFAULT_FILTER, query: 'sesame' })).toEqual([])
  })

  it('sépare entrées actives, favoris, archives et corbeille', () => {
    expect(filterEntries(all, DEFAULT_FILTER).map((e) => e.data.title)).toEqual(['Gmail', 'Banque Atlantique'])
    expect(filterEntries(all, { ...DEFAULT_FILTER, view: 'favorites' })).toEqual([gmail])
    expect(filterEntries(all, { ...DEFAULT_FILTER, view: 'archived' })).toEqual([archive])
    expect(filterEntries(all, { ...DEFAULT_FILTER, view: 'trash' })).toEqual([supprime])
  })

  it('trie par titre', () => {
    expect(filterEntries(all, { ...DEFAULT_FILTER, sort: 'title' }).map((e) => e.data.title)).toEqual(['Banque Atlantique', 'Gmail'])
  })
})

describe('forbiddenDataWarnings (PIN, CVV, carte complète)', () => {
  it('signale les champs interdits', () => {
    const data = { ...emptyItem('bank'), custom: [{ label: 'Code PIN Mobile Money', value: '1234', secret: true }, { label: 'CVV', value: '123', secret: true }] }
    expect(forbiddenDataWarnings(data)).toHaveLength(2)
  })

  it('signale un numéro de carte complet', () => {
    expect(forbiddenDataWarnings({ ...emptyItem('bank'), fields: { reference: '4970 1012 3456 7890' } })).toHaveLength(1)
    expect(forbiddenDataWarnings({ ...emptyItem('bank'), fields: { card_last4: '4970101234567890' } })).toHaveLength(1)
  })

  it('accepte des références non sensibles', () => {
    expect(forbiddenDataWarnings({ ...emptyItem('bank'), fields: { reference: 'BJ66 BJ01 0001', card_last4: '7890' } })).toEqual([])
  })
})

describe('normalizeItem', () => {
  it('tolère un payload incomplet ou inattendu', () => {
    const item = normalizeItem({ type: 'inconnu', fields: { a: 'x', b: 3 }, custom: [{ label: 'L', value: 'v' }, 'bad'] })
    expect(item.type).toBe('other')
    expect(item.title).toBe('(sans titre)')
    expect(item.fields).toEqual({ a: 'x' })
    expect(item.custom).toEqual([{ label: 'L', value: 'v', secret: false }])
  })
})
