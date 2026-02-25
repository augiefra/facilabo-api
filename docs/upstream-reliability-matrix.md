# Matrice de fiabilite upstream - Services pratiques

## Cibles operationnelles

| Source | Service(s) | Latence cible p95 | TTL cache | Seuil WARN | Seuil FAIL | Degradation |
|---|---|---:|---:|---|---|---|
| FINESS (OpenDataSoft) | Pharmacies, Hopitaux | < 2500 ms | 24 h | > 2500 ms ou payload vide sur zone dense | HTTP non-200 / timeout | fallback stale cache + `note` |
| Prix carburants (data.economie.gouv.fr) | Stations-service | < 2000 ms | 30 min | > 2000 ms ou prix partiels | HTTP non-200 / timeout | fallback stale cache + `note` |
| DataNova La Poste (DataFair) | Bureaux/agences/relais | < 3000 ms | 12 h | > 3000 ms ou reponse partielle | HTTP non-200 / timeout | fallback stale cache + `note` |

## Regles de degradation
1. Si la source repond en erreur, tenter lecture stale cache clef-equivalente.
2. Si stale dispo: retourner `200` degrade avec `note`.
3. Si stale indisponible: retourner erreur standardisee (`502` ou `429`).
4. Ne jamais casser le schema de reponse publique.

## Sondes conseillees dans `/api/verify`
- Nominal: cp, city, geo sur chaque service.
- Coherence: `total > 0` sur zones denses (Paris/Lyon/Marseille).
- Latence: marquer WARN au-dela du seuil cible.
- Schema: presence `contractVersion`, `query`, `source`, `lastUpdated`.
