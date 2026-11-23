# KOFFRA — Sauvegarde, export et restauration

## Ce qu'il faut sauvegarder
| Élément | Contenu | Sensibilité |
|---|---|---|
| Base MySQL/MariaDB | Comptes (hachages, enveloppes chiffrées), coffre chiffré, journal | Chiffré de bout en bout, mais à protéger (métadonnées, emails) |
| `storage/app/private/attachments` | Pièces jointes chiffrées | Illisibles sans les clés des utilisateurs |
| `APP_KEY` (dans `.env`) | Clé de sessions, cookies et HMAC des codes | **Secrète.** À conserver séparément, hors ligne |
| Clés de récupération | Détenues par chaque administrateur | Hors ligne, jamais sur le serveur |

Sans mot de passe **ni** clé de récupération, un administrateur perd définitivement l'accès à ses clés. Si **tous** les administrateurs sont dans ce cas, le coffre est irrécupérable. C'est voulu : personne d'autre ne peut déchiffrer.

## Sauvegarde automatique (serveur)
`infra/scripts/backup.sh` produit, dans `BACKUP_DIR` (hors du dossier web) :
- `database.sql.gz` (mysqldump `--single-transaction`) ;
- `attachments.tar.gz` ;
- `SHA256SUMS`.

Les sauvegardes de plus de 30 jours (`KEEP_DAYS`) sont supprimées. Le mot de passe de la base est passé par un fichier temporaire et n'apparaît donc pas dans la liste des processus. Le script est planifié chaque jour (docs/11 § 6).

**Copie hors site** : téléchargez chaque semaine la dernière sauvegarde vers un support distinct (disque chiffré, autre hébergeur). Une sauvegarde qui reste sur le même serveur ne protège pas d'une perte du serveur.

## Restauration (procédure testée)
```bash
cd /chemin/sauvegarde/koffra-AAAAMMJJ-HHMMSS
sha256sum -c SHA256SUMS                                   # intégrité
gunzip -c database.sql.gz | mysql -u <user> -p <base_vide>
tar -xzf attachments.tar.gz -C /home/<compte>/koffra/storage/app
```
Ensuite :
1. Restaurer le `.env` avec **la même `APP_KEY`**.
2. Lancer `php artisan migrate --force && php artisan optimize`.
3. Contrôler la connexion d'un administrateur et l'ouverture d'une pièce jointe.

Test réalisé le 2026-11-23 (développement, MySQL 8.4) : sauvegarde produite, sommes de contrôle vérifiées, restauration dans une base vierge. On obtient les mêmes 19 tables et des données identiques (voir docs/13).

## Export chiffré (par un administrateur)
Paramètres → *Export et restauration chiffrés* :
- l'export exige une réauthentification ;
- le contenu du coffre est déchiffré **dans le navigateur**, puis re-chiffré avec une **phrase d'export** (Argon2id et XChaCha20-Poly1305) ;
- le fichier `.koffra.json` est lisible sans serveur, mais seulement avec cette phrase ;
- les **pièces jointes ne sont pas incluses** : elles sont couvertes par la sauvegarde serveur.

La restauration d'un export se fait dans n'importe quel coffre KOFFRA (Paramètres → *Restaurer dans ce coffre*). Les entrées reçoivent de nouveaux identifiants et sont chiffrées avec la clé active du coffre.

## Rotation des clés
- **Clé du coffre** : Paramètres → *Rotation*. Recommandée après la désactivation d'un administrateur. Toutes les entrées et catégories sont re-chiffrées, et l'activation est refusée tant qu'il reste une donnée sur l'ancienne clé.
- **Mot de passe** : Paramètres → *Changer de mot de passe*. Seule l'enveloppe de la clé de compte change, et les autres sessions sont fermées.
- **Clé de récupération** : Paramètres → *Nouvelle clé*. L'ancienne est révoquée.
- **`APP_KEY`** : ne pas la changer sans nécessité. Cela déconnecte tout le monde et invalide les codes en cours, mais les données du coffre restent intactes.
