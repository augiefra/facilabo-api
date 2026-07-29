# FacilAbo API — règles de contribution

Ce dépôt est la source de vérité de l’API publique FacilAbo déployée sur Vercel.

## Git et publication

- Partir d’un `main` propre et synchronisé avec `origin/main`.
- Travailler sur une branche locale `codex/api-*`; ne jamais réécrire l’historique de `main`.
- Avant chaque lot, vérifier `git status -sb`, HEAD, upstream, remotes et diff.
- Préserver les changements locaux existants. Aucun reset, clean, commit, push ou déploiement implicite.
- Commit, push et déploiement sont trois autorisations indépendantes.

## Vercel

- Dans Codex, toutes les opérations Vercel distantes passent exclusivement par le plugin Vercel officiel : projet, déploiements, build logs, runtime logs, erreurs et déploiement autorisé.
- Ne jamais installer ou conserver `vercel` dans `dependencies`, `devDependencies`, `package-lock.json` ou `node_modules` pour les opérations distantes.
- Les handlers utilisent le contrat structurel minimal `lib/vercel-http.ts`; ne pas réintroduire `@vercel/node` uniquement pour ses types effacés à la compilation.
- Ne jamais utiliser `vercel deploy`, `vercel inspect`, `vercel logs`, `vercel whoami` ou leurs équivalents `npx` pour piloter le projet distant depuis Codex.
- `npm run dev:local` est l’unique exception : il lance une CLI Vercel éphémère avec `vercel dev --local`, sans lier ni piloter un projet distant. Garder `scripts.dev` absent afin d’éviter l’auto-invocation récursive de `vercel dev`. Ce script n’autorise ni publication ni mutation distante.
- Après un déploiement autorisé, vérifier avec le plugin : statut `READY`, SHA attendu, alias de production, erreurs runtime, puis endpoints publics.

## Runtime et validations

- Runtime canonique : Node `22.x`.
- Installation déterministe : `npm ci`.
- Gate local : `npm run check`.
- Gate sécurité production : `npm audit --omit=dev --audit-level=high`.
- Gate sécurité complet : `npm audit --audit-level=low`.
- Le workflow `.github/workflows/api-ci.yml` doit garder ces gates sur les PR, `main` et son audit hebdomadaire.
- Le test `scripts/check-tooling-contract.mjs` doit rester vert : il interdit le retour d’une CLI Vercel locale et vérifie le contrat Node/CI.

## Contrats publics

- Préserver les routes `/api/v1`, slugs, metadata, notices, schémas JSON, UIDs et comportements de fallback existants.
- Un changement de source ou de route exige des tests ciblés, les contrats clients, puis une vérification production après déploiement explicitement autorisé.
- Ne jamais publier automatiquement une notice in-app ou un déploiement depuis Guardian.
