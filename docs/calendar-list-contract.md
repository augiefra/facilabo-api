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

La projection controlee est dans `data/calendar-catalog.json`. Elle ne contient ni URL ICS,
ni information Premium, ni ordre de tri, ni couleur. Les slugs et les champs historiques
continuent de provenir exclusivement de `lib/calendar-mappings.ts`.

Au moment de l'introduction du schema 2, la liste contient 257 entrees : 209 decouvrables et
48 entrees techniques ou legacy non decouvrables.

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
