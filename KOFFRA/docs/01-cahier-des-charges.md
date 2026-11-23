# KOFFRA — Cahier des charges fonctionnel

## 1. Présentation
KOFFRA est un coffre-fort numérique privé destiné à centraliser les informations confidentielles d'une organisation ou de son propriétaire : identifiants, mots de passe, contacts professionnels, accès techniques, clés API, notes privées et références documentaires.

Le produit est une application web responsive, installable comme PWA. Elle doit être utilisable sur ordinateur et téléphone. Une application Android native pourra être envisagée ultérieurement, sans être nécessaire au premier lot.

## 2. Utilisateurs et accès
- Aucun libre-enregistrement public.
- Un compte propriétaire initial, créé lors de l'installation par une procédure sécurisée.
- Possibilité d'ajouter un petit nombre de comptes administrateurs de secours (objectif initial : jusqu'à 5 personnes autorisées au total), uniquement sur invitation de l'administrateur existant.
- Aucun rôle collaborateur standard dans le périmètre initial. Les comptes autorisés ont des privilèges administratifs complets : cette décision doit être clairement signalée dans l'interface.
- Chaque connexion exige une authentification forte. Un nouvel appareil ou une nouvelle adresse de contact déclenche une vérification OTP vers un canal déjà enregistré. L'utilisateur qui tente de se connecter ne peut pas remplacer lui-même le canal de confiance.
- Révocation immédiate des sessions et appareils perdus.

## 3. Catégories de données
1. Comptes et mots de passe (service, URL, identifiant, secret, notes).
2. Emails et réseaux sociaux.
3. Accès professionnels et outils SaaS.
4. Clés API, tokens, certificats et configurations.
5. Contacts clients/fournisseurs (nom, entreprise, téléphone, email, notes).
6. Informations bancaires de référence non sensibles.
7. Documents et pièces jointes chiffrés.
8. Notes privées et informations personnalisées.

**Limite de sécurité :** ne pas stocker les codes PIN Mobile Money, CVV, codes de validation bancaire à usage unique, mots de passe de paiement ou secrets dont la conservation est interdite par le prestataire. Pour les cartes, privilégier les quatre derniers chiffres et les références non exploitables.

## 4. Fonctionnalités
- Tableau de bord : nombre d'éléments, catégories, éléments récemment modifiés et alertes de sécurité.
- CRUD complet des entrées, catégories et contacts.
- Champs personnalisables et pièces jointes.
- Recherche côté client après déchiffrement local ; filtres par catégorie, favoris et date.
- Affichage/masquage d'un secret avec confirmation ou réauthentification pour les éléments critiques.
- Copie dans le presse-papiers avec effacement automatique lorsque possible.
- Générateur de mots de passe configurable.
- Favoris, archivage et corbeille avec restauration contrôlée.
- Journal d'activité : connexions, appareils, ajouts, modifications, suppressions, exports et changements de sécurité. Ne jamais journaliser les valeurs secrètes.
- Export chiffré et sauvegarde/restauration documentés.
- Gestion des appareils et sessions.
- Verrouillage automatique après inactivité, verrouillage manuel et déconnexion globale.
- Mode récupération documenté avec clé de récupération hors ligne.

## 5. Écrans
1. Connexion / vérification OTP.
2. Initialisation sécurisée du premier propriétaire.
3. Tableau de bord.
4. Coffre / liste et recherche.
5. Détail d'une entrée.
6. Formulaire ajout/modification.
7. Catégories et contacts.
8. Générateur de mots de passe.
9. Appareils et sessions.
10. Comptes administrateurs autorisés.
11. Journal d'activité.
12. Sauvegarde, export et récupération.
13. Paramètres et sécurité.

## 6. Exigences non fonctionnelles
- Interface française au lancement, responsive et accessible clavier.
- Temps de chargement raisonnable sur connexion mobile.
- Pagination côté serveur des métadonnées.
- Validation stricte des entrées et gestion d'erreurs compréhensible.
- Tests automatisés frontend/backend et tests de sécurité avant mise en production.
- Sauvegardes régulières de la base et des pièces jointes chiffrées, avec tests de restauration.
- Aucun secret dans les logs, analytics, URL, messages d'erreur ou outils de suivi.

## 7. Hors périmètre initial
Partage public de secrets, application Android native, synchronisation hors ligne complète, extension navigateur, SSO d'entreprise et intégrations tierces automatiques.
