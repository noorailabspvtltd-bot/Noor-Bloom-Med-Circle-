# Google authentication and private cloud care

The Expo app has two explicit modes. `demo` preserves the existing local walkthrough. `cloud` uses Clerk Google sign-in and a Cloudflare Worker with D1 and a private R2 bucket. Cloud mode never imports the shared demo data into a new account or accepts client-selected roles.

## Account configuration

1. In Clerk, enable Google as the only sign-in connection. Disable email/password, phone, and other social sign-in methods. Enable the Native API. For the custom OAuth flow, register the native app redirect `bloommed://sso-callback`. Google SSO needs an installed development or release build; do not test this flow in Expo Go. Clerk production Google connections need your Google OAuth credentials configured in its dashboard. Configure sign-up requirements so Google supplies all required identity fields; patient details are collected inside BLOOM MED. MFA and Clerk session-task continuation are not implemented in this initial Google-only flow, so do not enable those requirements yet.
2. Set native app identifiers before making your own development/release build. Register those identifiers and the callback with Clerk. Use the configured `com.noorailabs.bloommed` identifiers and a development build for the OAuth callback.
3. Create or select an R2 bucket and D1 database. Keep R2 public development URLs disabled. Change `bucket_name`, `database_name`, and `database_id` in `wrangler.jsonc` to your resources. Configure `CLERK_ISSUER` to your exact Clerk frontend API issuer URL. Set `AUTHORIZED_PARTIES` to the comma-separated OAuth application origins used by your sessions, and `ALLOWED_ORIGINS` to any browser preview origins you explicitly want to allow. Native bearer requests do not need CORS origins.
4. Put the Clerk **JWT public PEM key** in the Worker's `CLERK_JWT_KEY` secret binding using `npx wrangler secret put CLERK_JWT_KEY --config backend/wrangler.jsonc`. This is the verification public key from Clerk, not the publishable key or a Google credential. No R2 access keys are needed: the Worker accesses R2 through its bucket binding.
5. Apply the schema with `npx wrangler d1 migrations apply bloom-med --remote --config backend/wrangler.jsonc` and deploy with `npx wrangler deploy --config backend/wrangler.jsonc`. Substitute your configured database name. These commands change your cloud account. The initial deployment has now been applied to the configured BLOOM MED account.
6. Copy `.env.example` to `.env.local`, set `EXPO_PUBLIC_APP_MODE=cloud`, your Clerk publishable key, and `EXPO_PUBLIC_API_URL=https://YOUR-WORKER-URL`. Restart Expo. Secrets must never use the `EXPO_PUBLIC_` prefix.

## Care team access

Each Google account automatically gets an empty patient care space. Its ID is `personal_<Clerk user ID>`. A trusted operator grants staff/family membership through D1. The client has no endpoint for granting itself access:

```sql
INSERT INTO memberships (user_id, space_id, role, provider_id)
VALUES ('user_DOCTOR_ID', 'personal_user_PATIENT_ID', 'Doctor', '1');
```

Use `Nurse` and the corresponding provider ID, or `Family` with an empty provider ID. Family membership also needs the patient's consent switch. Delete the membership to revoke staff access. The app's Profile screen lists the user's authorized care spaces and roles. IDs `1`, `2`, etc. and `n1`, `n2` refer to the existing **fictional** provider directory; replace those fixtures with your verified provider directory before offering real care bookings. Cloud bookings stay requested until an assigned professional confirms them. Staff access is scoped to the patient care space and the professional's assigned visits; patient records are shared within that authorized care space.

## Data behavior and limits

- Profiles, visit transitions, consultations, prescriptions, dose logs, activity, consent and support requests are validated by the Worker and stored in D1. Optimistic changes have stable IDs, serialize per client, and rebase on confirmed snapshots. Revision checks prevent one device from silently overwriting another. Failed writes revert; refresh before retrying. There is no offline write queue. Updates refresh on app foreground and every 30 seconds while active.
- R2 accepts PDF/JPEG/PNG/WebP up to 15 MB. Private downloads require a valid Clerk session and authorized care-space membership; objects do not have public URLs. Removing the last record referencing an attachment schedules its deletion. Uploads that never become records can leave orphan objects; add scheduled cleanup and storage quotas before a public launch.
- Tokens use Clerk's SecureStore cache on native devices. Cloud care data is held in memory rather than the demo AsyncStorage key. Downloaded attachment cache is scoped by user and removed on sign-out.
- The assistant, voice interaction, SOS and payments remain simulations. Support requests are saved in the care space; there is no external notification dispatch yet. Audit trails, production monitoring, backup/retention policy, invite UI, verified provider onboarding and real care-service integrations remain rollout work.

## Verification

`npm run test:cloud` bundles the Worker without deploying and runs an isolated local Miniflare instance. It exercises signed JWTs, account isolation, server-assigned doctor access, complete booking/consultation/medicine flow, private R2 uploads/downloads, family consent, revision conflicts, and record removal. It uses generated test RSA keys, not your cloud credentials. Live Google OAuth and your actual R2/D1 resources still need verification after account configuration.

References: [Clerk Expo OAuth](https://clerk.com/docs/guides/development/custom-flows/authentication/oauth-connections), [Clerk token verification](https://clerk.com/docs/reference/backend/verify-token), [R2 Worker API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/), [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/).

## Current deployment

Worker: https://bloom-med-api.ancdominater.workers.dev

D1 `bloom-med` uses the configured database ID; migration 0001 is applied. R2 `bloom-med-records` has public development URL access disabled. Clerk verification uses the public signing key from the configured issuer. Live Google sign-in still requires testing on the phone and Google/Native API configuration in the Clerk dashboard.
