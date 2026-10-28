# Nogoman API

Backend for the Nogoman mobile app and website: phone login, jobs on a map, hiring,
escrow payments released day by day, and mobile money payouts.

NestJS 11 · Prisma 6 · PostgreSQL 16 · Docker Compose · Cloudflare Tunnel.

## How money moves

Every franc goes through a double-entry ledger (`LedgerAccount`, `JournalEntry`, `Posting`).
The postings of each entry sum to zero, and a database trigger rejects any entry that doesn't.
Ledger rows can't be deleted.

| Step | What happens | Ledger |
|---|---|---|
| Farmer hires workers | Engagement waits for funding | – |
| Farmer pays (`POST /jobs/:id/funding`) | Payment is pending at the provider | – |
| Provider confirms (signed webhook) | Work days are created, mission is active | provider clearing → job escrow |
| Worker checks in (GPS, ≤ 2 km) | Day marked as attended | – |
| Farmer confirms the day, **or 9:00 next morning** if the worker checked in | Day released | escrow → worker (rate − 3 %) + Nogoman (5 % + 3 %) |
| No check-in and no confirmation | Day refunded | escrow → farmer |
| Either side disputes | Held until an admin decides | – |
| Daily payout pass (`PAYOUT_HOUR_UTC`, 18:00 UTC by default) | One transfer per user, whatever was released, if the balance reaches `MIN_PAYOUT_XOF` (2 000 FCFA) | user balance → provider clearing |
| Instant payout (`POST /me/payouts/instant`) | The whole balance at once, from `INSTANT_PAYOUT_MIN_XOF` (10 000 FCFA), free | user balance → provider clearing |
| Transfer fails | Money goes back to the balance, retried after 6 h | reversed |

### Instant payout

`POST /me/payouts/instant` (worker or farmer) sends the whole balance now instead of waiting
for the daily pass, once it reaches `INSTANT_PAYOUT_MIN_XOF` (default 10 000 FCFA). It costs
nothing: no fee, and the same ledger entries as the batch (`PAYOUT`, then `PAYOUT_REVERSAL`
if the transfer fails). The answer, `201 { id, amountXof, status: "PENDING", operator }`,
never contains the payout number. The daily pass and the instant payout share one function
(`PayoutsService.attemptPayout`), which checks, in this order and under the user's row lock:
payouts switched on, payout number set, no safety delay after a number change, no transfer
already pending, no failure in the last 6 h, balance at least the threshold.

Task jobs ("à la tâche") have a single unit. It's paid when the farmer confirms, or 48 h
after the worker marks it done if the farmer doesn't object.

Payouts go out once a day to save transfer fees: a smaller balance waits for the next pass. With
several API instances, only one runs the pass (PostgreSQL advisory lock); `CRON_ENABLED=false`
turns it off.

Fees are configurable in basis points (100 = 1 %): `FARMER_FEE_BPS` (default 500, 5 %) is added
to what the farmer pays and `WORKER_FEE_BPS` (default 300, 3 %) is taken from what the worker
receives, each rounded to the nearest franc. A 4 000 FCFA day costs the farmer **4 200** and
pays the worker **3 880**; Nogoman keeps 320. The rates are stored on the payment when the farmer
funds, and the work days are created with them when the provider confirms: a later fee change,
even one made before the provider's webhook arrives, never affects a mission already paid for.

A job can't offer less than `MIN_DAILY_RATE_XOF` (2 000 FCFA by default), per day or per worker
for a task: `POST /jobs` and `PATCH /jobs/:id` refuse a lower rate with `RATE_TOO_LOW`.

**The payment provider is a mock for now.** It goes through the same webhook path as a real
one, so the aggregator (CinetPay / PayDunya / Flutterwave for Orange Money, MTN, Moov, Wave and
cards) can be plugged in behind `PaymentProvider` without touching the escrow logic.

## Coupure d'urgence

If something goes wrong with payouts (provider incident, suspected fraud), set
`PAYOUTS_ENABLED=false` and restart the API. Then:

- the daily payout pass and `POST /admin/payouts/run` pay nobody;
- a payout requested by a user (`POST /me/payouts/instant`) is refused with 503 `PAYOUTS_SUSPENDED`;
- nothing is written to the ledger: every balance stays as it is, to the franc;
- payouts already sent to the provider are still settled by their webhooks. A failed one puts
  the money back on the user's balance.

Set it back to `true` and restart: the next pass pays each user once, for the whole balance.
The back office will later add a switch stored in the database on top of this variable.

## Messages

