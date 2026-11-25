# MMO GuildOps — M1a (prototype)

Jeu navigateur pour le laboratoire d'hébergement INFAL105. Ce spike ne constitue pas une livraison de classe.

## Lancer
Node.js 22. Aucune dépendance npm.
```sh
npm test
npm start
```
Ouvrir http://localhost:8080. Créer un aventurier, rejoindre le maître de guilde (flèches / ZQSD), accepter la quête, lui parler à nouveau et consulter l'inventaire. Recharger la page pour retrouver la session tant que le serveur tourne.

## Organisation
- src/domain.mjs : règles métier et état volatile.
- src/server.mjs : adaptateur HTTP, validation et fichiers statiques.
- public/ : rendu Canvas isométrique provisoire.
- tests/ : tests Node sans dépendance.

Contrat de conception : https://github.com/sebastien-ribiere/mmo-GuildOps-formateur/pull/1 (proposé, en revue).

Limites : état en mémoire, un seul processus, pas de PostgreSQL ni de vraie persistance après redémarrage ; aucun multijoueur temps réel. Position locale non vérifiée serveur. Jeton anonyme de laboratoire, pas d'authentification de production. Aucun test de charge, de déploiement ou de navigateur déclaré exécuté. Assets temporaires originaux dessinés par code. Ne pas exposer sur Internet en l'état.
