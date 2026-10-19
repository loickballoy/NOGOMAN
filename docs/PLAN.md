# Instructions Claude Code — Nogoman

Cet onglet est écrit pour être donné tel quel à Claude Code. Exporte-le en Markdown, enregistre-le dans le dépôt sous `docs/PLAN.md`, puis lance chaque lot avec le prompt type ci-dessous. Les règles permanentes s'appliquent à toutes les tâches ; les lots se font dans l'ordre, un lot par branche.

## Contexte

Nogoman met en relation des agriculteurs et des ouvriers agricoles en Côte d'Ivoire. L'agriculteur publie une mission, embauche, paie d'avance en escrow ; l'ouvrier fait son check-in GPS ; chaque journée confirmée est libérée vers l'ouvrier, moins la commission.

- Backend : `backend/` — NestJS 11, Prisma 6, PostgreSQL 16, ledger en double entrée (`LedgerAccount`, `JournalEntry`, `Posting`), provider de paiement mock derrière `PaymentProvider`.
- Frontend : racine du dépôt — Next.js, encore branché sur `lib/store.ts` (localStorage) et `lib/mock-data.ts`.
- Utilisateurs : téléphones Android d'entrée de gamme, réseau 3G instable, une partie peu alphabétisée, interface en français.

## Règles permanentes

