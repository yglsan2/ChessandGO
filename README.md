# Chess and Go (Social Board)

Application web pour jouer aux **échecs** et au **Go** : partie locale, duel via lien, salles courtes, et Discord Activity.

Modules séparés :

- Hub : `/`
- Go : `/go/`
- Échecs : `/chess/`
- Discord : `/discord/`

## Prérequis

- Node.js 18 ou plus récent
- Navigateur moderne (Chrome, Firefox, Edge, Safari)

## Lancer en local

```bash
npm start
```

Puis ouvrez :

- Ensemble : http://localhost:8765
- Go : http://localhost:8765/go/
- Échecs : http://localhost:8765/chess/
- Santé API : http://localhost:8765/api/health

Sous Windows, vous pouvez aussi lancer `start.bat`.

Configuration optionnelle : copiez `.env.example` vers `.env` et renseignez les valeurs.

## Fonctionnalités

### Go

- Goban 9 / 13 / 19, handicap, komi, règles japonaises / chinoises / NZ
- Modes de pose : 1 clic, anti-glisse (misclic), confirmation en 2 clics
- Horloges (byo-yomi et presets), passe, comptage, abandon
- Sons de pierre (timbres Nuances / Franc) et son de misclic
- Teaching / review, export SGF, analyse locale, option KataGo si un serveur est branché
- Rengo (équipes)

### Échecs

- Plateau tactile, horloges, anti-misclick
- Teaching / thèmes, sync en ligne

### Multijoueur

- Lien peer-to-peer (PeerJS)
- Codes de salle courts via l’API Node (`/api/rooms`)
- Automatch Discord entre deux joueurs dans la même Activity

## Discord Activity

1. Créez une application sur le [portail développeur Discord](https://discord.com/developers/applications)
2. Renseignez `DISCORD_CLIENT_ID` et `DISCORD_CLIENT_SECRET` dans `.env`
3. Exposez le serveur en **HTTPS** (tunnel `cloudflared`, Render, Railway, VPS…)
4. Mappez l’URL dans **URL Mappings** de l’application Discord
5. Lancez l’Activity dans un salon vocal (`/discord/`)

Test sans compte Discord : http://localhost:8765/discord/test.html

## Déploiement

### Statique (GitHub Pages / Netlify)

Convient pour la démo et le P2P PeerJS. Les salles courtes (`?room=`) nécessitent le serveur Node.

### Serveur Node

```bash
npm start
```

Variables utiles (voir `.env.example`) : Discord, Telegram, Facebook, PeerJS, `ICE_SERVERS_JSON` (TURN recommandé derrière certains NAT / Discord).

Endpoints principaux :

- `GET /api/health`
- `GET /api/config`
- `POST /api/rooms` / `GET /api/rooms/:code`
- `POST /api/discord/token`

## Connexion

- Pseudo local immédiat
- Facebook / Discord / Telegram : identité réelle si l’app tourne dans la plateforme et que les IDs sont configurés

## Confidentialité

Voir [privacy.html](privacy.html).

## Sons (crédits)

Les enregistrements de pose de pierre et certains effets proviennent d’Online-Go.com (pack Original 2013 / effets), avec autorisation de réutilisation pour les clics pierre. Détails dans `sounds/CREDITS.txt`.

## Tests

```bash
npm test
```

## Licence du dépôt

Code du projet : selon les termes choisis par le mainteneur du dépôt GitHub.
Les assets tiers (Discord SDK, sons, etc.) conservent leurs licences respectives.
