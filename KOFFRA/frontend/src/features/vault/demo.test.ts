import { describe, expect, it } from 'vitest'
import { DEMO_CATEGORIES, DEMO_COUNT, demoItems } from './demo'
import { forbiddenDataWarnings, normalizeItem } from './model'

describe('données de test', () => {
  const items = demoItems(DEMO_CATEGORIES.map((_, i) => `cat-${i}`))

  it('sont toutes marquées « demo » et le marqueur survit au déchiffrement', () => {
    expect(items).toHaveLength(DEMO_COUNT)
    for (const i of items) expect(normalizeItem(JSON.parse(JSON.stringify(i.data))).demo).toBe(true)
  })

  it('un payload sans marqueur n’est jamais considéré comme donnée de test', () => {
    expect(normalizeItem({ type: 'login', title: 'Vraie entrée', demo: 'true' }).demo).toBeUndefined()
  })

  it('ne contiennent aucune donnée interdite et utilisent des domaines fictifs', () => {
    for (const i of items) {
      expect(forbiddenDataWarnings(i.data)).toEqual([])
      if (i.data.fields.url) expect(i.data.fields.url).toMatch(/\.example\.com$/)
    }
  })
})
