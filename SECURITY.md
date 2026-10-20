# Security and personal data

Nogoman holds phone numbers, locations, voice messages, soon identity checks, and money in
escrow. This page lists what the code already does, what the operator must do before the field
pilot, and the rules the coming payment and ID integrations must follow.

## Already in the code

- **Login.** SMS codes are stored hashed, expire after 5 minutes and allow 5 tries. Limits apply
  per number (3 per 15 min, 10 per day), per IP, and for everyone together (`SMS_DAILY_LIMIT`,
  which pauses logins rather than paying for an SMS-pumping attack).
- **Sessions.** Access tokens last 15 minutes. Refresh tokens rotate on every use, and a reused
  one logs that user out everywhere. Disabled and deleted accounts are refused on every request.
- **Contact details.** Phone numbers are never returned for another user, and chat text is
  masked (numbers, emails, links, other apps). Farm addresses stay hidden until a worker is hired.
- **Money.** A double-entry ledger, balanced and append-only, is enforced by the database.
  Webhooks must be signed, are applied once, are refused when their signed timestamp is more than
  5 minutes old, and never fund escrow when the provider's amount differs. Changing a payout number holds payouts for 48 h and warns the owner by SMS.
- **Admin.** Admin routes answer only over Tailscale or the LAN, never through Cloudflare, and
  every admin call is logged.
- **Deletion.** In-app account deletion (required by the App Store) erases name, number,
  location, payout number and messages. Payment records stay, without a name.
- **Retention.** Login codes are deleted after 7 days and dead sessions after 30.
- **App.** Tokens are kept in the phone's secure storage. Release builds refuse plain HTTP.

## Before the field pilot (operator)

1. **SMS.** Create an account on developer.orange.com, add the *SMS Côte d'Ivoire* API to an
   app, and buy a bundle. Request the sender name "Nogoman" from Orange. Set `SMS_PROVIDER=orange`,
   `ORANGE_CLIENT_ID` and `ORANGE_CLIENT_SECRET`, then test with your own number.
2. **HTTPS only.** Put the API behind a domain and a Cloudflare Tunnel. Never publish port 3000
   to the internet: `API_BIND` should be `127.0.0.1` or the Tailscale IP. In Cloudflare, add a
   rate-limiting rule on `/auth/otp/*`.
3. **Production settings.** Set `NODE_ENV=production` and `ENABLE_DOCS=false`, with no
   `ENABLE_DEV_ROUTES`. Set `CORS_ORIGINS` to the website's domain and `ADMIN_PHONES` to your
   number only.
4. **Secrets.** `.env` stays on the server (`chmod 600`), with a copy in a password manager. It
   is never committed and never goes in `mobile/.env`. If a secret leaks, change it: a new
   `JWT_SECRET` logs everyone out, which is the point.
5. **Server.** Use full-disk encryption (LUKS), SSH keys only, automatic security updates, and a
   firewall that only admits Tailscale.
6. **Backups.** Copy backups off the machine, encrypted (restic or rclone crypt). Include the
   `uploads` volume, and test one restore.
7. **Admin phone.** It is the master key. Use a SIM that isn't published anywhere, set a SIM
   PIN, and ask the operator to block SIM swaps without an in-person ID check.
8. **ARTCI.** File the declaration of personal data processing (law 2013-450) before collecting
   real data. Identity checks with a selfie need a prior authorization. Publish terms of use and
   a privacy policy in French, linked from the app and the store listings.
9. **Stores.** Fill in the App Store privacy labels and the Play Data safety form: phone number,
   name, precise location, audio, identity documents (via Smile ID) and financial information.
10. **Monitoring.** Set up an uptime check on `/health`, and an alert when the logs contain
    `SMS_DAILY_LIMIT`, `expected` (amount mismatch) or `admin route refused`.

## Rules for the coming integrations

**CinetPay**
- Keys only in the backend `.env`.
- Never trust a notification on its own. For each one, check its HMAC token, then ask
  CinetPay's check endpoint for the transaction status and settle only from that answer
  (amount, currency XOF, status, our transaction id) by passing `amountXof` to the webhook event.
- Payouts use a separate transfer password. Turn on IP allowlisting when the server has a fixed IP.

**Smile ID**
- Capture with Smile's SDK or hosted link, so ID photos and selfies go straight to Smile and
  never pass through or stay on our server.
- Store only what the app needs: the Smile job id, the result, the level and the date. No ID
  number and no images.
- Verify the signature of Smile's callback before changing `kycLevel`.
- Sign Smile's data processing agreement, and name Smile ID in the privacy policy.

## Known limits, accepted for the pilot

- Voice notes can't be scanned for phone numbers.
- After logout, an access token keeps working for up to 15 minutes (deletion and disabling are
  immediate).
- Database fields are not encrypted one by one. Disk encryption and network isolation cover this.
- Rate limits live in memory, which is correct for a single API instance.
