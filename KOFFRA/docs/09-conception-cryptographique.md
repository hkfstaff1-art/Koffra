# KOFFRA — Conception cryptographique et modèle de menace (v1)

> Document de référence du module `frontend/src/crypto/`. Toute modification du protocole
> doit incrémenter `CRYPTO_VERSION` et être relue. **Audit indépendant requis avant données réelles.**

## 1. Bibliothèque et primitives
Bibliothèque unique : **libsodium** (`libsodium-wrappers-sumo`, WebAssembly). Aucune primitive maison.

| Usage | Primitive libsodium |
|---|---|
| Dérivation depuis le mot de passe | Argon2id (`crypto_pwhash`, ALG_ARGON2ID13), sel aléatoire 16 o |
| Sous-clés indépendantes | `crypto_kdf_derive_from_key` (BLAKE2b, contexte 8 o) |
| Chiffrement authentifié | XChaCha20-Poly1305 IETF (`crypto_aead_xchacha20poly1305_ietf_*`), nonce aléatoire 24 o, données associées (AD) |
| Partage de la clé du coffre | X25519 + sealed box (`crypto_box_seal`) |
| Pièces jointes | `crypto_secretstream_xchacha20poly1305` (flux par blocs) |
| Empreintes | BLAKE2b (`crypto_generichash`) |
| Aléa | `randombytes_buf` / `randombytes_uniform` (CSPRNG) |

