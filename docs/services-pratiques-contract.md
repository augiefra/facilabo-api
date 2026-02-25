# Contrat API v1 - Services pratiques

Version de contrat: `2026-02-24.services-v1`

## Endpoints
- `GET /api/v1/services/pharmacies`
- `GET /api/v1/services/stations`
- `GET /api/v1/services/hospitals`
- `GET /api/v1/services/post-offices`

## Parametres de recherche
- `cp`: code postal sur 5 chiffres
- `city`: nom de ville
- `lat` + `lng`: coordonnees GPS
- `radius` (optionnel): rayon en km (defaut selon service)
- `limit` (optionnel): limite de resultats

Un endpoint accepte un seul mode de recherche par requete, priorite: `cp` > `city` > `lat/lng`.

## Reponse commune
Champs communs retournes par les 4 endpoints:
- `contractVersion`: version du contrat
- `total`: nombre de resultats retournes
- `query`: echo de la requete normalisee (`postalCode`, `city`, `lat`, `lng`, `radius`, `limit`)
- `limit`: limite appliquee
- `lastUpdated`: horodatage de generation
- `source`: source upstream
- `note` (optionnel): present en mode fallback cache stale

## Champs metier par endpoint
- `pharmacies`: liste de pharmacies + `gardeInfo`
- `stations`: liste de stations + `fuels` (prix/disponibilites) + `services` + `open24h`
- `hospitals`: liste d'hopitaux FINESS + categorie
- `postOffices`: liste de points La Poste + type de site

## Politique limite/pagination
- `pharmacies`: defaut 100, max 100
- `stations`: defaut 25, max 50
- `hospitals`: defaut 20, max 50
- `post-offices`: defaut 20, max 50

## Format d'erreur stable
Codes HTTP cibles: `400`, `429`, `500`, `502`

Payload d'erreur stable:
```json
{
  "error": "Bad Request",
  "message": "cp must be a 5-digit postal code",
  "retryable": false,
  "upstream": "public.opendatasoft.com",
  "contractVersion": "2026-02-24.services-v1"
}
```

- `retryable=true` quand l'erreur est potentiellement transitoire.
- `upstream` est present pour les erreurs de source externe.

## Fallback anti-panne
En cas de panne upstream, si une entree stale existe en cache memoire:
- status HTTP `200`
- `note` renseigne la degradation
- `source` suffixee `(cached)`

## Exemples curl
```bash
curl 'https://facilabo-api.vercel.app/api/v1/services/pharmacies?cp=75001'
curl 'https://facilabo-api.vercel.app/api/v1/services/stations?city=Paris&limit=20'
curl 'https://facilabo-api.vercel.app/api/v1/services/hospitals?lat=48.8566&lng=2.3522&radius=8'
curl 'https://facilabo-api.vercel.app/api/v1/services/post-offices?cp=13001'
```