A worker and a farmer get one thread per application, from the moment the worker applies.
Text is passed through a contact filter before it's stored. The filter masks phone numbers
(digits, "O" for zero, spelled out in French, +225), emails, links and other apps (WhatsApp,
Telegram…), and counts attempts per user (`contactFlagCount`). Voice notes are stored as files
in `UPLOAD_DIR` (the `uploads` Docker volume) and served only to the two participants. They
can't be filtered. The app polls for new messages every few seconds.

Note: the daily database backup doesn't include voice notes. Back up the `uploads` volume too
(`docker run --rm -v nogoman_uploads:/data -v $PWD/backups:/out alpine tar czf /out/uploads.tgz -C /data .`).

## Farm locations

The server names and checks every job location itself. When a farmer posts a job, the API
looks up the coordinates in OpenStreetMap (Nominatim) and stores the place name (village or
town) and full address, with `locationVerified: true`. Whatever label the phone sends is only a
fallback for when the geocoder is unreachable. The app's address search goes through
`GET /geo/search` and `GET /geo/reverse`.

Set `GEOCODER_CONTACT` to your email (Nominatim's usage policy asks for one), and optionally
`GEOCODE_COUNTRIES=ci` to limit address search to Côte d'Ivoire. Requests are throttled to one
per second and cached for a day. For heavier traffic, self-host Nominatim and set
`NOMINATIM_URL`.

## Privacy

- Phone numbers are never returned for another user.
- Farm coordinates are rounded to about 1 km, and the full address is hidden, until a worker is hired.
- OTP codes and refresh tokens are stored hashed.
- Refresh tokens rotate on every use. Reusing an old token logs out every session of that user.
- Login codes are capped per number (`OTP_MAX_PER_DAY`), per IP, and for everyone together
  (`SMS_DAILY_LIMIT`, against bots burning the SMS budget). Codes are deleted after 7 days.
- Each code allows `OTP_MAX_ATTEMPTS` guesses (right or wrong). An attempt is claimed with one atomic
  update before the code is compared, so parallel requests cannot exceed the limit.
- Replacing an existing payout number or operator holds payouts for `PAYOUT_COOLDOWN_HOURS` (72 h;
  `PAYOUT_HOLD_HOURS` is still read as the old name) and warns the account owner by SMS, so a
  stolen phone or account can't redirect the money at once. `GET /me` shows when payouts resume
  (`payout.heldUntil`, `null` when there is no hold), with the payout number masked.
- Payment webhooks must be signed, are applied once, and never activate escrow if the amount
  reported by the provider differs from what was asked. Their signed timestamp must be less than
  5 minutes old and at most 1 minute ahead (`WEBHOOK_EXPIRED` otherwise). The mock signs
  `${x-mock-timestamp}.${rawBody}` (Unix seconds) with `MOCK_WEBHOOK_SECRET` in `x-mock-signature`.
- Admin routes answer only over Tailscale or the LAN (`ADMIN_OVER_INTERNET=false`). Every admin
  call is logged.
- `DELETE /me` deletes the account: name, number, location, payout number and messages are
  erased, open jobs cancelled. Payment records stay, without a name, for accounting law. It is
  refused while a mission is active or money is still on its way to the user.

See [../SECURITY.md](../SECURITY.md) for the launch checklist.

## Run locally

```bash
cp .env.example .env              # set DATABASE_URL, JWT_SECRET, OTP_SECRET, SMS_PROVIDER=console
npm install
npx prisma migrate deploy
npm run start:dev                 # http://localhost:3000, docs at /docs
```

With `SMS_PROVIDER=console` the login codes are printed in the server log. With
`ENABLE_DEV_ROUTES=true` (never in production) you can settle a mock payment or payout:

```bash
curl -X POST localhost:3000/dev/payments/collection/<paymentId>/simulate \
  -H 'content-type: application/json' -d '{"status":"SUCCEEDED"}'
```

### Tests

```bash
npm test                           # unit tests
npm run test:e2e                   # full flow against a real database whose name ends in _test
TEST_DATABASE_URL=postgresql://user@host:5432/nogoman_test npm run test:e2e
```

New e2e files start the API with `bootApp(env)` and reuse the login, hiring and payment steps of
`test/helpers.ts` (see "Helpers e2e" in the root `CLAUDE.md`).

## Run on the homelab without a domain

```bash
cd backend
./scripts/init-env.sh --local     # secrets generated, login codes in the logs, docs on, simulated payments
docker compose up -d --build
curl localhost:3000/health        # {"status":"ok"}
```

- Docs: http://localhost:3000/docs
- Login codes: `docker compose logs -f api | grep "votre code"`
- To reach the API from your phone or laptop over Tailscale, set `API_BIND=` to the server's
  Tailscale IP (`tailscale ip -4`) and run `docker compose up -d` again. It stays private to your tailnet.

When you have a domain, follow the steps below and switch `.env` to production settings.

## Deploy on the homelab

1. **Install Docker** on the server and clone this repository.
2. **Configure:** `cd backend && ./scripts/init-env.sh` creates `.env` with every secret generated. Then fill in:
   - `SMS_PROVIDER=orange` with `ORANGE_CLIENT_ID` and `ORANGE_CLIENT_SECRET` (Orange Developer,
     "SMS Côte d'Ivoire" API: reaches Orange, MTN and Moov numbers, prepaid bundles of about
     7 FCFA per SMS). Africa's Talking also works (`SMS_PROVIDER=africastalking`).
   - `ADMIN_PHONES`: your own number in `+225…` form.
3. **Create the tunnel.** In Cloudflare Zero Trust → Networks → Tunnels, create a tunnel and copy its token into `CLOUDFLARE_TUNNEL_TOKEN`. Add a public hostname such as `api.yourdomain.com` → `http://api:3000`.
   *Already running cloudflared for another project?* Reuse that tunnel instead: add the public
   hostname there pointing to `http://<server LAN IP>:3000`, set `API_BIND=0.0.0.0` (or the LAN IP),
   and start without `--profile tunnel`.
4. **Start:**
   ```bash
   docker compose --profile tunnel up -d --build
   docker compose logs -f api
   curl https://api.yourdomain.com/health
   ```
   Migrations run automatically every time the API starts.
5. **Admin access over Tailscale:** set `API_BIND` to the server's Tailscale IP to reach port 3000 from your tailnet. The database is never published.

**Backups:** a `backup` service dumps the database daily into `./backups`, keeping 7 days,
4 weeks and 6 months. Copy that folder off the machine as well, e.g. with a nightly rclone to
cloud storage, because a backup on the same disk doesn't survive a dead disk.

**Moving to a VPS later:** copy `.env` and the latest dump, then run
`docker compose --profile tunnel up -d --build` and restore the dump. Point the tunnel at the
new host and the public URL stays the same.

Before real money flows, see "Before launch" below.

## API overview

All routes need `Authorization: Bearer <accessToken>` except auth, health and webhooks.
Full schema at `/docs`.

| Area | Routes |
|---|---|
| Auth | `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/refresh`, `POST /auth/logout` |
| Profile | `GET /me`, `PATCH /me` (name, role once, location, mobile money number), `DELETE /me`, `GET /users/:id`, `GET /users/:id/reviews` |
| Jobs | `POST /jobs`, `GET /jobs?lat&lng&radiusKm&category&payMode`, `GET /jobs/mine`, `GET /jobs/:id`, `PATCH /jobs/:id`, `POST /jobs/:id/cancel` |
| Hiring | `POST /jobs/:id/applications`, `GET /jobs/:id/applications`, `GET /applications/mine`, `POST /applications/:id/{hire,reject,withdraw}` |
| Escrow | `GET /jobs/:id/funding/quote`, `POST /jobs/:id/funding`, `GET /payments/:id`, `POST /webhooks/payments/:provider` |
| Work | `GET /engagements/mine`, `GET /engagements/:id`, `POST /engagements/:id/cancel`, `POST /work-units/:id/{check-in,done,confirm,dispute}`, `POST /jobs/:id/confirm-day` |
| Payouts | `GET /me/payouts`, `POST /me/payouts/instant` |
| Messages | `GET /conversations`, `GET /conversations/unread`, `POST /applications/:id/conversation`, `GET/POST /conversations/:id/messages`, `POST /conversations/:id/voice`, `GET /messages/:id/audio`, `POST /conversations/:id/read` |
| Reviews | `POST /engagements/:id/reviews` |
| Admin | `GET /admin/disputes`, `POST /admin/work-units/:id/resolve`, `POST /admin/users/:id/kyc`, `GET /admin/ledger/trial-balance`, `POST /admin/payouts/run`, `POST /admin/work/auto-release` |

## Errors

Every error has the same body, built by the global filter in `src/common/http-exception.filter.ts`:

```json
{ "statusCode": 400, "code": "TOO_FAR", "message": "Vous êtes à 9.9 km de la plantation. Rapprochez-vous pour pointer." }
```

`code` is stable and in English (`^[A-Z_]+$`): the app branches on it. `message` is plain French,
written to be shown or read aloud. Some errors add fields (`details`, `status`). A 500 never reveals
what went wrong: the details only go to the server log.

Generic codes, used when an error has no business code:

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_FAILED` | 400 | A field is missing or malformed. `details` lists `{ field, errors }` (technical, in English) |
| `BAD_REQUEST` | 400 | Unreadable request, e.g. malformed JSON |
| `UNAUTHORIZED` | 401 | No token, an invalid or expired token, or an unknown refresh token |
| `FORBIDDEN` | 403 | The resource belongs to someone else |
| `NOT_FOUND` | 404 | Unknown resource or route (also admin routes reached over the internet) |
| `METHOD_NOT_ALLOWED` | 405 | Method not supported |
| `CONFLICT` | 409 | Already done |
| `PAYLOAD_TOO_LARGE` | 413 | Body or voice note too large |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Content type not accepted |
| `TOO_MANY_REQUESTS` | 429 | Per-IP rate limit |
| `REQUEST_FAILED` | other 4xx | Any other client error |
| `SERVICE_UNAVAILABLE` | 503 | Database down (`/health`, which also returns `"status": "down"`) |
| `INTERNAL_ERROR` | 500 | Unexpected failure |

Business codes:

| Area | HTTP | Codes |
|---|---|---|
| Auth | 400 | `INVALID_PHONE`, `OTP_EXPIRED`, `OTP_INVALID`, `OTP_TOO_MANY_ATTEMPTS` |
| Auth | 401 | `ACCOUNT_DISABLED` |
| Auth | 429 | `OTP_RATE_LIMITED`, `OTP_DAILY_LIMIT` |
| Auth | 503 | `SMS_PAUSED`, `SMS_FAILED` |
| Roles and identity | 403 | `WRONG_ROLE`, `KYC_REQUIRED` |
| Profile | 400 | `ROLE_LOCKED`, `LOCATION_INCOMPLETE`, `ACTIVE_MISSIONS`, `MONEY_PENDING` (account deletion) |
| Places | 400 | `PLACE_NOT_FOUND` |
| Jobs | 400 | `RATE_TOO_LOW`, `START_IN_PAST`, `JOB_LOCKED`, `JOB_HAS_ACTIVE_WORK` |
| Hiring | 400 | `PAYOUT_METHOD_REQUIRED`, `OWN_JOB`, `JOB_NOT_OPEN`, `JOB_FULL`, `NOT_PENDING`, `NOT_WITHDRAWABLE` |
| Hiring | 409 | `ALREADY_APPLIED` |
| Escrow | 400 | `NOTHING_TO_FUND`, `PHONE_REQUIRED`, `PAYMENT_START_FAILED` |
| Payouts | 400 | `INSTANT_PAYOUT_TOO_LOW`, `PAYOUT_METHOD_REQUIRED` |
| Payouts | 409 | `PAYOUT_COOLDOWN` (safety delay after a number change, or a failed transfer under 6 h old), `PAYOUT_IN_PROGRESS` |
| Payouts | 503 | `PAYOUTS_SUSPENDED` (emergency stop, see above) |
| Webhooks | 401 | `BAD_SIGNATURE`, `BAD_PAYLOAD` |
| Webhooks | 400 | `WEBHOOK_EXPIRED` (signed timestamp more than 5 min old or more than 1 min ahead) |
| Work | 400 | `NOT_ACTIVE`, `NOT_TODAY`, `TOO_FAR`, `NOT_A_TASK`, `UNIT_CLOSED`, `FUTURE_DAY`, `NOT_DISPUTABLE`, `NOT_DISPUTED`, `ALREADY_ENDED` |
| Messages | 400 | `EMPTY_MESSAGE`, `CONVERSATION_CLOSED`, `NO_AUDIO`, `BAD_AUDIO`, `BAD_DURATION` |
| Reviews | 400 | `NOTHING_TO_REVIEW` |
| Reviews | 409 | `ALREADY_REVIEWED` |

A new error is thrown as
`throw new BadRequestException({ code: 'RATE_TOO_LOW', message: 'Le tarif minimum est de 2 000 FCFA.' })`
and added to this list.

## Before launch

- [ ] Payment aggregator contract, then the real `PaymentProvider` (collections, payouts, webhook signature).
- [ ] Smile ID verification, then set `REQUIRE_KYC_TO_TRANSACT=true`.
- [x] Chat with contact masking and voice notes.
- [ ] In-app calls (needs a development build).
- [x] Real SMS provider (Orange SMS Côte d'Ivoire), abuse limits, account deletion.
- [ ] Off-site, encrypted backups and uptime monitoring.
- [ ] Terms of use and privacy policy filed with ARTCI (Ivorian data protection authority).
