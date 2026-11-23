# KOFFRA — Exigences de sécurité (bloquantes)

## Principe
Le serveur ne doit jamais recevoir ni conserver les secrets en clair. Chiffrement côté navigateur avant envoi. Utiliser une bibliothèque cryptographique maintenue et des primitives standards ; ne jamais inventer un algorithme.

## Chiffrement
- AES-256-GCM ou XChaCha20-Poly1305 via une bibliothèque fiable.
- Clé maître dérivée d'un secret utilisateur robuste avec Argon2id (paramètres calibrés sur appareils cibles) et sel aléatoire unique.
- Enveloppe de clés : clé de coffre aléatoire, chiffrée par une clé dérivée ; versionner les paramètres et permettre la rotation.
- Nonce/IV unique par chiffrement ; authentification des métadonnées critiques.
- TLS 1.2+ (TLS 1.3 recommandé) partout.
- Chiffrement des pièces jointes avant upload.
- Le serveur ne stocke que ciphertext, nonce, paramètres KDF, version et métadonnées strictement nécessaires.

## Authentification et OTP
- Mot de passe de compte vérifié côté serveur avec Argon2id/bcrypt ; distinct de la clé de déchiffrement du coffre.
- OTP à usage unique, durée courte (ex. 5 minutes), invalidation après usage, limites de tentatives et anti-rejeu.
- Le code OTP est envoyé uniquement à un canal préalablement vérifié. Ne pas révéler si un compte existe.
- Pour un nouveau compte administrateur, invitation par administrateur existant + vérification hors bande ; aucun auto-ajout.
- MFA par passkey/TOTP recommandé en complément du canal OTP. SMS seul n'est pas une protection suffisante contre le SIM swap.
- Limitation de débit, délai progressif et alertes sur connexions inhabituelles.

## Session et appareils
- Cookies HttpOnly, Secure, SameSite approprié ; rotation d'identifiant de session.
- Protection CSRF, CORS restrictif, CSP stricte, HSTS.
- Réauthentification pour export, affichage d'éléments critiques, ajout d'administrateur et changement de sécurité.
- Verrouillage après inactivité configurable ; révocation distante de session/appareil.

## Sauvegarde et récupération
- Export uniquement chiffré, avec avertissement et réauthentification.
- Clé de récupération générée localement, affichée une seule fois et conservée hors ligne par l'utilisateur.
- Ne jamais proposer de récupération serveur qui déchiffre les données sans secret de récupération.
- Tester restauration et rotation de clés.

## Sécurité applicative
- Validation serveur, autorisation sur chaque ressource, protection IDOR.
- Protection XSS, SQLi, CSRF, SSRF, upload malveillant et mass assignment.
- Secrets d'environnement hors Git ; `.env.example` sans vraies valeurs.
- Logs sans payloads, mots de passe, OTP, tokens, clés ou contenus de coffre.
- Dépendances auditées, mises à jour et scan SAST/DAST.
- Prévoir audit indépendant avant utilisation réelle.

## Limites produit
Ne pas présenter KOFFRA comme inviolable ou certifié. Une compromission du terminal déverrouillé peut exposer les données. Les données bancaires et Mobile Money doivent être limitées aux références non exploitables ; ne pas stocker PIN, CVV ou OTP bancaire.
