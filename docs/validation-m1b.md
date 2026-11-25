# Journal de validation — M1b (25/11/2026)

Machine : Linux 6.8, Node 22.22.1, Docker 29.9.3. Branche `feat/m1b-postgres`.
Ces résultats ont été obtenus par exécution ; ce qui n'est pas listé n'est pas validé.

| Preuve | Commande | Résultat |
|---|---|---|
| Tests unitaires + HTTP (volatile) | `npm test` | 3 pass, 1 skipped (PostgreSQL sans base) |
| Tests PostgreSQL 17 réel (2 instances, concurrence, idempotence, reconnexion) | `TEST_DATABASE_URL=… npm test` | 4 pass, 0 fail, 0 skipped |
| Compose : up/health | `docker compose up -d --build --wait` | app et db `healthy` |
| Compose : persistance | `node scripts/smoke-compose.mjs` | PASS : session, inventaire et replay conservés après recréation de l'API puis de la DB |
| Compose : down | `docker compose down` | conteneurs et réseau supprimés, volume conservé |
| Nettoyage | `docker compose down -v` | volume du projet de test supprimé (projet isolé `guildops-p0`, port 18080) |

## Non validé / limites
- Aucun test navigateur : le parcours est vérifié au niveau API, pas dans le Canvas.
- P0-04 (jeu de données déterministe + reset) : non traité.
- Une seule quête et un seul PNJ (M0 en prévoit trois) : décision à prendre côté formateur.
- Pas de sauvegarde/restauration qualifiée, pas de test de charge, pas de machine témoin tierce.
- CI GitHub non observée sur cette branche.
