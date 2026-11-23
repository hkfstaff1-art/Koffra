import sodiumModule from 'libsodium-wrappers-sumo'

export type Sodium = typeof sodiumModule

/** Renvoie libsodium une fois le module WebAssembly initialisé. */
export async function getSodium(): Promise<Sodium> {
  await sodiumModule.ready
  return sodiumModule
}

/** Efface un tampon contenant une clé (au mieux de ce que permet JavaScript). */
export async function wipe(...buffers: (Uint8Array | null | undefined)[]): Promise<void> {
  const s = await getSodium()
  for (const b of buffers) if (b) s.memzero(b)
}
