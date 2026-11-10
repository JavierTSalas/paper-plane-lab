# Deploying Paper Plane Lab

Hosting is Cloudflare Workers with static assets (docs/research/08-platform-leaderboard.md section 1).
Today the app is **static only**: the leaderboard runs on the device (`LocalLeaderboard`). The API
Worker in `worker/` is written and tested but **not deployed and not wired into `wrangler.jsonc`**.

## 1. Deploy the static app (now)

Prerequisites: Node 24, a Cloudflare account. Wrangler is not a project dependency; `npx` fetches it.

```sh
npm ci
npm run build              # tsc --noEmit && vite build  ->  dist/
npx wrangler login         # once per machine
npx wrangler deploy        # uploads dist/ as static assets, per wrangler.jsonc
```

`wrangler.jsonc` already holds the static config: `assets.directory = "./dist"` and
`not_found_handling = "single-page-application"` (unknown paths serve `index.html`; the app uses hash
routes anyway). `public/_headers` makes `/assets/*` immutable for a year; `index.html` keeps the default
caching. Static-asset requests are free and unlimited on Workers.

Without `VITE_LEADERBOARD_API` at build time the Ranks screen shows the player's own flights plus the
"Lab benchmark" reference flights computed in the browser.

## 2. Hook up the global leaderboard (later)

Do these in order. Nothing below is done yet.

1. **Workers Paid.** Server-side re-simulation of one flight takes tens to hundreds of ms of CPU (a long
   glide more), far above the Free plan's 10 ms per request. Measure on real flights before launch.
2. **Choose storage** and finish its adapter. Both are typed outlines that have never run against the
   real service:
   - **D1** (simplest, Cloudflare-native): `npx wrangler d1 create ppl`, add
     `"d1_databases": [{ "binding": "DB", "database_name": "ppl", "database_id": "<id>" }]`, apply
     `D1_SCHEMA` from `worker/d1.ts` as a migration (`npx wrangler d1 migrations create ppl init`, paste,
     `npx wrangler d1 migrations apply ppl --remote`), then use `new D1Repo(env.DB)`.
   - **DynamoDB** (owner's preference): table `PaperPlaneLab` (PK S, SK S, on-demand) with GSI `GSI1`
     (GSI1PK S, GSI1SK S, projection: keys plus `doc`). Key design is documented at the top of
     `worker/dynamo.ts`. Create a least-privilege IAM user (`dynamodb:Query`, `PutItem`, `DeleteItem`,
     `TransactWriteItems` on the table and `index/GSI1`). `npx wrangler secret put AWS_ACCESS_KEY_ID`,
     `npx wrangler secret put AWS_SECRET_ACCESS_KEY`, var `AWS_REGION`. Request signing (SigV4) needs
     `aws4fetch`, a new dependency that needs the lead's approval; inject it as the `DynamoCall`.
3. **Wire the Worker.** In `worker/index.ts`, replace the module-level `MemoryRepo` in the default
   export with the chosen repo (MemoryRepo loses everything when the isolate is recycled). Then add to
   `wrangler.jsonc`:
   ```jsonc
   "main": "./worker/index.ts",
   "assets": {
     "directory": "./dist",
     "binding": "ASSETS",
     "not_found_handling": "single-page-application",
     "run_worker_first": ["/api/*"]
   },
   "vars": { "ALLOWED_ORIGINS": "https://<your-domain>" }
   ```
   Wrangler bundles `worker/index.ts` and the shared `src/core` code itself; `npm run build` stays as is.
   (`@cloudflare/vite-plugin` is optional and would be a new dependency.)
4. **Turnstile.** Create a widget, `npx wrangler secret put TURNSTILE_SECRET`, and pass a `checkHuman`
   to `createHandler` that posts `secret`, `response` (the body's `turnstile` field) and `remoteip` to
   `https://challenges.cloudflare.com/turnstile/v0/siteverify`. Tokens are single use and live 300 s.
   The client does not send a token yet.
5. **Rate limits.** Add `"ratelimits": [{ "name": "SUBMIT", "namespace_id": "1001", "simple": { "limit": 10, "period": 60 } }]`
   (period must be 10 or 60) and pass an `allow` that calls `env.SUBMIT.limit({ key })`. The handler
   uses keys `submit:<player>` and `read`.
6. **Point the app at it.** Build with `VITE_LEADERBOARD_API=https://<your-domain> npm run build`
   (same origin works too). The UI passes it to `createLeaderboard({ apiBase, storage, presets })`,
   which then posts to `/api/leaderboard` and falls back to the local board when offline.
7. Deploy: `npm run build && npx wrangler deploy`. Smoke test:
   `curl "https://<your-domain>/api/leaderboard?category=distance&arena=open"` returns `{"entries":[]}`.

## 3. What the API does and does not do

- Verifies every submission by re-folding the design and re-simulating the flight on the server
  (`verifyTicket`, shared with the client), checks arena rules (hangar, still air, speed cap, one known
  sheet, no clip, trim and step limits, 16 KiB body), and stores the **server** score and design hash.
- Refuses a client on another `ENGINE_VERSION` (409). Bump `ENGINE_VERSION` in
  `src/core/leaderboard/arenas.ts` whenever physics changes; the board partition includes it, so old
  scores drop off the boards.
- Not done: player identity (names are free text, de-duplicated case-insensitively; no accounts), the
  Turnstile and rate-limit hooks are not connected, no pagination, no exact rank query, no audit log of
  rejected runs, no KV/Cache top-N caching. Cross-engine determinism is not guaranteed (the simulator uses
  `Math.sin` and friends), so verification relies on the 0.5 % / 2 cm / 20 ms tolerance; a long chaotic
  flight could, rarely, be refused on a different JavaScript engine.
