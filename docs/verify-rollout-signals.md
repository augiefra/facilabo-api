# Signaux ops `/api/verify` pour les bascules iOS sensibles

Date: 2026-03-11
Statut: actif

## Objectif

Ajouter des signaux ops simples qui aident a distinguer:
1. un probleme introduit par une bascule iOS,
2. d'un probleme runtime/backend deja present.

Ce document ne cree aucune logique metier backend achat/quota/conges.

## Signal ajoute dans SP3-Lot2

Nom:
- `metadata-degradation-sample`

Surface:
- `GET /api/verify?module=metadata`

## Ce que le signal mesure

Le signal sonde un petit echantillon public et stable d'endpoints metadata:
1. `vacances-zone-a`
2. `feries-metropole`
3. `fiscal-france`
4. `sport-france-foot-equipe-nationale`

Pour chaque sonde, il observe:
1. requete OK ou non,
2. presence du bloc `runtime`,
3. `runtime.freshness`,
4. `runtime.degraded`,
5. `runtime.fallbackUsed`,
6. `meta.killSwitchActive` si present.

Le resultat retourne ensuite:
1. `PASS` si tout l'echantillon est `fresh`,
2. `WARN` si l'echantillon reste exploitable mais contient du `stale` / `fallbackUsed`,
3. `FAIL` si au moins une sonde est indisponible, sans contrat runtime, ou en `unavailable`.

## Pourquoi ce signal aide la bascule

Une future bascule iOS `SubscriptionState` ou lecture local-first peut faire apparaitre des ecarts de rendu ou de fraicheur.

Ce signal permet de qualifier rapidement:
1. si le runtime metadata backend est deja degrade,
2. si la bascule iOS risque seulement de reveler un probleme backend preexistant,
3. si un ecart observe doit etre attribue d'abord au runtime API plutot qu'au code iOS.

## Ce que le signal ne mesure pas

1. Ce n'est pas une vraie `fallback rate` historique dans le temps.
2. Ce n'est pas un SLA complet metadata.
3. Ce n'est pas un signal achat/quota/conges.
4. Ce n'est pas une mesure de correction fonctionnelle `Upcoming`.

Le signal est volontairement conservateur: il donne un instantane actionnable, pas une telemetrie longue duree.

## Lecture recommandee

Avant une bascule iOS sensible:
1. lancer `GET /api/verify?module=metadata`
2. verifier le resultat `metadata-degradation-sample`
3. si `WARN` ou `FAIL`, qualifier d'abord le runtime backend avant d'accuser la bascule iOS

## Rollback

1. revert du commit SP3-Lot2
2. redeploy Vercel

Effet:
1. suppression du signal additionnel
2. retour au contrat `api/verify` precedent, sans impact utilisateur final