1. **Argent en entiers.** Tous les montants sont des entiers en FCFA (XOF n'a pas de centimes). Jamais de `float` pour l'argent.
2. **Tout mouvement d'argent passe par `LedgerService`**, en écritures équilibrées. Ne jamais contourner le ledger, ne jamais supprimer ni modifier une ligne de ledger, ne jamais retirer le trigger SQL d'équilibre.
3. **Les commissions sont figées au financement.** Un changement de `FARMER_FEE_BPS` ou `WORKER_FEE_BPS` ne doit jamais modifier une mission déjà payée.
4. **Nogoman ne détient pas les fonds.** Les comptes du ledger reflètent l'argent logé chez le partenaire de paiement agréé. Aucun code ne doit supposer un compte bancaire Nogoman.
5. **Aucun code spécifique à un provider dans les services.** Tout passe par l'interface `PaymentProvider` ; un nouveau provider = un nouvel adaptateur dans `backend/src/payments/providers/`.
6. **Webhooks** : signature vérifiée avant tout traitement, rejet des événements de plus de 5 minutes, idempotence par `WebhookEvent` (identifiant unique). Un webhook reçu deux fois ne crédite jamais deux fois.
7. **Tâches planifiées sûres** : chaque `@Cron` doit pouvoir tourner avec plusieurs instances sans double exécution (verrou `pg_advisory_lock`).
8. **Vie privée** : ne jamais renvoyer le numéro d'un autre utilisateur ; coordonnées de ferme arrondies à \~1 km avant embauche ; OTP et tokens toujours hachés.
9. **Erreurs** : chaque erreur métier a un `code` stable en anglais (`RATE_TOO_LOW`) et un `message` en français simple, lisible à voix haute.
10. **Migrations Prisma additives uniquement.** Ne jamais modifier une migration existante.
11. **Secrets** : rien dans le dépôt. Toute nouvelle variable est ajoutée à `backend/.env.example` avec un commentaire.
12. **Tests** : chaque flux d'argent nouveau ou modifié a un test e2e dans `backend/test/`. Les tests n'appellent jamais un vrai provider.
13. **Avant de terminer une tâche** : `npm run typecheck`, `npm test`, `npm run test:e2e` et `npm run build` passent dans `backend/`, et le README est à jour.

## Prompt type pour lancer un lot

```
Lis docs/PLAN.md : les règles permanentes, puis le lot N.
Propose d'abord la liste des fichiers à créer ou modifier et les migrations, et attends ma validation.
Ensuite implémente, avec tests, en respectant toutes les règles permanentes.
Termine en lançant typecheck, test, test:e2e et build, et coche les critères du lot qui sont remplis.
```

## Lot 1 — Règles métier et payouts

1. Commissions par défaut : `FARMER_FEE_BPS=500`, `WORKER_FEE_BPS=300`.
2. Tarif plancher : nouvelle variable `MIN_DAILY_RATE_XOF` (défaut 2 000). `POST /jobs` et `PATCH /jobs/:id` refusent un tarif inférieur avec le code `RATE_TOO_LOW`.
3. Payouts regroupés : remplacer le cron toutes les 15 minutes par un passage quotidien à `PAYOUT_HOUR_UTC` (défaut 18). `MIN_PAYOUT_XOF` passe à 2 000.
4. Payout immédiat : `POST /me/payouts/instant`, autorisé si le solde est d'au moins `INSTANT_PAYOUT_MIN_XOF` (défaut 10 000).
5. Coupure d'urgence : `PAYOUTS_ENABLED=false` suspend tout payout sans perdre les soldes.
6. Délai de sécurité : ajouter `payoutMethodChangedAt` sur `User` ; aucun payout pendant `PAYOUT_COOLDOWN_HOURS` (défaut 72) après un changement de numéro ou d'opérateur mobile money.

Fini quand :

- [ ] Un e2e prouve qu'une mission à 4 000 FCFA coûte 4 200 à l'agriculteur et verse 3 880 à l'ouvrier
- [ ] Un e2e prouve qu'un changement de commission n'affecte pas une mission déjà financée
- [ ] Un e2e couvre le délai de 72 h et la coupure d'urgence

## Lot 2 — Durcissement de la sécurité

1. `@nestjs/throttler` global, plus strict sur `/auth/*` ; Helmet ; CORS limité à `CORS_ORIGINS` ; taille maximale des requêtes à 1 Mo.
2. Double authentification TOTP pour les admins (enrôlement par QR code, codes de secours hachés). Les routes `/admin/*` exigent un jeton avec TOTP validé.
3. Modèle `AdminAuditLog` (admin, action, cible, avant, après, date), écrit pour chaque action admin, jamais supprimé.
4. Helper de verrou PostgreSQL appliqué à tous les `@Cron` existants (`work.service.ts`, `payouts.service.ts`).
5. CI : Dependabot et `npm audit --audit-level=high` dans `.github/workflows/backend.yml`.

Fini quand :

- [ ] Deux instances de l'API lancées en parallèle n'exécutent jamais le même payout deux fois (test)
- [ ] Une route admin sans TOTP renvoie 401

## Lot 3 — Frontend branché sur l'API (PWA)

1. Client API typé `lib/api.ts` (rafraîchissement automatique du token, gestion des codes d'erreur). Supprimer `lib/store.ts` et `lib/mock-data.ts`, retirer les clés `agrilink_*`.
2. Écrans dans l'ordre du parcours : numéro → code OTP → choix du rôle → profil et mobile money → carte des offres → détail et candidature → embauche → paiement → check-in → confirmation du jour → historique des paiements.
3. PWA : manifest, service worker, cache hors ligne des écrans ; file d'attente des check-ins dans IndexedDB, envoyée au retour du réseau avec l'heure et la position d'origine.
4. Accessibilité : gros boutons, pictogramme par culture, montants en gros chiffres, bouton « écouter » (Web Speech API, `fr-FR`) sur chaque écran et chaque message d'erreur.
5. Affichage transparent des frais : l'agriculteur voit « 4 000 + 200 de frais », l'ouvrier voit « 3 880 reçus ».

Fini quand :

- [ ] Le parcours complet fonctionne contre l'API locale avec le provider mock
- [ ] Première page sous 300 Ko et utilisable en 3G simulée (Lighthouse mobile ≥ 85)
- [ ] Un check-in fait hors ligne arrive au serveur une fois le réseau revenu

## Lot 4 — Paiements réels

1. `WaveProvider` : sessions Checkout, Payouts, webhooks signés HMAC, vérification du destinataire (le nom du titulaire doit correspondre au KYC).
2. Second adaptateur pour Orange Money, MTN et Moov via le partenaire agréé choisi. Tant que le contrat n'est pas signé, garder une interface et un mock de test.
3. Routeur de provider selon `payoutOperator`.
4. Rapprochement quotidien : comparer le compte de compensation du ledger au solde renvoyé par chaque provider ; écart non nul = alerte.

Fini quand :

- [ ] Les e2e passent avec chaque adaptateur en mode sandbox ou mock
- [ ] Un écart de rapprochement déclenche une alerte visible dans le back-office

## Lot 5 — KYC Smile ID et plafonds

1. Intégration Smile ID (pièce d'identité + selfie) ; mise à jour de `kycLevel` et `kycStatus` par webhook signé.
2. Âge minimum de 18 ans calculé depuis la pièce ; refus avec le code `UNDERAGE`.
3. `REQUIRE_KYC_TO_TRANSACT=true` par défaut en production.
4. Plafonds par niveau de KYC, configurables (par exemple 50 000 FCFA par jour au niveau 1).

Fini quand :

- [ ] Un compte non vérifié ne peut ni payer ni recevoir
- [ ] Un mineur ne peut pas atteindre le niveau 1

## Lot 6 — Back-office admin

Application Next.js séparée ou section `/admin` protégée : litiges et arbitrage, validation KYC manuelle, suspension de compte, balance du ledger, payouts en échec et relance, recherche d'utilisateur, journal d'audit, bouton de coupure des payouts.

Fini quand :

- [ ] Toutes les routes `/admin/*` existantes ont un écran
- [ ] Chaque action laisse une ligne dans `AdminAuditLog`

## Lot 7 — Anti-fraude

1. Signaux sur les check-ins : vitesse impossible entre deux positions, même appareil pour plusieurs comptes, paires agriculteur-ouvrier répétées anormalement.
2. Demande aléatoire d'une photo au check-in (conservée 30 jours puis supprimée).
3. Les signaux créent des alertes dans le back-office ; ils ne bloquent jamais automatiquement un paiement sans revue humaine.

## Lot 8 — Mise en production

1. Déploiement sur VPS avec le `docker-compose.yml` existant et un environnement de staging séparé.
2. Backups chiffrés avant envoi hors site (rclone), restauration testée par un script.
3. Sentry côté API et frontend ; alertes sur trial balance différente de zéro, provider en échec et cron non exécuté.
4. Page de statut publique.

Fini quand :

- [ ] Une restauration complète depuis le dernier backup réussit sur staging
- [ ] Une alerte de test arrive sur ton téléphone

## Plus tard (phase 3, pas avant le pilote)

- Tableau de bord payant pour les coopératives (main-d'œuvre déclarée, ouvriers majeurs vérifiés, paiements traçables).
- Canal USSD via Africa's Talking : offres proches, accepter une mission, solde.
- Refactoring multi-pays : `amount` + `currency`, un ledger par devise, fuseau horaire et configuration par pays.

## Ce que Claude Code ne doit jamais faire

- Brancher un provider de paiement réel en production sans que le contrat soit signé et les clés fournies par toi.
- Activer `ENABLE_DEV_ROUTES` ou `SMS_PROVIDER=console` en production.
- Modifier une migration déjà appliquée ou supprimer des données du ledger.
- Mettre des données personnelles réelles dans les seeds, les tests ou les logs.
