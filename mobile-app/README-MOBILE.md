# Production Desk installer companion

This is a separate iOS/Android app project. Do not put its files in the Next.js web app root. The web update must be deployed and Supabase migration 011 applied first.

The companion opens https://productiondesk.app and reuses its email/password sign-in. It receives a limited location-only device token after sign-in; no database key or account password is stored in native code. Device tokens expire with the web session (currently 12 hours). Changing the production hostname requires updating ORIGIN in tracking.ts and rebuilding this app.

## Build and install

Prerequisites: an Expo account, Apple Developer membership for iPhone distribution, and Android signing/distribution as appropriate. The package identifiers are app.productiondesk.installer; confirm ownership when creating the app records. Store submission is not performed by this package.

From this directory:

```sh
npm ci
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform ios --profile preview
```

The iOS internal build requires registering test devices. For wider distribution use the production profile and TestFlight / Google Play. These commands will request your account credentials and signing setup; no credentials are included. Background location does not work in Expo Go. Use an EAS development/internal build.

## What it does

- Requests foreground and background location with an explanation before enabling tracking. On Android, choose Allow all the time in Settings; on iOS allow background location when prompted.
- Shows Android's ongoing location notification / iOS's background location indicator.
- Sends latest coordinates while signed in; stores no route history.
- Checks permission and device location services on foreground/resume, every 15 seconds while active, and whenever the OS runs a background task.
- Revokes installer sessions and customer links when sharing is explicitly stopped or a permission/service disable is detected. If offline, blocks the app and retries revocation after connectivity returns.
- A phone with no signal, a killed app, or OS suspension is shown as stale on the map; it cannot be treated as a confirmed permission revocation.
- Customer tracking starts only when an authorized user creates an On My Way link. The link expires after two hours or can be ended with Arrived / end customer tracking.

## Required physical-device acceptance test before crew rollout

1. Sign in to a test installer assigned to a supervisor. Enable location. Verify that supervisor and Admin see the marker, accuracy and timestamp; unrelated supervisors and PAs cannot access it.
2. Lock the iPhone/Android phone and travel with it; verify timestamps update while locked. Repeat with the phone stationary and low-power mode. OS scheduling can delay updates; stale labels must appear after two minutes.
3. Turn location permission off, then return to the app. Verify sign-out and removal from the map. Repeat with device Location Services off and with Stop sharing & sign out.
4. Repeat permission revocation offline. The app must block access; reconnect and verify sessions/customer links are revoked.
5. Create a customer link for the test job. Confirm only that crew's position appears. End the trip; verify the customer link stops working. Reassign the job and verify the old link stops working.
6. Confirm photo/document uploads and job results still work in the WebView, including camera/file picker permissions on both platforms.

Verification completed here: TypeScript and iOS/Android JavaScript bundle exports. No physical-device, signing, app-store, or live production testing has been performed.
