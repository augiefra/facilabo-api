# Contrat runtime - degradation et kill switch (SP1-Lot2)

Version de contrat: `2026-03-11.runtime-v1`

Portee:
- `GET /api/v1/calendars/metadata/:slug`
- `GET /api/v1/sports/results/:sport`
- `GET /api/v1/sports/tv-schedule`
- `GET /api/v1/services/pharmacies`
- `GET /api/v1/services/stations`
- `GET /api/v1/services/hospitals`
- `GET /api/v1/services/post-offices`

## Ce qui est ajoute

Ajout purement additif d'un bloc top-level `runtime`:

```json
{
  "runtime": {
    "freshness": "fresh",
    "degraded": false,
    "fallbackUsed": false,
    "lastUpdated": "2026-03-11T09:00:00.000Z"
  }
}
```

Champs:
- `freshness`: `fresh` | `stale` | `unavailable`
- `degraded`: `true` si la reponse n'est pas `fresh`
- `fallbackUsed`: `true` si un stale cache a ete servi
- `lastUpdated`: horodatage ISO normalise de la donnee exposee

## Ce qui reste legacy

- les champs publics historiques restent inchanges
- `metadata` conserve `success`, `data`, `error`, `meta`
- `services` conservent `contractVersion`, `total`, `query`, `lastUpdated`, `source`, `note`
- `sports` conservent leur JSON direct existant (`competition`, `results` ou `matches`, `lastUpdated`, `source`)
- aucun path public ne change

## Regles de mapping runtime

1. `fresh`
   - donnee fraiche ou cache valide
   - `degraded=false`
   - `fallbackUsed=false`
2. `stale`
   - stale cache servi apres erreur upstream
   - `degraded=true`
   - `fallbackUsed=true`
3. `unavailable`
   - erreur sans fallback, ou metadata desactivee par kill switch
   - `degraded=true`
   - `fallbackUsed=false`

## Kill switch metadata

Variable d'environnement:
- `METADATA_KILL_SWITCH=1`

Effet:
- coupe la lecture metadata avant fetch/cache
- retourne `503`
- conserve le schema legacy d'erreur metadata (`success=false`, `error`, `meta`)
- ajoute `runtime.freshness=unavailable`
- ajoute `meta.killSwitchActive=true`

## Bascule legacy -> nouveau

- aucune bascule obligatoire cote iOS dans ce lot
- le bloc `runtime` est lisible de maniere optionnelle
- tant que les consumers iOS ne sont pas modifies, le comportement legacy reste la reference

## Preparation UpcomingSnapshot (SP2-Lot2)

- `UpcomingSnapshot` ne doit pas dependre de `metadata` pour sa correction fonctionnelle.
- `metadata` reste un enrichissement optionnel de contexte (`nextEvent`, `lastUpdated`, `eventCount`), pas une source canonique des items `Upcoming`.
- Le bloc `runtime` existant suffit pour qualifier `fresh`, `stale` ou `unavailable`.
- Le kill switch `METADATA_KILL_SWITCH` doit permettre de couper `metadata` sans rendre impossible la future projection locale stale-safe.
- Aucune extension de schema supplementaire n'est requise dans ce lot.

## Rollback exact

1. revert du commit `SP1-Lot2`
2. redeploy Vercel
3. verifier immediatement:
   - `curl -s https://facilabo-api.vercel.app/api/v1/calendars/metadata/vacances-zone-a`
   - `curl -s https://facilabo-api.vercel.app/api/v1/sports/results/football`
   - `curl -s 'https://facilabo-api.vercel.app/api/v1/services/pharmacies?cp=75001'`

## Garantie de compatibilite

Ce contrat est volontairement conservateur:
- aucun renommage
- aucun retrait
- aucune obligation de migration immediate cote app
- rollback trivial par revert + redeploy
