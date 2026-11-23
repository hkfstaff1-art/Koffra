# KOFFRA — Tests et critères de recette

## Fonctionnel
- Installation et initialisation du premier compte sans inscription publique.
- Connexion, OTP correct/incorrect/expiré/réutilisé et limitation des tentatives.
- Invitation d'un compte administrateur supplémentaire, révocation et journalisation.
- CRUD des entrées, catégories, contacts et pièces jointes.
- Recherche, favoris, archivage, corbeille et restauration.
- Générateur de mots de passe, copie et effacement du presse-papiers si supporté.
- Export chiffré et restauration sur un environnement propre.
- Gestion des appareils, déconnexion et révocation distante.

## Sécurité obligatoire
- Vérifier dans la base et les logs qu'aucun secret n'apparaît en clair.
- Un ciphertext modifié doit échouer à l'authentification GCM.
- Nonces uniques ; tests de version et rotation de clés.
- Tests IDOR entre comptes, CSRF, XSS, injection, upload et rate limiting.
- Vérifier qu'un nouvel appareil ne peut pas s'auto-approuver.
- Vérifier l'absence de secrets dans localStorage, caches, analytics et erreurs.

## UX et compatibilité
- Tests responsive téléphone/desktop, navigation clavier et contrastes.
- Vérifier verrouillage après inactivité et reprise de session.
- Tests sur navigateurs mobiles récents et Chrome/Firefox/Edge desktop.

## Livraison attendue
- Code fonctionnel dans le mono-repo.
- Migrations, seeders de démonstration sans secrets réels.
- `.env.example`, README d'installation et déploiement.
- Documentation OpenAPI, diagramme d'architecture, tests automatisés et rapport de recette.
- Aucune fonctionnalité critique simulée ou laissée en TODO sans le signaler.
