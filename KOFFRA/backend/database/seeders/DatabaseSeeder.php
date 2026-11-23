<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * KOFFRA ne crée aucun compte ni aucune donnée par seeder : les clés sont générées
 * dans le navigateur (chiffrement de bout en bout), un seeder serveur ne peut donc pas
 * produire de compte utilisable sans manipuler de secrets.
 *
 * Premier propriétaire : `php artisan koffra:install` puis le lien d'initialisation affiché.
 * Données de démonstration : à saisir depuis l'interface sur un environnement de test.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->command?->info('Aucune donnée à initialiser. Utilisez « php artisan koffra:install ».');
    }
}
