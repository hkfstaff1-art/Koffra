// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { CryptoError, decryptExport, DEFAULT_GENERATOR, encryptExport, estimatePasswordStrength, generatePassword, generatorEntropyBits, MIN_KDF_COST, sha256Hex, toB64, fromB64 } from './index'

describe('Générateur de mots de passe', () => {
  it('respecte la longueur et contient chaque famille demandée', async () => {
    for (let i = 0; i < 50; i++) {
      const p = await generatePassword({ ...DEFAULT_GENERATOR, length: 12 })
      expect(p).toHaveLength(12)
      expect(p).toMatch(/[a-z]/)
      expect(p).toMatch(/[A-Z]/)
      expect(p).toMatch(/[0-9]/)
      expect(p).toMatch(/[^a-zA-Z0-9]/)
      expect(p).not.toMatch(/[0O1lIo|]/)
    }
  })

  it('produit des valeurs différentes et respecte les options', async () => {
    const set = new Set(await Promise.all(Array.from({ length: 200 }, () => generatePassword())))
    expect(set.size).toBe(200)
    expect(await generatePassword({ ...DEFAULT_GENERATOR, upper: false, symbols: false, digits: false, length: 30 })).toMatch(/^[a-z]{30}$/)
  })

  it('refuse des options invalides', async () => {
    await expect(generatePassword({ ...DEFAULT_GENERATOR, length: 4 })).rejects.toBeInstanceOf(CryptoError)
    await expect(generatePassword({ ...DEFAULT_GENERATOR, lower: false, upper: false, digits: false, symbols: false })).rejects.toBeInstanceOf(CryptoError)
  })

  it('estime l’entropie', () => {
    expect(generatorEntropyBits({ ...DEFAULT_GENERATOR, length: 20 })).toBeGreaterThan(110)
    expect(estimatePasswordStrength('azerty').label).toBe('faible')
    expect(estimatePasswordStrength('Une-phrase de passe tres longue 2026!').label).toBe('très fort')
  })
})

describe('Fichier d’export chiffré', () => {
  const content = { app: 'koffra', items: [{ data: { title: 'Banque', fields: { password: 'S3cret!' } } }] }

  it('chiffre et déchiffre avec la phrase d’export, sans rien laisser en clair', async () => {
    const file = await encryptExport(content, 'phrase export très longue', MIN_KDF_COST)
    const serialized = JSON.stringify(file)
    expect(serialized).not.toContain('S3cret!')
    expect(serialized).not.toContain('Banque')
    expect(await decryptExport(JSON.parse(serialized), 'phrase export très longue')).toEqual(content)
  })

  it('refuse une mauvaise phrase, un fichier altéré ou une phrase trop courte', async () => {
    const file = await encryptExport(content, 'phrase export très longue', MIN_KDF_COST)
    await expect(decryptExport(file, 'mauvaise phrase !!')).rejects.toMatchObject({ code: 'DECRYPT_FAILED' })
    const raw = await fromB64(file.data.c)
    raw[3] = (raw[3] ?? 0) ^ 1
    await expect(decryptExport({ ...file, data: { ...file.data, c: await toB64(raw) } }, 'phrase export très longue')).rejects.toMatchObject({ code: 'DECRYPT_FAILED' })
    await expect(decryptExport({ ...file, kdf: { ...file.kdf, ops: 1 } }, 'phrase export très longue')).rejects.toMatchObject({ code: 'WEAK_KDF_PARAMS' })
    await expect(decryptExport({ format: 'autre' }, 'x')).rejects.toMatchObject({ code: 'INVALID_FORMAT' })
    await expect(encryptExport(content, 'court')).rejects.toBeInstanceOf(CryptoError)
  })

  it('calcule un SHA-256 hexadécimal', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
