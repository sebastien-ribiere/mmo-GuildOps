# MMO GuildOps — M1b (persistance)

Jeu navigateur pour le laboratoire d'hébergement INFAL105. Contrat : https://github.com/sebastien-ribiere/mmo-GuildOps-formateur (main).

## Lancer avec Docker Compose
Préparer un mot de passe de labo (hexadécimal, sans caractères réservés URL). Ne pas committer .env.
```sh
cp .env.example .env
# Remplacer POSTGRES_PASSWORD dans .env
docker compose up -d --build --wait
```
Ouvrir http://localhost:8080. Créer un aventurier, rejoindre le maître de guilde (flèches / ZQSD), accepter la quête et parler. Recharger la page pour retrouver la session.
```sh
docker compose restart app
docker compose down
docker compose up -d
```
Le volume nommé est conservé par down (sans -v). Ne pas utiliser down -v si les données doivent être conservées. DB non publiée, app liée à localhost. Pour le labo uniquement, pas de production.

## Tests
```sh
npm install --ignore-scripts
npm test
# Tests PostgreSQL : TEST_DATABASE_URL vers une base de test dédiée.
# Smoke test destructif pour les conteneurs (pas le volume) : sur une pile de labo isolée uniquement.
node scripts/smoke-compose.mjs
```
Sans TEST_DATABASE_URL les tests PostgreSQL sont explicitement ignorés. Le prototype mémoire reste disponible via GUILDOPS_VOLATILE=1 npm start ; il ne sauvegarde rien.

## Organisation
src/domain.mjs : transitions métier partagées ; src/postgres.mjs : stockage transactionnel ; src/server.mjs : adaptateur HTTP ; migrations/ : schéma ; public/ : rendu Canvas provisoire.
Les jetons sont stockés sous forme de hash ; les actions sont sérialisées par verrou joueur et les résultats idempotents enregistrés dans la même transaction. Le schéma initial ne gère qu'une quête ; il évoluera avec la prochaine tranche de gameplay.

## Limites
Une quête seulement, position non contrôlée serveur, pas de multijoueur temps réel, pas d'authentification production, pas de sauvegarde/restauration qualifiée, pas de test navigateur ni de charge. Dépendance pg directement épinglée ; verrou transitif à ajouter. Images Docker par tags, digests à figer avant diffusion. La disponibilité ne peut pas être déduite de la présence des healthchecks. Litmus et chaos avancé facultatifs (P3).