XChaCha20-Poly1305 est retenu (doc 03 l'autorise) : nonce de 192 bits tiré aléatoirement sans risque de collision. Le test « ciphertext modifié rejeté » de la doc 06 porte sur le tag Poly1305.

## 2. Hiérarchie des clés

```text
mot de passe ──Argon2id(sel, ops, mem)──► masterKey (jamais stockée, jamais envoyée)
                                            ├─ kdf(1,"KOFFauth") ─► authKey ──► serveur (re-haché Argon2id côté serveur)
                                            └─ kdf(2,"KOFFwrap") ─► wrapKey
wrapKey ──AEAD──► userKey (aléatoire, 32 o)          ◄──AEAD── recoveryWrapKey ◄─kdf─ clé de récupération (256 bits)
userKey ──AEAD──► clé privée X25519 de l'utilisateur
userKey ──AEAD──► vaultKey (accès « confirmé »)
clé publique X25519 ──sealed box──► vaultKey (accès « en attente », invitation)
vaultKey (versionnée) ──AEAD──► chaque entrée du coffre (+ clé de fichier des pièces jointes)
```

- **Un seul mot de passe saisi**, deux usages séparés : le serveur reçoit `authKey`, dont on ne peut pas remonter à `wrapKey` (dérivations indépendantes d'une clé de 256 bits). Exigence « authentification distincte de la clé de déchiffrement » respectée.
- **userKey** isole le mot de passe du reste : changer de mot de passe ou utiliser la clé de récupération ne ré-enveloppe que `userKey`.
- **Coffre partagé** (décision validée) : une seule `vaultKey` par version, partagée par les admins (5 max). Chaque admin en possède une enveloppe.

## 3. Formats
Toute donnée chiffrée est une **enveloppe** : `{ v: 1, n: <nonce base64url>, c: <ciphertext+tag base64url> }`.
Les **données associées** lient chaque ciphertext à son contexte, ce qui empêche de déplacer un ciphertext d'un emplacement à un autre :

| Objet | AD |
|---|---|
| userKey (mot de passe) | `koffra/v1/user-key/password/{userUuid}` |
| userKey (récupération) | `koffra/v1/user-key/recovery/{userUuid}` |
| clé privée | `koffra/v1/private-key/{userUuid}` |
| vaultKey confirmée | `koffra/v1/vault-key/{userUuid}/{keyVersion}` |
| entrée du coffre | `koffra/v1/item/{itemUuid}/{keyVersion}` |

Encodage binaire → texte : base64url sans padding.

## 4. Paramètres Argon2id
- Défaut : `ops=3`, `mem=64 Mio` (≈ 0,4 s sur PC ; à calibrer sur les téléphones cibles en étape 7).
- Plancher **refusé en dessous** : `ops≥2`, `mem≥19 Mio` (recommandation OWASP). Les paramètres renvoyés par le serveur sont validés côté client, ce qui empêche un serveur compromis d'imposer des paramètres affaiblis.
- Paramètres stockés par utilisateur (`kdf_params` JSON avec `alg`, `ops`, `mem`, `salt`) : ils peuvent évoluer sans casser les comptes existants. Ils sont réévalués à chaque changement de mot de passe.

## 5. Flux
1. **Installation / création de compte** : le client génère sel, userKey, paire X25519 et clé de récupération. Pour le premier admin, il génère aussi la vaultKey v1. Il envoie au serveur `authKey` et les enveloppes, jamais de clé en clair.
2. **Connexion** : le client demande les paramètres KDF de l'email. Pour un email inconnu, le serveur renvoie un sel factice déterministe (HMAC), pour ne pas révéler l'existence du compte. Le client envoie `authKey`, puis l'OTP sur un nouvel appareil. Il déchiffre ensuite localement userKey, la clé privée et la vaultKey.
3. **Invitation d'un admin** : l'invité crée ses clés. L'invitant vérifie hors bande l'**empreinte** de la clé publique de l'invité (lue à voix haute ou par téléphone), puis scelle la vaultKey pour cette clé. À sa première ouverture, l'invité ré-enveloppe la vaultKey avec sa userKey (accès confirmé) et l'enveloppe scellée est supprimée.
4. **Changement de mot de passe** : nouveau sel, nouvelle `authKey`, nouvelle enveloppe de userKey. Rien d'autre n'est re-chiffré.
5. **Récupération** : la clé de récupération (affichée une seule fois, 256 bits, groupes base32 + somme de contrôle) déchiffre userKey. L'utilisateur choisit un nouveau mot de passe (flux 4). Le serveur ne stocke qu'une empreinte et un vérificateur haché.
6. **Rotation de la vaultKey** (ex. après révocation d'un admin) : nouvelle vaultKey v+1, toutes les entrées re-chiffrées côté client, nouvelles enveloppes pour les admins restants. Les anciennes versions sont supprimées une fois la migration terminée.
7. **Verrouillage** : les clés n'existent qu'en mémoire JS. Le verrouillage (manuel, inactivité, fermeture) les efface (`memzero`). Rien n'est écrit dans localStorage, sessionStorage, IndexedDB ou le cache.

## 6. Modèle de menace

| Menace | Couverte ? | Mesure |
|---|---|---|
| Vol / fuite de la base ou des sauvegardes | ✅ | Le serveur ne détient que des ciphertexts. Il faut attaquer Argon2id sur chaque mot de passe. |
| Administrateur de l'hébergement curieux | ✅ | Même raison |
| Interception réseau | ✅ | TLS 1.2+ et HSTS, plus le chiffrement de bout en bout |
| Vol du cookie de session | ⚠️ partiel | Le cookie seul ne permet pas de déchiffrer. Le cookie est HttpOnly et SameSite, avec révocation |
| Vol du mot de passe seul, depuis un nouvel appareil | ✅ | OTP vers l'email déjà vérifié et approbation de l'appareil |
| Ciphertext altéré ou déplacé | ✅ | Tag Poly1305 et AD contextuelles |
| Serveur imposant une KDF faible | ✅ | Plancher validé côté client |
| Serveur substituant une clé publique à l'invitation | ✅ | Vérification hors bande de l'empreinte |
| Serveur compromis servant un JavaScript malveillant | ❌ | Limite connue de tout coffre web. Mesures : CSP stricte, SRI, intégrité du déploiement, audit |
| Terminal compromis ou laissé déverrouillé | ❌ | Hors périmètre. Verrouillage automatique pour limiter le risque |
| Perte du mot de passe **et** de la clé de récupération | ❌ | Données irrécupérables (assumé, documenté dans l'interface) |
| Admin révoqué ayant déjà lu les données | ❌ | Tout ce qu'il a vu est compromis. La rotation protège seulement les données futures. |

## 7. Limites assumées
- JavaScript ne permet pas d'effacer de façon garantie toutes les copies en mémoire (chaînes immuables). On efface les tampons binaires.
- La recherche se fait sur les données déchiffrées en mémoire : tout le coffre est déchiffré à l'ouverture (adapté à quelques milliers d'entrées).
- Les métadonnées non chiffrées sont limitées à : UUID, identifiant de catégorie (le nom de la catégorie est chiffré), favori, dates (création, modification, corbeille), version de clé, taille chiffrée des pièces jointes. Le type d'entrée, le titre et tous les champs sont dans le payload chiffré.
