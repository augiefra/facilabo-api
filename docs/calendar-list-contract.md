# Projection catalogue multi-client

## Endpoint

`GET /api/v1/calendars/list` conserve les champs historiques de chaque entree :

- `slug`
- `name`
- `description` lorsqu'elle existe

La version 2 ajoute une projection editoriale et une version de schema :

```json
{
  "calendars": [
    {
      "slug": "astronomie",
      "name": "Astronomie",
      "description": "Phases lunaires, eclipses, meteores et evenements astronomiques",
      "catalog": {
        "discoverable": true,
        "family": "sciences",
        "category": "astronomy"
      }
    }
  ],
  "meta": {
    "catalogSchemaVersion": 2
  }
}
```

`catalog` doit rester optionnel dans les decodeurs clients pour assurer la compatibilite avec
une ancienne reponse mise en cache. Cette version de l'API le fournit toutefois pour chaque
entree servie.

## Semantique

- `discoverable=true` : le feed est present dans le catalogue produit iOS de reference.
- `discoverable=false` : le slug reste servi pour compatibilite, mais ne doit pas etre affiche
  dans un nouveau catalogue client.
- `family` appartient a la taxonomie partagee : `sports`, `administratif`, `conges`, `pays`,
  `religion`, `shopping`, `sorties`, `reperes`, `nature`, `sciences`.
- `category`, lorsqu'elle existe, reprend une valeur brute de `CategoryType` iOS.
- `sorties-rencontres-arles` reste `discoverable=true`, `family=sorties`, `category=culture` :
  c'est un festival culturel public deja livre. Son passage par l'adaptateur dynamique
  `/api/v1/local-events/ics/rencontres-arles` ne le rattache pas au gel produit de la categorie
  locale 2.0 et ne change ni son slug ni ses routes publiques.

La projection controlee est dans `data/calendar-catalog.json`. Elle ne contient ni URL ICS,
ni information Premium, ni ordre de tri, ni couleur. Les slugs et les champs historiques
continuent de provenir exclusivement de `lib/calendar-mappings.ts`.

Dans l'etat post-A du 2026-08-30, la liste contient exactement 258 entrees : 205 decouvrables et
53 entrees servies mais non decouvrables. Les cinq slugs `worldcup-2026-*` termines restent
servables sur les routes ICS et metadata pour les abonnements existants.

## Contrat shadow CaCORE v1

`data/cacore-contract.v1.json` est le contrat canonique shadow. Il verrouille, dans l'ordre public :

- les 258 slugs et leur position ;
- les routes ICS v1, metadata v1 et la route de livraison effective (ICS externe, ICS auto-heberge,
  adapter legacy ou `local-events` v1) ;
- le vecteur complet de discovery, dont les 205 entrees visibles ;
- les UUID, `idSeed`, graines d'identite et ordres iOS lorsqu'un feed existe dans le runtime ;
- les alias de route et les alias d'edition dans deux espaces distincts ;
- les trois formes de deep link reellement implementees par iOS ;
- l'etat editorial et le scope de release issus du Guardian post-A.

Le contrat n'est importe par aucun handler : le Lot B ne change donc pas le runtime. Sa projection
API est `data/cacore-api-shadow.v1.json`; `data/cacore-contract.v1.lock.json` verrouille les SHA-256
de la serialisation canonique et des trois projections.

Regeneration reproductible, uniquement depuis les checkouts canoniques valides : le test iOS
`CaCOREContractSnapshotTests` derive les UUID depuis `idSeed ?? icsURL`, valide le runtime contre
la projection versionnee et ecrit le snapshot effectif sous
`/tmp/facilabo-cacore-ios-effective.v1.json`. Ce fichier temporaire alimente ensuite :

```bash
/opt/homebrew/opt/node@22/bin/node scripts/generate-cacore-contract.mjs \
  --ios-snapshot /tmp/facilabo-cacore-ios-effective.v1.json \
  --guardian-registry /chemin/FacilAbo/config/calendar-health-registry.json \
  --output-dir /tmp/cacore-generated
```

Les fichiers generes sont serialises en JSON avec cles triees, indentation de deux espaces, UTF-8
et newline finale. Ils ne sont recopies dans les repos qu'apres validation des cardinalites
258/211/205 et de la parite exacte d'ordre API/Guardian.

## Notices multi-plateformes

Les objets de `GET /api/v1/updates/notices` acceptent le champ optionnel suivant :

```json
{
  "platforms": ["ios", "android"]
}
```

Valeurs autorisees : `ios`, `android`. Si le champ est absent, la notice concerne les deux
plateformes. Les notices existantes restent donc compatibles sans modification de donnees.

## Validation

Depuis la racine de l'API :

```bash
npm run check
```

Le check verifie notamment l'unicite des slugs, la conservation exacte des champs historiques,
la taxonomie, la presence d'une projection pour chaque mapping et l'existence de tous les slugs
marques comme decouvrables. Il compare aussi la liste retournee par le handler avec les slugs de
`getAllMappings()` sans renommage et verifie qu'un futur mapping sans projection fait echouer le
build de la reponse.

`npm run check:cacore` verifie en plus le contrat shadow, les SHA, toutes les routes, la separation
des alias et la servabilite ICS+metadata des cinq calendriers World Cup non decouvrables.
