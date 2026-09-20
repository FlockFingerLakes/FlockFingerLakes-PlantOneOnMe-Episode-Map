# Flock Finger Lakes + Plant One On Me Episode Map

Combined Google Maps site for filming locations from two Airtable bases / YouTube channels.

## Required GitHub Actions secrets
- `AIRTABLE_TOKEN` — Airtable PAT with read access to both bases.
- `GOOGLE_MAPS_API_KEY` — browser-restricted Google Maps JavaScript API key.

## Airtable sources
- Flock: base `appG2NKvsCNWdPKrb`, table `FLOCK Production`, view `Map`
- Plant One On Me: base `apptrASxYLA8YKsoR`, table `POOM Production`, view `Map`

The sync script only publishes records where `Show on Map` is checked, `Geolocation` is valid, and `YouTube URL` is populated. Records remain visible in the Airtable `Map` view when `Show on Map` is unchecked.

## Fields expected in both tables
`Episode Name`, `YouTube URL`, `Geolocation`, `Map Category`, `Show on Map`, `Address Street`, `Address Town`, `Address State/Province`, `Address ZIP`, `Address Country`.

## Deployment
GitHub Actions refreshes `data.json` hourly. The Pages workflow deploys the site from `main` and injects the Google Maps key into the deployed `config.js`.
