# SKIPPIES v2: BYO. Recycle. Hatch. Battle.

A location-based collect-and-battle game for **MamaShop's BYO campaign** (SP DELTA BA0617).
**How might we help young people make BYO an easy, consistent part of their daily routines beyond MamaShop's Open House campaign?**
SKIPPIES answers this by turning every *real* BYO or recycling moment into a random egg.

## The game loop
| You do in real life | You get in the game |
|---|---|
| Snap your reusable cup / bottle / box / bag / cutlery (scanner checks it on your phone) | A random **Skippy egg**: Common 60%, Uncommon 25%, Rare 10%, Epic 4%, Legendary 1% (base odds). Rare or better is guaranteed within 10 eggs. |
| Recycle a drink can/bottle (10¢ at Return Right machines), paper or e-waste | An egg plus **30 🔩 scrap** (BYO gives 10) |
| Keep doing the same habit | **Habit Mileage**: +1% stats per action to Skippies of that type, max +25%. Spark Skippies grow from everything. |
| Rinse your reusable | +1 ⚡ and the **Bubbles** recipe Skippy |
| BYO with a friend / family, or on weekends | Recipe-only Skippies (never random): Kaki Twins, Mama Bao, Weekend Wanderer |
| Do it on 5 different days in a 14-day season | **MamaShop reward code**, based only on your days, never luck |

- **Merge duplicates** into stars: ★→★★ costs 1 copy, then 2, 4 and 8 (max ★★★★★, so 16 of the same Skippy in total). 3-stage lines evolve at 3★ and 5★; 2-stage lines evolve at 4★.
- **Train** with scrap (10 🔩 = 20 XP). Battles also give XP.
- **Campaign**: 5 areas (SP Canteen → Semakau Landfill) of Litterbugs. Same-type attacks deal 2×. Areas unlock with real BYO days.
- **Arena (PvP), asynchronous by design**: you battle a saved copy of another player's team, so they don't need to be online and there's no live contact.
  - Players in your ~5 km zone **or the 8 zones around it** are shown first. You can also enter a friend's code in person.
  - Type cycle: 🥤→💧→🍱→👜→🥢→♻️→🥤 (1.5×).
  - Elo K=32. The offline defender gets half the rating change.
- **Leaderboards**: eco this week / all time / arena, for all of Singapore or your zone plus the zones around it. Only photo-verified actions count, and practice bots never appear.
- **Recycling Radar**: nearest NEA blue bins and e-waste points (data.gov.sg) on a radar, with Google Maps directions, plus links to BCRS Return Right machines.
  - The packaged data file is empty. **The server downloads the data automatically on first start** (and refreshes it every 30 days). It needs internet, so this doesn't happen on a laptop with no connection. The tool was tested against copies of the real dataset formats, but not against a live download. Until the data loads, the Radar shows the official map links.
  - Data dates: Recycling Bins last updated 6 Jun 2024; E-waste last updated 2022, so it may be outdated.
  - BCRS has no open dataset, so the app links out to returnright.sg. Note that freshly prepared drinks (e.g. bubble tea) are not BCRS-eligible. Those count as BYO, not recycling.
- **Reminders**: a daily BYO push and a weekly recycling push (web push, Singapore time), plus .ics calendar reminders for any phone.

22 original species (no Pokémon names or art): Sipsy, Drippet, Tapao Cub, Totelet, Strawbit, Canny, Kopicat, Flaskit, Bentobot, Bagabond, Chopsticky, Binbin, Bobalisk, Refundo, Otterly, Durianosaur, **Semakoral** and **Lumigrove** (legendary), and the recipe-only Bubbles, Weekend Wanderer, Kaki Twins and Mama Bao.

## Fair play: "you can't send the same picture twice"
- **Live camera only**: there is no gallery upload. The on-device COCO-SSD scanner must spot a matching object before you can take the photo.
  - COCO has no class for cans, straws, chopsticks, lunchboxes or tote bags, so each item maps to the closest classes:
    - cup: cup / wine glass / bottle
    - bottle: bottle / cup
    - container: bowl / cup
    - bag: handbag / backpack / suitcase
    - straw/cutlery: fork / knife / spoon / cup / bottle
    - can/bottle recycling: bottle / cup
    - paper: book
    - e-waste: phone / laptop / keyboard / mouse / remote / TV
  - The app tells players what the scanner looks for.
- Each photo becomes a **64-bit perceptual fingerprint (dHash)**. The server rejects any photo within 6 bits of:
  - one of **your own** photos from the last 90 days, or
  - **anyone's** photo from the last 30 days.
- Blank or dark frames are rejected.
- Limits: a 60-second cooldown between photos and a maximum of 6 eggs per day.
- **The photo never leaves the phone.** Only the 16-character fingerprint is sent.
- Battles are **server-verified**. The server issues a seeded ticket, and the client sends its moves. The server replays them and rejects invalid moves. Tickets are single-use and expire after 30 minutes.
- **Known limits (be honest about these):**
  - The fingerprint can be beaten by cropping or rotating a photo heavily.
  - The detected object is reported by the phone.
  - **Must field-test:** the same bottle photographed on the same desk every day might be wrongly rejected. The app asks players to snap it where they're using it. Measure the false-rejection rate on real phones, then tune the 6-bit / 90-day settings in `engine.js`.
  - This raises the effort needed to cheat but cannot prove a real BYO. That is why the MamaShop reward needs 5 *different days*, and could add a staff check at the counter.

