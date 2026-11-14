# Saajhedar

A kirana's business partner that works by voice. It sells, stocks, pays and collects inside rules the owner speaks and signs with a PIN. Built by team Finance Tours for the Paytm Build for India AI Hackathon, Chennai (Track 1, Merchant Growth AI).

Saajhedar is Hindi for business partner. It is not a Paytm product. This is a hackathon prototype: payments, loans, reminders, account linking and supplier phone calls are simulated, and the shop's figures are made up.

## What it does

- **Sell.** The owner calls out items the way they already do over a paper pad, and that becomes a bill: stock drops and the money is recorded. Customers can also order from their own phone.
- **Stock.** A forecast from sales, weather and the festival calendar says what runs out and when. Saajhedar phones each supplier and orders, inside the owner's ordering rule.
- **Pay.** Supplier invoices land here, from a phone order, a photo of a paper bill, or a billing-app export. Each is checked against what was delivered before it is paid.
- **Collect.** Udhaar (credit) per customer, with reminders written in the shop's language.
- **Rules.** The owner says a rule, such as "Pay the milk supplier up to 3,000 rupees without asking", and signs it with a PIN. Plain code enforces the rules; the model can only propose. Each job screen opens with the rules that govern it.
- **Area view.** For someone who has not opened a shop yet: pick a place, a kind of shop and an investment, and see who is already there and what the area is short of, then a starter kit and setup.

Voice is Sarvam (speech to text and text to speech, in English, Tamil and Hindi). Reasoning is Claude with a tool loop.

## Run

1. Put keys in `app/.env` (see `.env.example`): `SARVAM_API_KEY`, `ANTHROPIC_API_KEY`. Optional: `OPENAI_API_KEY` for voices on the supplier call screen.
2. `bun install`
3. `bun run build` then `bun run start`, and open http://localhost:8787
   (or `bun run dev` for hot reload on Vite's port).

The owner's phone is `/`. The customer's phone is `/#/order`. Demo PIN: 1234. "Reset the demo" in the menu, or `POST /api/reset`, puts the shop back to its starting state.
Phones need HTTPS for the microphone, for example `tailscale serve 8787`.

## Layout

- `server/` Bun server: SQLite shop data, forecast, rules engine, Sarvam speech, Claude tool loop, area analytics, bill import and export, supplier calls, the login gate.
- `web/` React app: voice engine, screens for Sell, Stock, Pay, Collect, rules and the area view, the welcome flow, and the laptop device frames.
- `scripts/` builds the area dataset in `data/area/` (`bun run prep:area`).

## Rules in every tab

`web/src/screens/RulesFor.tsx` puts a collapsed "Your rules here" strip at the top of Sell, Stock, Pay and Collect. Opened, it shows the signed rules for that job in the owner's words, an example of a new rule to say, and a link to all rules. `server/rules.ts` holds the rule kinds and the checks; anything outside a rule becomes a pending action that needs the PIN.

## Ordering by phone

"Call suppliers and order" on Stock (`POST /api/calls`, or the assistant's `call_suppliers` tool) groups what is running out by supplier and checks each order against the `order_limit` rule. Inside the limit the call goes ahead; above it the call waits for the PIN. Each call produces a transcript, a supplier order and an invoice in Pay that is held until the delivery is counted. A line whose price has risen more than 5% is not ordered and is left for the owner. A supplier is not called twice within twelve hours.

The supplier's side of the call is simulated and no phone rings. `web/src/screens/CallScreen.tsx` plays the call back as a phone screen. With `OPENAI_API_KEY` set, `server/callvoice.ts` voices each line (one voice for the agent, another for the supplier) and keeps the audio in `data/voice/` so replays cost nothing. `POST /api/calls/webhook` accepts a post-call report from a real voice agent, but its payload shape has not been checked against a live campaign.

## Bill book and billing apps

- **Counter bills.** The owner calls out the items and the assistant's `make_bill` tool writes the bill, takes the items out of stock and records the money. `POST /api/bills/counter` does the same without voice.
- **Sending bills out.** `GET /api/billing/export?what=sales|purchases|stock&format=xlsx|csv|tally` downloads a file. `POST /api/billing/sync/connect` with `{url}` (https only) or `{demo:true}` makes the server POST every sale, supplier bill and payment as signed JSON (`X-Saajhedar-Signature`, HMAC-SHA256). `server/sync.ts` holds both, plus a stand-in billing app used for the demo.
- Connectors for named billing apps are not built, and the Tally XML has only been read back by this app's own importer, not by Tally.

## Welcome and setup

Every open starts on a splash that waits for Proceed. A first visit on a device then opens `web/src/screens/Welcome.tsx` (also under "Welcome and setup" in the menu). "I run a shop" walks through a simulated phone check, shop details, how bills are kept today and a PIN, then calls `POST /api/onboard`. "Thinking of opening one?" takes an area, a kind of shop and an investment and shows `GET /api/area/fit`: how many of that kind are already there against similar areas, whether the money covers the rough setup cost, and what else the area is short of. No SMS, identity check or Paytm account lookup happens.

## Laptop view

On screens 960px and wider the app is drawn inside a device frame, scaled to fit the window: a tablet with a side rail and two columns, or a phone. The switch in the bottom-right corner chooses the frame and the background (plain gradient, a logo wallpaper, or shop doodles). Real phones get no frame. The speaker button in the top bar mutes spoken replies, which also saves speech credits.

## Public demo and login

For a public address the app sits behind a reverse proxy, and `server/gate.ts` asks for a username and password (HTTP Basic) on any host that is not localhost or a tailnet name. The password hash is read from `app/.site-auth.json` (`{"user", "hash"}`, bcrypt, not in git). Five wrong passwords from one address in ten minutes lock that address out for fifteen minutes. Everyone with the login shares one shop and spends the same API credits.

## Area data

Business listings: Overture Maps Foundation places (CDLA Permissive 2.0 and other open licences per source).
Streets, water, parks, rail, localities: OpenStreetMap contributors (ODbL), Geofabrik extract.
Listings miss small shops without an online presence, so counts are a guide, not a census.

## Known gaps

- Supplier calls, payments, loans, reminders and account linking are simulated.
- Setup costs, sales lifts and loan terms are illustrative.
- Some labels are still English when the app is in Tamil or Hindi, and the Tamil and Hindi wording has not had a native review.
- The microphone has not been tested in a real, noisy shop.
- The Paytm and UPI marks in the wallpapers are outlines made from their logos for this hackathon demo; they belong to their owners.

See `PITCH.md` for the three-minute demo script.
