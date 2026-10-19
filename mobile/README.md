# Nogoman mobile

The Android and iOS app (plus a web build), made with Expo SDK 58 and Expo Router.
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

## Building for the stores

Use EAS (`npx eas-cli@latest build`). Before the first store build:
- Android needs a Google Maps API key for the map (`android.config.googleMaps.apiKey` in `app.json`).
  Expo Go works without one.
- Bundle identifiers are `ci.nogoman.app` for both platforms. Change them in `app.json` if you prefer another.

## Notes for contributors

- The React Compiler is on. Don't read possibly-null values with `!` inside callbacks, e.g.
  `place!.lat` in a mutation: the compiler evaluates them during render and the screen crashes.
  Pass them as mutation variables instead (see `post.tsx`, `mission/[id].tsx`).
- `AGENTS.md` lists the Expo-specific rules for coding agents.