## Safety and privacy (PDPC guidance for children's data)
- **Under 13**: offline mode only (all data stays on the device). **13+**: online.
- Names are **generated** (e.g. "Sunny Kopicat 482"). There is no free text and no chat.
- Location is **opt-in**. Only a ~5 km geohash zone is stored. Exact location is used only on the phone for the Radar.
- Nearby battles use **asynchronous copies of teams**, so strangers are never in live contact.
- Eggs are free, have **published odds** (base and effective-with-pity), cannot be bought and cannot be traded.
- Delete account removes your player, tokens, photo fingerprints and battle tickets.

## Run it
Requires **Node.js ≥ 22.13** (uses the built-in `node:sqlite`; versions 22.5–22.12 need `--experimental-sqlite`). The server needs no npm packages. The phone's scanner downloads TensorFlow.js + COCO-SSD from jsDelivr/Google the first time it's used, so the first scan needs internet.
```bash
npm start                      # http://localhost:8080 (on a phone, you need HTTPS: see Deploy)
npm run fetch-data             # optional: download the recycling points now instead of waiting for start-up
npm test                       # all test suites, including a real-server HTTP test
```
Environment variables:
- `PORT` (or `SOCKET` for a unix socket path)
- `FETCH_DATA=0` turns off the automatic recycling-data download
- `DB_FILE` (SQLite path; use a **persistent disk** in production)
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (`mailto:`). Keys are auto-generated and stored in the DB if missing.
- `ALLOW_ORIGIN` (only if the frontend is hosted elsewhere)

## Deploy (about 10 minutes)
HTTPS is required for the camera, location, push notifications and "Add to Home Screen". These hosts give you HTTPS automatically.
1. Push this folder to a GitHub repository.
2. **Render:** New → Blueprint → choose the repo. `render.yaml` sets up the Docker service, a 1 GB persistent disk for the database, and a health check. Enter `VAPID_SUBJECT` (e.g. `mailto:yourteam@ichat.sp.edu.sg`) when asked.
   **Any other Docker host** (Railway, Fly.io, a VPS): build the `Dockerfile`, mount a persistent volume at `/data`, and set `VAPID_SUBJECT`.
3. Open the HTTPS link on your phone. Then:
   - **Android (Chrome):** menu → Install app.
   - **iPhone (Safari):** Share → Add to Home Screen. This is needed for push reminders.
4. Check that the logs show `[data] recycling points ready: N`.
5. Put the link in a QR code for MamaShop's counter.

Important: without a persistent disk the database is wiped on every redeploy. Keep the same VAPID keys (they're stored in the database) or existing push subscriptions stop working.

**Offline/demo:** open `public/index.html` from any static host, or use the single-file build. With no server configured (`public/config.js`), the whole game runs on the device.

## Design system
"Void-deck field guide":
- Calm paper background with flat sections; chunky outlines only on game objects.
- One hand-drawn SVG icon set (24 px grid, 2 px stroke). No emoji anywhere in the UI; a test enforces this.
- Colour tokens checked for WCAG AA contrast; 44 px touch targets.
- Safe-area insets for notched phones; reduced-motion support.
- Every disabled control says why it's disabled.

## Project layout
- `public/engine.js`: all game rules (pure and deterministic, shared by the client and the server)
- `public/api.js`: the API. It runs on the server (SQLite) **and** in the browser (offline), so both modes behave the same.
- `public/app-*.js`, `art.js`, `styles.css`, `sw.js`: the installable web app (PWA). Creatures are drawn in SVG code.
- `server/`: HTTP server with CSP and security headers, a rate limit, a 16 KB body limit, and a reminder scheduler. Also includes the RFC 8291 Web Push implementation and the data.gov.sg fetcher.
- `tests/`:
  - balance simulation
  - RFC 8291 test vector
  - API/server tests (memory + SQLite)
  - full UI flow tests in offline and online modes
  - **real-server HTTP test**: starts the actual server process and plays through HTTP. Covers gzip, ETags, security headers, path traversal, the server re-checking battles, restart persistence, rate limits and account deletion.
  - recycling-data tool tests against copies of the real data.gov.sg formats
  - static checks (SHA-256, CSP safety, odds, no emoji, icons exist)

## Describing it accurately (for the report)
| Don't say | Say |
|---|---|
| "Verified BYO" | "Photo-checked on the device. Reduces cheating but can't prove a real BYO." |
| "Can't send the same picture twice" | "Rejects near-duplicate photos. Heavy crops or rotations can get through." |
| "Live 1v1 with nearby people" | "Asynchronous battles against nearby players' saved teams. Chosen for child safety." |
| "Shippable / production-ready" | "Working prototype, tested in simulation. Not yet deployed or field-tested." |
| "Legally compliant" | "Designed with reference to PDPC children's data guidance and MHA's pending blind-box rules. Not legal advice." |

Rules to keep:
- **Never** link a real-world reward to rarity or luck.
- Recheck the MHA blind-box rules and do an IPOS trademark search ("Skippies" and species names) before launch.
- Write a one-page DPIA (Data Protection Impact Assessment) before a real launch.

## Not yet verified (needs real devices / internet)
- How it looks in a real browser. Layouts were checked with code-level tests, not screenshots.
- Real push delivery (the encryption matches the RFC 8291 test vector)
- A live data.gov.sg download (only copies of its formats were tested)
- Scanner accuracy and speed on low-end phones
- iOS push, which needs iOS 16.4+ and the app added to the Home Screen
- The Docker build and a production deployment
