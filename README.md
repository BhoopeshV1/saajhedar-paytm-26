# Saajhedar

Voice-first business partner for a kirana, built for the Paytm Build for India AI Hackathon (Track 1). Hackathon prototype: payments, loans and reminders are simulated, and shop figures are made up.

## Run

1. Put keys in `app/.env` (see `.env.example`): `SARVAM_API_KEY`, `ANTHROPIC_API_KEY`.
2. `bun install`
3. `bun run build` then `bun run start`, and open http://localhost:8787
   (or `bun run dev` for hot reload on Vite's port).

The owner's phone is `/`. The customer's phone is `/#/order`. Demo PIN: 1234.
Phones need HTTPS for the microphone, for example `tailscale serve 8787`.

## Layout

- `server/` Bun server: SQLite shop data, forecast, rules engine, Sarvam speech, Claude tool loop, area analytics.
- `web/` React app: voice engine, screens for Sell, Stock, Pay, Collect, rules and the area view.
- `scripts/` builds the area dataset in `data/area/` (`bun run prep:area`).

## Area data

Business listings: Overture Maps Foundation places (CDLA Permissive 2.0 and other open licences per source).
Streets, water, parks, rail, localities: OpenStreetMap contributors (ODbL), Geofabrik extract.
Listings miss small shops without an online presence, so counts are a guide, not a census.

## Bill book and billing apps

- **Counter bills.** The owner calls out the items and the assistant's `make_bill` tool writes the bill, takes the items out of stock and records the money. `POST /api/bills/counter` does the same without voice.
- **Sending bills out.** `GET /api/billing/export?what=sales|purchases|stock&format=xlsx|csv|tally` downloads a file. `POST /api/billing/sync/connect` with `{url}` (https only) or `{demo:true}` makes the server POST every sale, supplier bill and payment as signed JSON (`X-Saajhedar-Signature`, HMAC-SHA256). `server/sync.ts` holds both, plus a stand-in billing app used for the demo.
- Connectors for named billing apps are not built, and the Tally XML has only been read back by this app's own importer, not by Tally.

## Welcome and setup

First visit on a device opens `web/src/screens/Welcome.tsx` (also under "Welcome and setup" in the menu). "I run a shop" walks through a simulated phone check, shop details, how bills are kept today and a PIN, then calls `POST /api/onboard`. "Still on the fence" takes an area, a kind of shop and an investment and shows `GET /api/area/fit`: how many of that kind are already there against similar areas, whether the money covers the rough setup cost, and what else the area is short of. No SMS, identity check or Paytm account lookup happens.
