# Escape Pornic

Jeu de piste mobile géolocalisé basé sur React, TypeScript, Vite, Leaflet et Supabase. L’application propose des parcours par partie, des équipes et une console d’administration.

## Démarrage

```bash
npm install
npm run dev
npm run dev:https
npm run build
```

La géolocalisation et les fonctions mobiles nécessitent HTTPS sur un téléphone. `npm run dev:https` démarre un serveur local avec un certificat auto-signé.

## Connexion Supabase

Les parties et équipes partagées nécessitent un projet Supabase :

1. Créez un projet Supabase et activez l’authentification anonyme dans **Authentication → Providers**.
2. Exécutez [`supabase/migrations/20261101000000_game_teams.sql`](./supabase/migrations/20261101000000_game_teams.sql) dans l’éditeur SQL du projet.
3. Exécutez [`supabase/migrations/20261102000000_realtime_teams.sql`](./supabase/migrations/20261102000000_realtime_teams.sql) pour activer les mises à jour en direct de la liste des équipes.
4. Exécutez [`supabase/migrations/20261103000000_team_locations.sql`](./supabase/migrations/20261103000000_team_locations.sql) si vous configurez le projet depuis zéro.
5. Exécutez [`supabase/migrations/20261104000000_player_locations.sql`](./supabase/migrations/20261104000000_player_locations.sql) pour activer les noms et positions individuelles des joueurs. Si les migrations précédentes ont déjà été exécutées, exécutez uniquement cette nouvelle migration.
6. Exécutez [`supabase/migrations/20261105000000_admin_console.sql`](./supabase/migrations/20261105000000_admin_console.sql) pour activer la console, les parcours par partie, les objets bonus/malus et les communications. Sur un projet où les migrations précédentes ont déjà été exécutées, lancez uniquement cette dernière migration.
7. Dans **Authentication → Providers**, activez aussi l’authentification par e-mail/mot de passe. Créez le compte admin depuis **Authentication → Users**, puis accordez-lui le rôle admin dans l’éditeur SQL en remplaçant son adresse :

   ```sql
   insert into public.admin_users (user_id)
   select id from auth.users
   where lower(email) = lower('admin@example.com')
   on conflict (user_id) do nothing;
   ```

8. Copiez `.env.example` en `.env.local`, puis renseignez l’URL du projet et sa clé publique (publishable/anon).
9. Redémarrez Vite. Les clés `VITE_` sont intégrées au client : n’y mettez jamais de clé `service_role`.

### Déploiement GitHub Pages et migrations Supabase

- Le workflow [Deploy GitHub Pages](./.github/workflows/deploy-pages.yml) construit et publie le site à chaque push sur `main`. Dans **Settings → Pages**, sélectionnez **GitHub Actions** comme source de publication.
- Dans **Settings → Secrets and variables → Actions → Variables**, ajoutez `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`. La clé anon/publishable est visible par les visiteurs dans l’application ; les politiques RLS doivent protéger les données. N’ajoutez jamais de clé `service_role`.
- Le workflow [Apply Supabase migrations](./.github/workflows/supabase-migrations.yml) est manuel au départ afin qu’un premier push du dépôt ne modifie pas une base dont l’historique est inconnu. Ajoutez `SUPABASE_PROJECT_ID` comme variable et `SUPABASE_ACCESS_TOKEN` ainsi que `SUPABASE_DB_PASSWORD` comme secrets Actions.
- Si des migrations ont été exécutées manuellement dans l’éditeur SQL, elles ne figurent pas forcément dans l’historique Supabase. Avant de lancer le workflow, vérifiez l’état de la base et réconciliez l’historique en marquant comme appliquées **uniquement** les versions déjà exécutées, par exemple avec `supabase migration repair --status applied <timestamp>`. Ne marquez pas une migration non appliquée : elle ne serait alors jamais exécutée. Une fois l’historique réconcilié, le workflow peut être automatisé pour les migrations suivantes.
- Pour un site de projet (`https://<compte>.github.io/<nom-du-repo>/`), le workflow règle automatiquement la base Vite sur le nom du dépôt. Le fichier `404.html` est généré pour que les routes comme `/admin` fonctionnent avec GitHub Pages. Pour un domaine personnalisé, il faudra adapter `VITE_BASE`.
- Après publication, ajoutez l’URL GitHub Pages dans les URL autorisées du projet Supabase (**Authentication → URL Configuration**). Le GPS nécessite HTTPS, fourni par GitHub Pages.

Les appels de création et de jonction passent par des fonctions SQL transactionnelles. Les tables ont la RLS activée et les codes d’équipe ne sont pas lisibles directement depuis le navigateur.

Sans configuration Supabase, l’application signale que le mode équipe n’est pas disponible et permet de continuer explicitement en mode solo.

## État de la première étape

- Créer les parties uniquement depuis la console admin et copier le parcours courant dans chaque nouvelle partie.
- Créer une équipe supplémentaire avec le code de partie.
- Rejoindre une équipe existante avec son code d’équipe.
- Retrouver son équipe après rechargement et partager les codes depuis l’application.
- Voir les autres équipes de la partie et leurs arrivées en direct.
- Choisir un nom de joueur et afficher un marqueur individuel, coloré selon son équipe.
- Partager sa position GPS avec les autres joueurs (option facultative, désactivée par défaut).

Chaque navigateur/appareil connecté à un compte anonyme distinct représente un joueur. Le marqueur individuel n’est diffusé que si ce joueur active le partage dans le panneau d’équipe. La dernière position est actualisée périodiquement, aucun historique n’est stocké et le marqueur disparaît s’il n’a pas été actualisé depuis 90 secondes. Désactiver le partage efface la position enregistrée.

## Console d’administration

La console est accessible par l’URL `/admin` et ne comporte aucun bouton dans l’interface de jeu. L’accès est authentifié par Supabase et le rôle admin est contrôlé côté base ; l’URL seule ne donne aucun droit. La session admin utilise un stockage séparé de la session joueur sur le même navigateur.

La console permet de créer une partie (en copiant les POI affichés dans l’éditeur), de sélectionner un parcours pour le modifier, de consulter les équipes et joueurs, d’attribuer ou retirer des objets bonus/malus, et d’envoyer un message à toute la partie ou à une équipe. Les communications sont conservées et chaque joueur doit les acquitter ; les bonus/malus attribués sont affichés dans son panneau d’équipe.

L’application inclut un repli `404.html` adapté à GitHub Pages pour servir l’application SPA sur `/admin`.

Les POI de démonstration existants sont toujours à Nantes : remplacez-les par le parcours de Pornic via l’administration avant une partie réelle.

## Parcours et mode hors ligne

- Les POI sont modifiables et importables/exportables en JSON depuis l’administration.
- La carte Leaflet/OpenStreetMap, le suivi GPS, le radar et les écrans d’énigmes restent réutilisés.
- Le service worker met en cache les ressources de l’application et les tuiles consultées.
- Le mode simulation du journal permet de tester les POI sans se déplacer.
- Les fichiers audio des POI se placent dans `public/audio/` et sont renseignés dans le champ **Son** de l’administration.

Pour publier l’application, construisez le dossier statique avec `npm run build`, puis déployez le contenu de `dist/` sur un hébergement HTTPS. Configurez la base Vite (`VITE_BASE`) si le site est servi depuis un sous-dossier. HTTPS est nécessaire aux fonctions GPS, boussole et caméra sur téléphone.
