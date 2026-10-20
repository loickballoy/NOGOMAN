# Nogoman mobile

The Android and iOS app (plus a web build), made with Expo SDK 57 and Expo Router.
French only for now. Every screen has an **Écouter** button that reads it aloud with the
phone's own French voice.

## What's in it

| Who | Screens |
|---|---|
| Everyone | Phone number → SMS code → role, name (and mobile money number for workers) |
| Worker | Map with nearby jobs and their daily pay · job detail with net pay · apply · mission: "Je suis arrivé" (GPS check-in), "Travail terminé" for tasks · earnings and payouts |
| Farmer | Dashboard (money held in escrow, days to confirm) · post a job in 4 taps · applicants: hire / refuse · pay the escrow by Orange Money, MTN, Moov or Wave · mission: confirm the day, report a problem, stop the mission |

The design follows the Design Direction canvas: ink and white, one green for money and trust,
one main button at the bottom of each screen, an icon next to every word, keypads instead of
typing.

## Run it on your phone

1. Install **Expo Go** from the Play Store or App Store.
2. Start the backend (see `backend/README.md`) and make sure your phone can reach it. With
   Tailscale, install it on the phone, then set `API_BIND` in `backend/.env` to the server's
   Tailscale IP.
3. On your computer:
   ```bash
   cd mobile
   cp .env.example .env          # set EXPO_PUBLIC_API_URL=http://<tailscale-ip>:3000
   npm ci
   REACT_NATIVE_PACKAGER_HOSTNAME=$(tailscale ip -4) npx expo start -c
   ```
4. Scan the QR code with the camera (iPhone) or with Expo Go (Android).

With `./scripts/init-env.sh --local` on the backend, login codes appear in
`docker compose logs api`. Payments are simulated: in development builds the payment screen
shows **Simuler la confirmation (test)**, which plays the payment provider.

If you skip `EXPO_PUBLIC_API_URL`, the app assumes the API runs on the same computer as Expo,
on port 3000.

### "Project is incompatible with this version of Expo Go"

Expo Go runs exactly one SDK version, and the App Store version can lag a few weeks behind a
new SDK while Apple reviews it. The app is on **SDK 57** because that's what the store's Expo Go
runs today (October 2026). When Expo Go moves to SDK 58, upgrade with
`npx expo install expo@^58.0.0 --fix`, or skip Expo Go entirely with a development build:
`npx eas-cli@latest build --profile development --platform ios`.

### The phone can't connect

Check each link in order:

1. **Phone → API.** In the phone's browser, open `http://<server-tailscale-ip>:3000/health`.
   It must show `{"status":"ok"}`. If not, Tailscale isn't on for the phone, or the server isn't
   publishing port 3000 on that interface: `docker compose ps` should show `0.0.0.0:3000->3000/tcp`.
2. **Phone → Expo (Metro, port 8081).** If Expo Go can't open the app at all, the QR code
   probably points at your computer's Wi-Fi address. Make it use the Tailscale address:
   ```bash
   REACT_NATIVE_PACKAGER_HOSTNAME=$(tailscale ip -4) npx expo start -c
   ```
3. **App → API.** `EXPO_PUBLIC_API_URL` is read when the bundle is built. After changing `.env`,
   restart with `npx expo start -c`. The login screen shows the address the app uses
   ("API : …") at the bottom.

### Dependencies

Install with `npm ci` so you get exactly the versions in `package-lock.json`, and add packages
with `npx expo install`. Don't run `npm audit fix --force`: it "fixes" warnings in Expo's
development tools by installing an Expo version from 2021. Those warnings concern the
build tooling on your computer, not code shipped in the app.

CI fails on high or critical advisories (`npm audit --audit-level=high`), except those listed in
`audit-exceptions.json` with their justification and expiry date. How to handle an alert:
"Dependency alerts" in `backend/README.md`.

## Web build

```bash
npx expo export --platform web    # static site in dist/
```
The web build shows the job list without the map. A browser calling the API needs its origin
in the backend's `CORS_ORIGINS`.

## Checks

```bash
npm run typecheck
npx expo lint
npx expo-doctor
```

## Development build (needed for calls, TestFlight and the stores)

Expo Go only runs the modules it ships with and only one SDK version. A development build is
your own copy of the app with the Nogoman icon and identifiers, installed on your phone, that
still loads the JavaScript live from your computer.

There are three variants, installable side by side (`app.config.ts`):

| Profile (`eas.json`) | App name | Bundle id | Talks to |
|---|---|---|---|
| `development` | Nogoman (dev) | `ci.nogoman.app.development` | your computer (Metro) + `EXPO_PUBLIC_API_URL` |
| `preview` | Nogoman (test) | `ci.nogoman.app.preview` | the API set for the `preview` environment |
| `production` | Nogoman | `ci.nogoman.app` | the HTTPS API (store builds) |

Test builds may call the homelab over plain HTTP (Tailscale). Production builds only allow HTTPS.

**One-time setup**
```bash
cd mobile
npx eas-cli@latest login                 # or export EXPO_TOKEN=... on the homelab
npx eas-cli@latest init                  # creates the EAS project and prints its id
export EAS_PROJECT_ID=<the id>           # also add it to your shell profile
npx eas-cli@latest device:create         # registers your iPhone (opens a link to install a profile)
# API address baked into each build:
npx eas-cli@latest env:create --environment development --name EXPO_PUBLIC_API_URL --value http://<tailscale-ip>:3000 --visibility plaintext
npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_API_URL --value http://<tailscale-ip>:3000 --visibility plaintext
# Android map tiles (Google Cloud console → Maps SDK for Android → API key):
npx eas-cli@latest env:create --environment preview --name GOOGLE_MAPS_API_KEY --value <key> --visibility sensitive
```
The first iOS build asks for your Apple Developer login and creates the certificates and
provisioning profile for you.

**Build and run**
```bash
npm run build:dev:ios          # ~15 min on EAS; ends with a QR code / link to install
npm run start:dev-client       # then open "Nogoman (dev)" on the phone
```
For testers: `npm run build:preview` makes a standalone "Nogoman (test)". It installs from a link
on registered iPhones, and as an APK on Android.

## Building for the stores

`npm run build:prod`, then `npx eas-cli@latest submit --platform ios` sends it to TestFlight
(App Store Connect app record needed first), and `--platform android` to the Play Console.
Production needs the API on HTTPS (a domain behind the Cloudflare Tunnel).

## Notes for contributors

- The React Compiler is on. Don't read possibly-null values with `!` inside callbacks, e.g.
  `place!.lat` in a mutation: the compiler evaluates them during render and the screen crashes.
  Pass them as mutation variables instead (see `post.tsx`, `mission/[id].tsx`).
- `AGENTS.md` lists the Expo-specific rules for coding agents.
