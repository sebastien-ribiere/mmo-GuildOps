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
- Une seule quête et un seul PNJ (M0 en prévoit trois) : décision à prendre côté formateur.
- Pas de sauvegarde/restauration qualifiée, pas de test de charge, pas de machine témoin tierce.
- CI GitHub non observée sur cette branche.

## P0-04 — jeu de données déterministe + reset (branche `feat/p0-04-seed-reset`)
| Preuve | Commande | Résultat |
|---|---|---|
| Tests avec PostgreSQL réel, 3 exécutions | `TEST_DATABASE_URL=… npm test` | 5 pass, 0 fail, 0 skipped à chaque fois |
| Tests sans base | `npm test` | 3 pass, 2 skipped |
| Reset déterministe | `seed.test.mjs` | état identique après jeu réel + joueur parasite + reset (comparaison complète des tables) |
| Garde-fou | `node src/seed.mjs` sans `--yes` | refus, exit 2 |
| Reset répété | `npm run reset` x2 | 3 joueurs de démo à chaque fois |
| Compose | `node scripts/smoke-compose.mjs` | PASS : reset via `compose exec`, jetons de démo valides, ancienne session en 401 |

Constat : `node --test` lance les fichiers en parallèle ; le test de reset échouait (5 joueurs au lieu de 3) car `postgres.test.mjs` écrit dans la même base. `npm test` utilise désormais `--test-concurrency=1`.

## P0-02 — preuve navigateur (branche `feat/p0-02-browser-e2e`)
Chrome headless piloté par playwright-core 1.65.1, contre la pile Compose (projet isolé `guildops-p0`, port 18080).

| Étape vérifiée dans le navigateur | Résultat |
|---|---|
| Création du joueur, quête « disponible », inventaire « Vide », bouton d'acceptation désactivé loin du PNJ | ok |
| Déplacement clavier jusqu'au maître de guilde | ok |
| Acceptation puis récompense : `badge-guilde × 1` | ok |
| Second « Parler » : message « déjà membre », toujours `× 1` | ok |
| Rechargement : « Session retrouvée », quête terminée, inventaire conservé | ok |
| API arrêtée : « Action non confirmée : Failed to fetch », inventaire inchangé (pas de succès fictif) | ok |
| API recréée (`--force-recreate`) puis rechargement : inventaire conservé | ok |
| Aucune erreur JS non interceptée | ok |

Résultat : `PASS: parcours navigateur + panne/reprise API`, 2 exécutions complètes consécutives sur pile neuve (la 1re a échoué à cause d'un défaut du test — la position n'est pas persistée donc le personnage revient au départ après rechargement — corrigé dans le test, pas dans le jeu). Captures : `docs/preuves-e2e/`.

Constats non corrigés : le nom du joueur et celui du PNJ se chevauchent à l'écran quand ils sont adjacents ; le message d'erreur réseau est le texte brut du navigateur (« Failed to fetch »). Le test n'est pas branché sur la CI GitHub (non observable ici). Seul Chrome a été essayé ; Firefox et mobile ne sont pas vérifiés.

## P0-09 — script de charge et sonde (branche `feat/p0-09-sonde-charge`)
Décision du formateur : côté client seulement, **sans `/metrics`**.

| Preuve | Résultat |
|---|---|
| `tests/tools.test.mjs`, 3 exécutions | 7 réussis, 0 échec à chaque fois ; `npm test` complet : 12 tests, 10 réussis, 2 ignorés (sans base) |
| Charge 2 × (1 000 parcours, C=20) sur Compose + PostgreSQL | 5 000 requêtes, 0 erreur, ~3 600 req/s |
| Recalcul indépendant (python) depuis le CSV | p50/p95/p99 identiques au JSON (aux arrondis près), 0 erreur dans les deux |
| Garde-fous | concurrence 200 refusée (exit 2) ; cible 1.1.1.1 refusée (exit 2) |
| Sonde pendant pannes (24 s, 1 s) | API arrêtée : 3 sondes en `ECONNREFUSED` ; base arrêtée : `healthz` 200, `readyz` 503, jeu 500 ; reprise visible pour les trois |
| Grille de TP05 régénérée (3 000 parcours, 2 répétitions, 1 à 200 clients, illimité puis 0,25 CPU) | même forme que `tp05-mesures-reference.csv` : plateau de débit, latences croissantes, p95 ≈ 80 ms dès C=10 à 0,25 CPU |

Constats : l'écart entre répétitions est plus faible que dans la campagne précédente (ex. C=10 : 2 372 contre 2 033 req/s, au lieu de 4 464 contre 2 248) ; une seule machine, donc aucune conclusion sur la variabilité en général. Ces valeurs diffèrent légèrement du CSV de référence : celui-ci doit être **remplacé** par une sortie du script versionné (changement de contenu côté formateur, à valider).

Non validé : sonde longue durée (>1 min) ; sonde et charge sur une autre machine ou Docker Desktop ; effet de la sonde sur la mesure ; CI GitHub.
