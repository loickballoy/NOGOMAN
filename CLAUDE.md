# Nogoman — règles pour les agents

Nogoman met en relation des agriculteurs et des ouvriers agricoles en Côte d'Ivoire : mission publiée,
embauche, paiement d'avance en séquestre, check-in GPS, libération jour par jour vers l'ouvrier moins la
commission. Utilisateurs sur Android d'entrée de gamme, 3G instable, interface en français.

- Spécification complète et découpage en lots : [`docs/PLAN.md`](docs/PLAN.md) (ne pas modifier : c'est
  la référence du mainteneur).
- Backlog : une épique GitHub par lot, une sous-issue par tâche. Le Lot 0 (fondations) précède les lots
  du plan.

## Règles permanentes

Elles s'appliquent à toutes les tâches. Si une issue semble les contredire, s'arrêter et le signaler.

1. **Argent en entiers.** Tous les montants sont des entiers en FCFA (XOF n'a pas de centimes). Jamais
   de `float` pour l'argent.
2. **Tout mouvement d'argent passe par `LedgerService`**, en écritures équilibrées. Ne jamais contourner
   le ledger, ne jamais supprimer ni modifier une ligne de ledger, ne jamais retirer le trigger SQL
   d'équilibre.
3. **Les commissions sont figées au financement.** Un changement de `FARMER_FEE_BPS` ou
   `WORKER_FEE_BPS` ne doit jamais modifier une mission déjà payée.
4. **Nogoman ne détient pas les fonds.** Les comptes du ledger reflètent l'argent logé chez le
   partenaire de paiement agréé. Aucun code ne doit supposer un compte bancaire Nogoman.
5. **Aucun code spécifique à un provider dans les services.** Tout passe par l'interface
   `PaymentProvider` ; un nouveau provider = un nouvel adaptateur dans `backend/src/payments/providers/`.
6. **Webhooks** : signature vérifiée avant tout traitement, rejet des événements de plus de 5 minutes,
   idempotence par `WebhookEvent` (identifiant unique). Un webhook reçu deux fois ne crédite jamais deux
   fois.
7. **Tâches planifiées sûres** : chaque `@Cron` doit pouvoir tourner avec plusieurs instances sans
   double exécution (verrou `pg_advisory_lock`).
8. **Vie privée** : ne jamais renvoyer le numéro d'un autre utilisateur ; coordonnées de ferme arrondies
   à ~1 km avant embauche ; OTP et tokens toujours hachés.
9. **Erreurs** : chaque erreur métier a un `code` stable en anglais (`RATE_TOO_LOW`) et un `message` en
   français simple, lisible à voix haute.
10. **Migrations Prisma additives uniquement.** Ne jamais modifier une migration existante.
11. **Secrets** : rien dans le dépôt. Toute nouvelle variable est ajoutée à `backend/.env.example` avec
    un commentaire.
12. **Tests** : chaque flux d'argent nouveau ou modifié a un test e2e dans `backend/test/`. Les tests
    n'appellent jamais un vrai provider.
13. **Avant de terminer une tâche** : `npm run typecheck`, `npm test`, `npm run test:e2e` et
    `npm run build` passent dans `backend/`, et le README est à jour.

### Ce qu'un agent ne doit jamais faire

- Brancher un provider de paiement réel en production sans que le contrat soit signé et les clés
  fournies par le mainteneur.
- Activer `ENABLE_DEV_ROUTES` ou `SMS_PROVIDER=console` en production.
- Modifier une migration déjà appliquée ou supprimer des données du ledger.
- Mettre des données personnelles réelles dans les seeds, les tests ou les logs (numéros fictifs
  uniquement).

## Convention de travail

- **Une sous-issue = une branche `issue-<n>-<slug>` = une PR vers `main`**, dont la description contient
  `Closes #<n>`. Lire l'issue en entier et vérifier que ses dépendances sont fermées avant de commencer.
- Les lots se traitent dans l'ordre. À l'intérieur d'un lot, les sous-issues sans dépendance entre elles
  avancent en parallèle : ne pas toucher au périmètre d'une autre sous-issue ouverte.
- **Tests d'abord, en deux temps dans la même PR :**
  1. un commit « tests (rouges) » écrit **à partir de l'issue et de la spécification**, pas du code. Les
     tests passent par l'API HTTP et les noms de variables d'env de la spécification. Ils compilent sur
     le code existant, **sauf** quand ils visent un module que l'issue demande de créer (pas d'API HTTP
     pour l'atteindre) : un échec de compilation sur ce seul import est alors un rouge accepté, à
     signaler dans la PR. Pousser, indiquer dans la PR quels tests échouent et pourquoi, puis
     **attendre la validation du mainteneur** ;
  2. l'implémentation, **sans modifier les tests validés**. Si un test validé se révèle faux, le corriger
     dans un commit séparé et le justifier dans la PR.
- Contrat d'API : codes HTTP et `code` d'erreur tels qu'écrits dans l'issue ou l'épique. Un nouveau code
  d'erreur est ajouté au README.
- Labels : `epic`, `lot:0` … `lot:8`. Le type de chaque issue (backend, frontend, infra, tests-first,
  règle permanente, bloqué-externe) est écrit en tête de son corps.

## Vérification

Base de test PostgreSQL 16, comme en CI (le nom de la base doit finir par `_test` : `global-setup` la
vide à chaque lancement) :

```bash
docker run -d --name nogoman-test-db -p 5433:5432 \
  -e POSTGRES_USER=nogoman -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=nogoman_test \
  postgres:16-alpine
```

Puis, dans `backend/` :

```bash
npm ci && npx prisma generate
npm run typecheck
npm test                 # unitaires (src/**/*.spec.ts)
npm run test:e2e         # e2e (test/*.e2e-spec.ts), TEST_DATABASE_URL par défaut :
                         # postgresql://nogoman@127.0.0.1:5433/nogoman_test
npm run build
```

Frontend (racine du dépôt) : seuls `npm run dev` et `npm run build` existent pour l'instant ; le
typecheck, les tests Playwright et la CI frontend arrivent avec le Lot 3.

## Helpers e2e

`backend/test/helpers.ts` (exemple d'usage : `backend/test/helpers.e2e-spec.ts`) :

```ts
const phone = phones('015');                     // 3 chiffres, un préfixe par fichier (n° d'issue)
const t = await bootApp({ FARMER_FEE_BPS: '0' }, { phones: phone });
const { farmer, worker } = await t.farmerAndWorker();
const job = await t.postJob(farmer, { payMode: 'TASK', rateXof: 25000 });
const { engagementId } = await t.hiredOn(job, worker); // sans worker : un nouvel ouvrier
await t.fundAndSettle(job);                      // financement + webhook mock signé
const task = await t.paidTask(farmer, worker, 10000); // solde de l'ouvrier crédité de task.netXof
await t.http().get('/me').set(auth(worker.token)).expect(200);
await t.close();
```

- `bootApp(env, { phones?, override? })` applique `env` par-dessus `test/env.ts`, démarre l'API puis
  restaure `process.env`. Plusieurs instances peuvent tourner en même temps sur la même base (chacune a
  sa boîte SMS et ses compteurs de limite par IP). `override` remplace un provider (ex. `GEOCODER`).
  `OTP_*_PER_IP_MINUTE` sont lus à chaque requête : les régler dans `test/env.ts`, pas dans `bootApp`.
- `login(app, phone)` (OTP via `ConsoleSmsProvider`), `auth(token)`, `phones(prefix)` : numéros fictifs
  `07<prefix><5 chiffres>`, préfixes `081` et `998` réservés à `flow.e2e-spec.ts`.
- Tous les fichiers e2e partagent la base : n'asserter que des états relatifs (solde de *cet*
  utilisateur, séquestre de *cette* mission), jamais des totaux globaux. `flow.e2e-spec.ts`, qui en
  fait, passe en premier (`test/sequencer.js`).

## Où trouver les choses (backend)

| Sujet | Fichier |
|---|---|
| Configuration (toutes les variables d'env, lues dans `process.env` à la construction) | `backend/src/config/app-config.ts`, `backend/src/config/core.module.ts` |
| Ledger : `LedgerService.post` (idempotent par clé), `balance`, `trialBalance`, comptes `Accounts.*` | `backend/src/ledger/ledger.service.ts` |
| Garde-fous SQL du ledger (équilibre, ajout seul) | `backend/prisma/migrations/20261019120000_ledger_guards/migration.sql` |
| Calcul des frais | `backend/src/common/money.ts`, `backend/src/work/work-units.ts` (`planUnits`) |
| Interface provider et mock | `backend/src/payments/providers/` |
| Financement, webhooks (`WebhookEvent`) | `backend/src/payments/payments.service.ts` |
| Payouts | `backend/src/payouts/payouts.service.ts` |
| Check-in, confirmation, libération, remboursement, auto-release | `backend/src/work/work.service.ts` |
| Ce qu'un utilisateur voit d'un autre (règle 8) | `backend/src/users/user.presenter.ts`, `backend/src/jobs/job.presenter.ts` |
| Auth, rôles, routes publiques | `backend/src/common/guards.ts`, `backend/src/common/decorators.ts` |
| Routes admin | `backend/src/admin/admin.controller.ts` |
| Tests e2e (setup, base `_test`) | `backend/test/` |

Les erreurs métier se lèvent ainsi :
`throw new BadRequestException({ code: 'RATE_TOO_LOW', message: 'Le tarif minimum est de 2 000 FCFA.' })`.

Migrations : `npx prisma migrate dev --create-only --name <nom>`, relire le SQL généré, vérifier qu'il est
additif.
