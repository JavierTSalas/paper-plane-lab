# 08: Platform, hosting, leaderboard backend and mobile WebGL

Research date: 2026-11-09. Scope: Cloudflare hosting for the Vite + React + TypeScript SPA, a future global leaderboard (storage-agnostic, DynamoDB-ready), anti-cheat for a deterministic physics leaderboard, mobile Three.js practice, PWA and light CI. Claims are tagged [S#] (see **Sources**). Anything tagged *(unverified - model knowledge)* could not be confirmed online during this session.

> **Access note.** In this session `developers.cloudflare.com`, MDN, threejs.org, playwright.dev, AWS docs and redbull.com could not be reached directly. Cloudflare, MDN, three.js, Playwright, Vite, vite-plugin-pwa, ECMA-262 and Chromium documentation were read from their official source repositories on GitHub. These are the same Markdown files that build the public pages, and the canonical page URL is listed next to each source. The DynamoDB pages came from the archived official `awsdocs` GitHub repository, so treat them as a snapshot from about 2023. The web-search quota ran out before Red Bull Paper Wings could be checked, so section 4 is unverified.

## Summary for implementers

1. **Host on Workers with static assets, not Pages.** Cloudflare's Pages docs now say: "Start new projects with Workers." [S1]. Use `wrangler.jsonc` [S7] with `assets.not_found_handling = "single-page-application"` [S3].
2. **Ship static-only now.** Static-asset requests are free and unlimited [S9]. For build and deploy, run `vite build` → `dist/`, then `npx wrangler deploy`. Add `public/_headers` with `/assets/*  Cache-Control: public, max-age=31536000, immutable` [S4][S51].
3. **API later.** Add a Worker `main` with `run_worker_first: ["/api/*"]` [S3]. Do not use Pages Functions (Pages has no Rate Limiting binding, no Cron and no Workers Logs [S2]).
4. **Leaderboard storage.** Code against a `LeaderboardRepo` interface now and ship an in-memory or offline implementation. For DynamoDB, use one item per (player, board) and a GSI with `GSI1PK = boardKey` and `GSI1SK = score`, queried with `ScanIndexForward=false, Limit=N`. This is AWS's own GameScores/GameTitleIndex pattern [S26][S27]. Call DynamoDB with `aws4fetch` and keep credentials as Worker secrets [S25][S22].
5. **Anti-cheat.** The server re-simulates (design fold-sequence, throw, environment id, seed, engine version) and its score is the only one stored. Bit-exact replay needs the sim to use only `+ − × ÷`, `Math.sqrt`, `Math.abs/min/max/floor/fround/imul` (exact per spec). Do not use `Math.sin/cos/exp/log/pow/atan2/hypot/**` (they are "implementation-approximated" [S31] and differ by engine and OS [S33][S34]); ship our own polynomial versions instead.
6. **CPU budget.** The Workers Free plan allows 10 ms CPU per request [S8]. A full 6-DOF re-sim will almost certainly need Workers Paid (default 30 s, max 5 min; $5/month minimum) [S8][S9].
7. **Mobile WebGL.** Use WebGL2 only (three r163+ dropped WebGL 1) [S42]. Cap the pixel ratio at 2 and the pixel count. Use no real-time shadow maps on phones; a fake blob shadow is enough [S39]. Use `InstancedMesh` for repeated props, dispose everything [S38], handle `webglcontextlost` [S45], and lazy-load the `three` chunk.
8. **PWA.** It's worth doing late and cheaply with `vite-plugin-pwa` (`generateSW`), as long as `sw.js` and `index.html` are never cached immutably [S48].
9. **CI.** One job on `ubuntu-latest`, Node 24: `npm ci` → typecheck → `vitest run` → `vite build`. No browser tests in CI.

---

## 1. Hosting a Vite static SPA on Cloudflare

### 1.1 Pages vs Workers static assets (2026)

| Aspect | Workers + static assets | Pages |
|---|---|---|
| Cloudflare guidance | "Cloudflare's primary platform for building applications. Start new projects with Workers." [S1] | Still supported; the docs open with "Are you sure you want to use Pages?" [S1] |
| Static-asset requests | Free and unlimited [S9] | Free [S2] |
| SPA fallback | Explicit: `assets.not_found_handling: "single-page-application"` [S2][S3] | Implicit: if there is no top-level `404.html`, Pages serves `/` for unknown paths [S10] |
| Cloudflare Vite plugin, gradual deploys, Workers Logs, source maps, Cron, Rate Limiting binding, Queue consumers | ✅ [S2] | ❌ [S2] |
| Durable Objects | ✅ | Workaround only (separate Worker) [S2] |
| `_headers` / `_redirects` | ✅ native [S2] | ✅ |
| Custom domain outside a Cloudflare zone | ❌ [S2] | ✅ [S2] |
| Dev / deploy commands | `wrangler dev` (port 8787) / `wrangler deploy` [S2] | `wrangler pages dev` (8788) / `wrangler pages deploy` [S2] |

The one Pages advantage that matters here is a custom domain whose DNS is *not* on Cloudflare. If the owner's domain will live on Cloudflare (or `*.workers.dev` is fine), use Workers.

### 1.2 Config file

Wrangler accepts `wrangler.jsonc`, `wrangler.json` or `wrangler.toml`. "Cloudflare recommends using `wrangler.jsonc` for new projects, and some newer Wrangler features will only be available to projects using a JSON config file." [S7]. The two mandatory fields are `name` and `compatibility_date` (set it to the current date) [S2].

**Now (static only, no Worker script):**

```jsonc
// wrangler.jsonc
{
  "name": "paper-plane-lab",
  "compatibility_date": "2026-11-09",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  }
}
```

Keep the config assets-only: `"binding": "ASSETS"` is only valid when a `main` Worker script exists [S2].

**Later (with API Worker, via `@cloudflare/vite-plugin`):** the plugin reads the config and ignores `assets.directory`. The build writes the client to `dist/client` plus an output `dist/wrangler.json`, which `wrangler deploy` uses [S5]. Plugin setup is `plugins: [react(), cloudflare({ viteEnvironment: { name: "worker" } })]` [S5]. The Cloudflare docs also mention a newer `cf` CLI and Vite+ toolchain [S6]. They are optional; the framework guide still documents `wrangler deploy` [S5].

### 1.3 SPA fallback routing

- With `single-page-application` mode, an unmatched request is served `/index.html` with **200 OK** [S3].
- When a Worker script exists, `compatibility_date >= 2025-04-01` means *navigation* requests (`Sec-Fetch-Mode: navigate`) never invoke the Worker. They are served `index.html`, which reduces billed invocations. Client `fetch("/api/…")` still reaches the Worker [S3-nav].
- For explicit control use `"run_worker_first": ["/api/*"]` (Wrangler ≥ 4.20.0, Vite plugin ≥ 1.7.0). This disables the navigation-header heuristic [S3].

### 1.4 Build command and output

| Setting | Value | Source |
|---|---|---|
| Build command | `npm run build` (`tsc -b && vite build` or `vite build`) | Pages preset "React (Vite)" [S11] |
| Output directory | `dist` (Vite `build.outDir` default) | [S11][S51] |
| Hashed asset folder | `dist/assets/` (Vite `build.assetsDir` default `assets`) | [S51] |
| Vite 8 default browser target | `chrome111, edge111, firefox114, safari16.4, ios16.4` | [S51] |
| Deploy | `npx wrangler deploy` (or Workers Builds Git integration with that deploy command) | [S2][S5] |

### 1.5 Cache headers

The default on every static asset is `Cache-Control: public, max-age=0, must-revalidate` plus an `ETag` hash [S4]. That is correct for `index.html`, `sw.js` and `manifest.webmanifest`, so leave those alone. Fingerprinted files can be made immutable through `public/_headers`, which Vite copies to the root of `dist`:

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

Cloudflare's own example uses `max-age=31556952, immutable` (one Gregorian year) [S4]; either value works. `_headers` limits: 100 rules, 2,000 characters per line [S4][S8]. `_headers` is **not** applied to responses generated by Worker code, so `/api/*` must set its own headers, including CORS and `OPTIONS` [S4].

### 1.6 Relevant platform limits

| Limit | Free | Paid | Source |
|---|---|---|---|
| Static files per version | 20,000 | 100,000 | [S8] |
| Max single asset | 25 MiB | 25 MiB | [S8] |
| Worker requests | 100,000/day | 10 M/month incl., +$0.30/M | [S8][S9] |
| CPU per HTTP request | 10 ms | 30 s default, 5 min max | [S8] |
| CPU billing | n/a | 30 M CPU-ms/month incl., +$0.02/M CPU-ms | [S9] |
| Subrequests per invocation | 50 | 10,000 | [S8] |
| Memory | 128 MB | 128 MB | [S8] |
| Request body (zone Free/Pro) | 100 MB | 100 MB | [S8] |

---

## 2. Adding an API and a global leaderboard later

### 2.1 Pages Functions vs a Worker fetch handler

Pages Functions (`functions/` file-based routing) are billed exactly like Workers [S9]. However, Pages lacks the Rate Limiting binding, Cron Triggers, Workers Logs and first-class Durable Objects [S2]. Cloudflare also suggests compiling an existing `functions/` folder into a Worker when migrating [S2]. **Decision: a single Worker** (`worker/index.ts`, routes under `/api/*`) next to the static assets. The Worker runs on V8 isolates [S24], which matters for determinism (§3).

### 2.2 Storage options for a leaderboard

| Store | Consistency | Key facts for leaderboards | Fit |
|---|---|---|---|
| **Workers KV** | Eventually consistent: changes "may take up to 60 seconds or more" to appear elsewhere [S17] | 1 write/s **per key**; Free plan 1,000 writes/day; min `cacheTtl` 30 s [S16] | ❌ as primary store; ✅ as a cache of top-N JSON snapshots |
| **D1** (SQLite) | Single primary + read replication [S13] | `ORDER BY … LIMIT`, `COUNT(*)` rank; Free plan 5 M rows read/day, 100 k rows written/day; Paid 25 B reads, 50 M writes/month incl. [S15]; 10 GB/DB Paid, 500 MB Free; 100 bound params/query [S14] | ✅ simplest Cloudflare-native choice |
| **Durable Objects** (SQLite-backed) | Strongly consistent, serialized per object [S13] | Available on Free (SQLite backend only) [S19]; 10 GB per object; 30 s CPU/request [S18]; Free 100 k requests/day [S19] | ✅ if real-time "live board" or strict ordering is ever needed |
| **AWS DynamoDB** (via HTTPS) | Base table: your choice; **GSI: eventually consistent**, "within a fraction of a second" normally [S26] | 400 KB max item; PK ≤ 2048 B, SK ≤ 1024 B; 20 GSIs/table default [S29]; Query ≤ 1 MB/page [S27]; partition ≤ 3,000 RCU / 1,000 WCU [S28] | ✅ owner's stated preference; adds AWS account, IAM, cross-cloud latency |

### 2.3 Calling DynamoDB from a Worker

- **`aws4fetch`** (v1.0.20) is about 2.5 kB gzipped and uses `fetch` + `SubtleCrypto`, which makes it a natural fit for Workers [S25]. DynamoDB's low-level protocol is a signed `POST /` to `dynamodb.<region>.amazonaws.com` with headers `Content-Type: application/x-amz-json-1.0` and `X-Amz-Target: DynamoDB_20120810.<Operation>` and a JSON body [S30]. Set `retries` explicitly to 2 or 3. The default is **10** retries with backoff starting at 50 ms [S25], which can exhaust the 50-subrequest Free limit [S8].
- **AWS SDK v3** works in Workers with the `nodejs_compat` flag. Cloudflare documents this for the S3 client and notes bundling caveats [S23]. It's heavier; prefer aws4fetch.
- **Credentials:** `wrangler secret put AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (and `AWS_REGION` as a plain var). Use `.dev.vars` locally. Declaring required secret names in config makes `wrangler deploy` fail if they are missing [S22]. Use an IAM user scoped to `dynamodb:GetItem/PutItem/UpdateItem/Query/TransactWriteItems` on the table and `…/index/GSI1` ARNs *(unverified - model knowledge, standard IAM practice)*.

```ts
// pseudocode
const aws = new AwsClient({ accessKeyId, secretAccessKey, region, service: "dynamodb", retries: 2 });
await aws.fetch(`https://dynamodb.${region}.amazonaws.com/`, { method: "POST",
  headers: { "Content-Type": "application/x-amz-json-1.0", "X-Amz-Target": "DynamoDB_20120810.Query" },
  body: JSON.stringify({ TableName, IndexName: "GSI1", KeyConditionExpression: "GSI1PK = :b",
    ExpressionAttributeValues: { ":b": { S: boardKey } }, ScanIndexForward: false, Limit: 50 }) });
```

### 2.4 Storage-agnostic repository interface (server side)

```ts
type BoardKey = string;               // "v1|distance|gym|A4|all"
interface BoardEntry { board: BoardKey; playerId: string; displayName: string;
  score: number /* integer: mm or ms */; runId: string; designHash: string; createdAt: number }
interface LeaderboardRepo {
  putRun(run: RunRecord): Promise<"created" | "duplicate">;          // idempotent by runId
  submitBest(e: BoardEntry): Promise<{ improved: boolean; previous?: number }>;
  top(board: BoardKey, limit: number, cursor?: string): Promise<{ items: BoardEntry[]; cursor?: string }>;
  rank(board: BoardKey, playerId: string): Promise<{ rank: number; exact: boolean } | null>;
  getBest(board: BoardKey, playerId: string): Promise<BoardEntry | null>;
}
```

Implementations: `MemoryRepo` (unit tests, `wrangler dev`), `D1Repo`, `DynamoRepo`. On the client, a `LeaderboardClient` interface with an `OfflineLeaderboardClient` keeps personal bests locally until `/api` exists. Store scores as **integers** (distance in mm, airtime in ms) so encoding, ties and comparisons are exact.

### 2.5 DynamoDB single-table design

**Board key:** `B#v{rulesVer}#{category}#{env}#{paper}#{period}`, where `period ∈ {all, 2026-11, 2026-W46}`. Example: `B#v1#distance#gym#A4#all`. Each accepted run updates one board per period (3 writes).

| Entity | PK | SK | GSI1PK | GSI1SK | Notes |
|---|---|---|---|---|---|
| Run (immutable audit) | `RUN#{runId}` | `RUN` | – | – | canonical submission JSON, server score, engine ver; `runId = SHA-256(canonical submission)` |
| Personal best per board | `P#{playerId}` | `{boardKey}` | `{boardKey}` | score-key (S) | one item per player per board, overwritten only on improvement |
| Design | `D#{designHash}` | `D` | – | – | canonical fold sequence, name, preset id, first author |
| Rank histogram bucket | `H#{boardKey}` | `{bucket:04d}` | – | – | `count` (atomic `ADD`) |

This is AWS's documented leaderboard pattern: base items keyed by user, plus a GSI whose partition key is the game and whose sort key is the score, queried in descending order [S26]. GSI keys need not be unique [S26]. Use a **string** score-key so ties break deterministically: `GSI1SK = zeroPad(score, 10) + "#" + zeroPad(9_999_999_999_999 − createdAtMs, 13)`. With `ScanIndexForward=false`, the higher score comes first and, at equal score, the *earlier* submission does.

**Query patterns**

| Need | Operation |
|---|---|
| Top-N | `Query GSI1: GSI1PK = :board`, `ScanIndexForward=false`, `Limit=N` (paginate with `LastEvaluatedKey`) [S27] |
| My best | `GetItem PK=P#me, SK=:board` |
| Exact rank | `Query GSI1: GSI1PK = :board AND GSI1SK > :myKey`, `Select=COUNT` → `rank = Σ Count + 1`. This reads every entry above you, 1 MB per page [S27]. GSI reads cost 0.5 RCU per 4 KB [S26] |
| Approx. rank (large boards) | `Query PK=H#{board}` (all buckets in one page) → `rank ≈ 1 + Σ_{buckets above} count + within-bucket fraction` |
| Around me | two GSI queries from `:myKey`, one in each direction, `Limit=k` |
| Submit | 1) `PutItem RUN` with `attribute_not_exists(PK)` (dedupe). 2) Per board, `UpdateItem P#…` with `ConditionExpression: attribute_not_exists(PK) OR score < :new`. 3) On improvement, `ADD count -1` to the old bucket and `+1` to the new one, using `TransactWriteItems` for 2+3 *(transaction item cap: unverified)* |

Bucket widths (design choice): distance 0.25 m over 0–150 m (600 buckets), airtime 0.05 s over 0–60 s (1,200 buckets). Use exact rank when the player is in the top about 1,000, approximate rank otherwise. A hot board partition throttles above 1,000 writes/s [S28], far beyond expected load. If that ever binds, shard `GSI1PK` with `#s0..#s{k−1}` and merge top-N client-side.

**D1 equivalent** (same interface; SQLite UPSERT syntax is *unverified - model knowledge*):

```sql
CREATE TABLE best(board TEXT, player_id TEXT, score INTEGER, created_at INTEGER, run_id TEXT,
  PRIMARY KEY(board, player_id));
CREATE INDEX best_rank ON best(board, score DESC, created_at ASC);
-- top-N:   SELECT * FROM best WHERE board=?1 ORDER BY score DESC, created_at ASC LIMIT ?2;
-- rank:    SELECT COUNT(*)+1 FROM best WHERE board=?1 AND (score>?2 OR (score=?2 AND created_at<?3));
-- submit:  INSERT … ON CONFLICT(board,player_id) DO UPDATE SET … WHERE excluded.score > best.score;
```

D1 bills index rows scanned as rows read [S15], so the rank query costs O(rank) rows, the same scaling as DynamoDB.

---

## 3. Anti-cheat for a deterministic physics leaderboard

### 3.1 Server-authoritative re-simulation

The client submits **inputs only**:

```
{ engineVer, rulesVer, design: foldSequence(quantised ints), paper: {size, colorIds}, throw: {speed_mm_s, pitch_cdeg, yaw_cdeg, roll_cdeg, height_mm}, envId, seedTicket, claimed: {score, trajectoryHash}, turnstileToken }
```

The Worker then does five things:

1. It rejects an unknown `engineVer` or `rulesVer`.
2. It re-runs the **fold pipeline** from the fold sequence. Client geometry is never trusted.
3. It clamps or rejects throws outside the allowed human envelope.
4. It re-simulates with the server-known seed.
5. It stores the **server score only**.

A modified client therefore cannot change a score. It can only choose inputs, so the remaining cheat vectors are input-level:

| Vector | Countermeasure |
|---|---|
| Seed shopping (re-throwing until a lucky gust) | The server issues the seed. Either use a daily seed per board (`seed = H(boardKey, date)`), so everyone flies the same air, or score outdoor boards as the **mean over K server-chosen seeds** (K = 3–5) |
| Impossible geometry / throws | Re-fold from the sequence and validate fold count, flap limits and the throw envelope |
| Spam / bots | Turnstile + rate limiting (§3.4) |
| Duplicate submissions | `runId = SHA-256(canonical JSON)`, written with a conditional put |
| "Concomitant" (identical) designs | `designHash = SHA-256(quantised final layer geometry)`. Equivalent fold orders collapse to one hash, so boards can show "same plane as *Classic Dart*" and group variants |

### 3.2 Floating-point determinism of JavaScript

| Operation | Spec status | Cross-engine bit-reproducible? |
|---|---|---|
| `+ − × ÷` on Numbers | IEEE 754-2019 binary64, result = exact value rounded to nearest, ties-to-even, per operation [S31] | ✅ yes. The spec defines each op's rounded result, so fused multiply-add contraction is not permitted |
| `Math.sqrt` | `𝔽(√n)`, correctly rounded [S31] | ✅ |
| `Math.abs, min, max, floor, ceil, round, trunc, sign, fround, imul, clz32` | exactly specified [S31] | ✅ |
| `Math.sin cos tan asin acos atan atan2 sinh cosh tanh asinh acosh atanh exp expm1 log log1p log2 log10 cbrt hypot pow` and `**` | **"implementation-approximated"** [S31]. fdlibm is recommended, not required [S31] | ❌ not guaranteed |

**Engine evidence.** V8 ships an fdlibm-derived `ieee754` library. V8 moved `asin`/`acos` off the OS libm because results differed by OS [S32][S33]. Cloudflare Workers run V8 [S24]. SpiderMonkey has switched between fdlibm and the OS libm over the years. A 2026 bug reports libm `pow` giving a **1-ulp different** result on some Android ARM devices, fixed by always calling `fdlibm_pow` [S34]. A Linux-vs-Windows `Math.tan(-1e300)` difference is also recorded [S34]. JavaScriptCore (all iOS browsers) is believed to use the platform libm *(unverified - model knowledge)*. Conclusion: an iPhone and a V8 Worker **cannot be assumed** to agree bit-for-bit if the sim calls `Math.sin`. Flight with turbulence is chaotic, so a 1-ulp difference can grow into a visibly different landing point.

### 3.3 Mitigations (in priority order)

1. **Deterministic math module (`detmath.ts`).** Use our own `sin, cos, atan2, exp, log, pow` built from `+ − × ÷ sqrt` only: range reduction plus fixed minimax/Taylor polynomials, accurate to about 1e-15 relative error. The physics core must import only these, enforced by an ESLint `no-restricted-properties` rule on `Math.sin` and the rest. Rendering code can use the native functions.
2. **Integer PRNG.** Use something like `mulberry32`/`xoshiro128**`, built on `Math.imul` and `>>> 0` (exact [S31]). Never use `Math.random` in the sim.
3. **Fixed `dt`, fixed iteration order, no time sources** (`Date.now`, `performance.now`) in the sim. Quantise all inputs to integers before simulating.
4. **Golden-trajectory tests.** Vitest snapshots of state hashes at t = 0.5, 1, 2, 5 s for each preset. Run them locally in Chromium, Firefox and WebKit occasionally, not in CI.
5. **Tolerance as a safety net, not the mechanism.** Accept if `|s_srv − s_cli| ≤ max(ε_abs, ε_rel·|s_srv|)`, with ε_abs = 10 mm (distance) or 10 ms (airtime) and ε_rel = 1e-3 (design choice). On mismatch, still store `s_srv` and log an "engine divergence" event with both trajectory hashes. Never reject the player for a mismatch.

### 3.4 Rate limiting, bot checks, payload limits

| Control | Value | Source |
|---|---|---|
| Turnstile token | ≤ 2048 chars, valid 300 s, **single use** (replay → `timeout-or-duplicate`); verify at `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` with `secret`, `response`, optional `remoteip`, `idempotency_key` | [S21] |
| Workers Rate Limiting binding | `ratelimits: [{ name, namespace_id, simple: { limit, period } }]`. `period` must be **10 or 60** s. Approximate, per Cloudflare location; Wrangler ≥ 4.36.0 | [S20] |
| Suggested limits (design choice) | `submit:{playerId}` 10/60 s; `submit:{ip}` 30/60 s; `read:{ip}` 120/60 s | – |
| Body size | The platform allows 100 MB [S8], so the app must enforce its own cap: reject `Content-Length > 16384` and stop reading after 16 KiB → `413`. A design of ≤ 64 folds fits in about 4 KB | [S8] + design choice |
| Leaderboard item | DynamoDB ≤ 400 KB/item [S29]; D1 ≤ 2 MB/row [S14] | |

### 3.5 CPU budget for re-simulation

`CPU_ms ≈ (T_flight / dt) × evals_per_step × N_elements × t_element`. Example: T = 30 s, dt = 1 ms, RK4 (4 evals/step), N = 40 strips, t ≈ 30–100 ns each → **≈ 140–480 ms** *(estimate, unverified; measure with `vitest bench`)*. That is far above the Free plan's 10 ms/request [S8], so the leaderboard needs **Workers Paid** (30 s default) [S8]. At 300 ms × 10,000 submissions per month = 3 M CPU-ms, usage stays within the included 30 M CPU-ms [S9]. K-seed scoring multiplies this by K.

---

## 4. How real competitions rank (motivation for categories)

*Everything in this section is unverified (model knowledge). The web-search quota ran out and redbull.com / guinnessworldrecords.com were unreachable.* Red Bull Paper Wings is an international student paper-plane contest whose world finals were held at Hangar-7, Salzburg. It has three disciplines: **Longest Distance**, **Longest Airtime** and **Aerobatics** (a judged freestyle routine). Planes are folded from one standard sheet of A4 paper, with no cutting, tape or glue. Guinness lists separate records for distance (about 69 m in 2012, then about 77 m in 2022) and time aloft (about 27–29 s). Re-check before quoting any of these numbers in the UI.

| Leaderboard category | Metric (integer stored) | Objective in sim? | Notes |
|---|---|---|---|
| Distance | horizontal distance launch → first ground contact (mm) | ✅ | Red Bull "Longest Distance" analogue |
| Airtime | release → first ground contact (ms) | ✅ | Red Bull "Longest Airtime" analogue; reward low sink rate |
| Accuracy | miss distance to target (mm, lower is better: store `−miss`) | ✅ | fun indoor mode |
| Glide efficiency | best steady L/D from the wind tunnel (×1000) | ✅ | design-only board, needs no seed |
| Aerobatics | loops, rolls, heading change (scored formula) | ⚠️ judged in reality | Replace judges with a transparent formula, or keep it unranked |

Board dimensions: category × environment (`classroom`, `gym`, `outdoor-calm`, `outdoor-breezy`, …) × paper size (`A4`, `Letter`, …) × period (`all`, month, week). Keep the **indoor still-air** boards as the "fair" canonical competition. Use the daily seed for outdoor boards.

---

## 5. Mobile WebGL / Three.js practice (three r187, 2026)

| Practice | Do this | Source |
|---|---|---|
| WebGL version | WebGL2 only. Since r163, `WebGLRenderer` throws on WebGL 1. Check with `WebGL.isWebGL2Available()` and fall back to an **SVG 2-D trajectory view**, which the renderer-independent physics core makes free | [S40][S42] |
| WebGPU | `WebGPURenderer` (import `three/webgpu`) falls back to WebGL2 automatically, and `forceWebGL: true` is available. Stay on `WebGLRenderer` for now and revisit later | [S41] |
| Pixel ratio | Never render at raw DPR 3 (9× the pixels). Size the canvas yourself: `min(devicePixelRatio, 2)` (*cap value is a design choice*) **and** a max pixel count (three's sample caps at 3840×2160). Lower the cap adaptively if frame time stays above 20 ms. Use `ResizeObserver` with `device-pixel-content-box` for exact sizes | [S37][S43] |
| Smaller back buffer | Render below native resolution and let CSS upscale | [S43] |
| powerPreference | Default `'default'`; values `'default' / 'high-performance' / 'low-power'` are only hints. Keep the default and don't set `failIfMajorPerformanceCaveat: true` unless you have a 2-D fallback | [S42][S44] |
| Shadows | A shadow map re-renders the scene once per shadow-casting light (6× for a point light). On phones use a **fake blob shadow** (textured quad under the plane, scaled and faded by height), which also helps depth perception. Allow at most one directional shadow on desktop | [S39] |
| Draw calls | Batch work: `InstancedMesh` for desks, chairs, grass and trees; texture atlases | [S43] |
| Idle | Render on demand in fold and menu screens, and stop the rAF loop when the flight view is hidden | three manual "Rendering on demand" [S38] |
| Dispose | Geometries, materials, textures and render targets are **not** freed automatically. Call `.dispose()` on scene teardown and `ImageBitmap.close()` for bitmap textures | [S38] |
| Context loss | `webglcontextlost` can fire on GPU memory pressure. three attaches listeners itself. The app should pause the render loop, keep the sim state (it lives outside the renderer), show a "tap to restore" overlay, and rebuild GPU resources on `webglcontextrestored` | [S42][S43][S45] |
| Avoid | `alpha:false` (can be expensive), `preserveDrawingBuffer`, and `getError` / `getParameter` in the frame loop (sync stalls of about 1 ms) | [S43] |
| Lazy-load three | Keep onboarding, fold (SVG) and menus three-free, and load the flight scene through `React.lazy(() => import("./flight/FlightScene"))` so Vite emits a separate chunk. The unminified r187 `three.core.js` + `three.module.js` measure **2.13 MB raw / 419 KB gzip** (upper bound; minified and tree-shaken builds are smaller). Vite warns at 500 kB per chunk | [S51][S56] |

**Headless WebGL tests (local, optional).** Chromium's automatic SwiftShader fallback is deprecated, so WebGL context creation *fails* unless you opt in. The documented flags are `--use-gl=angle --use-angle=swiftshader` (GL driver) or `--use-gl=angle --use-angle=swiftshader-webgl --enable-unsafe-swiftshader` (WebGL fallback). They are meant for trusted content only [S35]. Playwright runs the separate *chromium headless shell* by default. `channel: 'chromium'` selects "new headless", which is the real Chrome browser [S36]. A smoke test (`launchOptions.args` = the flags above) should assert that `canvas.getContext('webgl2')` is non-null and that a frame is non-blank. Keep it out of the default CI job.

---

## 6. PWA: is it worth it?

**Yes, as a late, small task.** The physics runs entirely on the client, so offline play is natural.

- Installability on Chromium needs a manifest with `name`/`short_name`, `icons` at **192 px and 512 px**, `start_url`, `display` (or `display_override`), and `prefer_related_applications` absent or `false`. It must be served over HTTPS (or localhost) [S46]. iOS 16.4+ allows install from the Share menu in Safari, Chrome, Edge, Firefox and Orion. Firefox desktop doesn't install manifest PWAs. On Android, true WebAPK install happens only in Chrome (with GMS) and Samsung Internet [S46].
- `vite-plugin-pwa` 2.0.0 (peer `vite ^8`, Node ≥ 20.19) generates the manifest, a Workbox service worker (`generateSW`) and its registration with `VitePWA({ registerType: 'autoUpdate' })` [S47][S55]. By default it precaches only `js, css, html`. Add `svg, png, woff2` through `workbox.globPatterns` [S49]. Workbox skips files above `maximumFileSizeToCacheInBytes` = **2,097,152 B** by default [S50], so check that the three chunk stays below it.
- Never cache `/`, `/index.html`, `/sw.js` or `/manifest.webmanifest` with `immutable` [S48]. Cloudflare's default `max-age=0, must-revalidate` [S4] already satisfies this. Exclude `/api/*` from runtime caching, and queue leaderboard submissions while offline.

---

## 7. Light CI (GitHub Actions)

Current majors: `actions/checkout@v7`, `actions/setup-node@v7` [S52][S53]. Node 24 is LTS (maintenance since 2026-10-20) and Node 26 is Active LTS since 2026-10-28 [S54]. Use **24**, which satisfies Vite 8 (`^20.19 || >=22.12`), Vitest 5 (`^22.12 || ^24 || >=26`) and Wrangler (`>=22.12`) [S55].

```yaml
# .github/workflows/ci.yml
name: ci
on: { push: { branches: [main] }, pull_request: {} }
permissions: { contents: read }
concurrency: { group: "ci-${{ github.ref }}", cancel-in-progress: true }
jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run typecheck      # tsc --noEmit (or tsc -b)
      - run: npx vitest run         # unit + golden-trajectory tests, no browser
      - run: npm run build
```

No Playwright, no deploy, no matrix. Deploys go through Workers Builds (Git integration) or a manual `npx wrangler deploy`.

---

## 8. RECOMMENDATIONS / CONSTANTS

**Use now**

| Item | Value |
|---|---|
| Hosting | Cloudflare **Workers static assets**, `wrangler.jsonc` (§1.2), `not_found_handling: "single-page-application"` |
| Build / output | `npm run build` → `dist/`; deploy `npx wrangler deploy` |
| Cache | `public/_headers`: `/assets/*  Cache-Control: public, max-age=31536000, immutable`; leave all other paths at the default |
| Versions seen on npm 2026-11-09 | vite 8.3.7, @cloudflare/vite-plugin 1.68.0, wrangler 4.159.0, three 0.187.0, vitest 5.1.0, vite-plugin-pwa 2.0.0, @playwright/test 1.65.0, typescript 7.0.2, react 19.3.1, aws4fetch 1.0.20 [S55] |
| Renderer | `WebGLRenderer` (WebGL2), DPR cap 2, pixel cap ≈ 2.1 Mpx on phones (≈ 1920×1080; design choice), no shadow maps on mobile, blob shadow, instancing, lazy `three` chunk, SVG fallback |
| Determinism | `detmath.ts` (no `Math.sin`-class calls in the sim), integer PRNG, fixed `dt`, integer-quantised inputs, `engineVer` string in every saved run |
| Scores | integers: distance mm, airtime ms, L/D × 1000 |
| Board key | `B#v{rulesVer}#{category}#{env}#{paper}#{period}` |
| Leaderboard code | `LeaderboardRepo` interface + `MemoryRepo`; client `OfflineLeaderboardClient` (local personal bests) |
| CI | one job: `npm ci` → typecheck → `vitest run` → build, Node 24 |

**Hookup steps for later**

1. `npm i -D @cloudflare/vite-plugin` and add `cloudflare()` to `vite.config.ts`. Create `worker/index.ts` and add `"main": "./worker/index.ts"`, `"assets": { "binding": "ASSETS", "run_worker_first": ["/api/*"], "not_found_handling": "single-page-application" }` [S3][S5].
2. Turnstile: create a widget, then `wrangler secret put TURNSTILE_SECRET` and verify on every submit [S21].
3. Add the `ratelimits` bindings (`period` 10 or 60) [S20]. Move to **Workers Paid** before enabling server re-simulation [S8][S9].
4. **DynamoDB path.** Create table `PaperPlaneLab` (PK S, SK S, on-demand) and GSI `GSI1` (GSI1PK S, GSI1SK S, projection INCLUDE `displayName, score, designHash, runId`). Create a least-privilege IAM user. Run `wrangler secret put AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, set var `AWS_REGION` (pick a region near most players), then implement `DynamoRepo` with aws4fetch (`retries: 2`).
5. **D1 path (alternative).** Run `wrangler d1 create ppl`, add the `d1_databases` binding, apply the §2.5 schema migration and implement `D1Repo`.
6. Optional: cache top-50 JSON per board in KV or the Workers Cache for 30–60 s [S16].
7. PWA: add `vite-plugin-pwa`, the manifest (192 and 512 icons) and globPatterns, and check the three chunk is ≤ 2 MiB.

---

## Open questions and limits

- **Red Bull Paper Wings rules and Guinness record values** are unverified (search quota exhausted, sites unreachable). Verify before showing them in the UI.
- **JavaScriptCore Math implementation** (Safari/iOS) was not confirmed. The `detmath.ts` approach makes this moot, but the golden tests should still be run once in WebKit.
- **Re-simulation CPU cost** is an estimate. Benchmark the real engine before choosing K (multi-seed scoring) and `dt`.
- **DynamoDB docs** come from the archived 2023 GitHub snapshot. Re-check current quotas (`TransactWriteItems` item cap, GSI features) in the live console before building. Cross-cloud latency from Cloudflare edge to an AWS region was not measured.
- **The new Cloudflare `cf` CLI / Vite+** appear in the docs [S6]. Wrangler remains the documented path. Re-check before scaffolding.
- **The SPA's custom domain** decides Pages vs Workers only if its DNS is not on Cloudflare [S2].

---

## Sources

Cloudflare pages were read from `github.com/cloudflare/cloudflare-docs` (branch `production`, path `src/content/…`), which builds the canonical pages. Base for raw sources: `https://raw.githubusercontent.com/cloudflare/cloudflare-docs/production/src/content/`.

1. [S1] Cloudflare Pages overview, note "Are you sure you want to use Pages?": https://developers.cloudflare.com/pages/ (partial `partials/pages/workers-for-new-projects.mdx`)
2. [S2] Migrate from Pages to Workers + compatibility matrix: https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/ (`docs/workers/static-assets/migration-guides/migrate-from-pages.mdx`)
3. [S3] Workers static assets, Single Page Application: https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/ (and [S3-nav] partial `partials/workers/navigation_requests.mdx`)
4. [S4] Workers static assets, Headers: https://developers.cloudflare.com/workers/static-assets/headers/
5. [S5] Workers framework guide React + Vite, and Vite plugin partials (`partials/workers/vite-plugin/*.mdx`): https://developers.cloudflare.com/workers/framework-guides/web-apps/react/
6. [S6] Cloudflare Vite plugin overview and Vite+ page: https://developers.cloudflare.com/workers/vite-plugin/ , https://developers.cloudflare.com/workers/vite-plugin/vite-plus/
7. [S7] Wrangler configuration: https://developers.cloudflare.com/workers/wrangler/configuration/
8. [S8] Workers limits: https://developers.cloudflare.com/workers/platform/limits/
9. [S9] Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
10. [S10] Pages serving behaviour (SPA rendering): https://developers.cloudflare.com/pages/configuration/serving-pages/
11. [S11] Pages build configuration + presets (`src/content/pages-framework-presets/index.yaml`: React (Vite) → `npm run build`, `dist`): https://developers.cloudflare.com/pages/configuration/build-configuration/
12. [S12] Pages Functions overview: https://developers.cloudflare.com/pages/functions/
13. [S13] Choose a data or storage product: https://developers.cloudflare.com/workers/platform/storage-options/
14. [S14] D1 limits: https://developers.cloudflare.com/d1/platform/limits/
15. [S15] D1 pricing (partial `partials/workers/d1-pricing.mdx`): https://developers.cloudflare.com/d1/platform/pricing/
16. [S16] Workers KV limits: https://developers.cloudflare.com/kv/platform/limits/
17. [S17] How KV works: https://developers.cloudflare.com/kv/concepts/how-kv-works/
18. [S18] Durable Objects limits: https://developers.cloudflare.com/durable-objects/platform/limits/
19. [S19] Durable Objects pricing + plans note: https://developers.cloudflare.com/durable-objects/platform/pricing/
20. [S20] Workers Rate Limiting binding: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
21. [S21] Turnstile server-side validation: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
22. [S22] Workers secrets: https://developers.cloudflare.com/workers/configuration/secrets/
23. [S23] R2 example aws-sdk-js-v3 (SDK v3 in Workers with `nodejs_compat`): https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
24. [S24] How Workers works (V8 isolates): https://developers.cloudflare.com/workers/reference/how-workers-works/
25. [S25] aws4fetch README: https://github.com/mhart/aws4fetch (raw: https://raw.githubusercontent.com/mhart/aws4fetch/master/README.md); version from https://registry.npmjs.org/aws4fetch/latest
26. [S26] DynamoDB Developer Guide, Using Global Secondary Indexes (GameScores / GameTitleIndex): https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html (archived source: https://raw.githubusercontent.com/awsdocs/amazon-dynamodb-developer-guide/master/doc_source/GSI.md)
27. [S27] DynamoDB Query (ScanIndexForward, 1 MB page, Count): https://raw.githubusercontent.com/awsdocs/amazon-dynamodb-developer-guide/master/doc_source/Query.md
28. [S28] DynamoDB partition key design (3,000 RCU / 1,000 WCU per partition): https://raw.githubusercontent.com/awsdocs/amazon-dynamodb-developer-guide/master/doc_source/bp-partition-key-design.md
29. [S29] DynamoDB service quotas (400 KB item, key lengths, 20 GSIs): https://raw.githubusercontent.com/awsdocs/amazon-dynamodb-developer-guide/master/doc_source/ServiceQuotas.md
30. [S30] DynamoDB low-level API (X-Amz-Target, x-amz-json-1.0): https://raw.githubusercontent.com/awsdocs/amazon-dynamodb-developer-guide/master/doc_source/Programming.LowLevelAPI.md
31. [S31] ECMA-262 (implementation-approximated, Math.sqrt, Number::multiply, Math.imul, fdlibm recommendation): https://tc39.es/ecma262/ (source: https://raw.githubusercontent.com/tc39/ecma262/main/spec.html)
32. [S32] Chromium `third_party/fdlibm/README.chromium` (V8 ieee754 fork; cross-OS consistency) (search-confirmed): https://chromium.googlesource.com/chromium/src/+/refs/tags/113.0.5672.6/third_party/fdlibm/README.chromium
33. [S33] V8 code review moving asin/acos to fdlibm (search-confirmed): https://codereview.chromium.org/2122643002
34. [S34] Mozilla bugs (search-confirmed): 531915 (tan differs Linux/Windows) https://bugzilla.mozilla.org/show_bug.cgi?id=531915 ; 1823880 (select fdlibm dynamically) https://bug623317.bugzilla.mozilla.org/show_bug.cgi?id=1823880 ; 2037094 (libm pow 1-ulp off on Android ARM) https://bugzilla.mozilla.org/show_bug.cgi?id=2037094 ; test https://searchfox.org/firefox-main/source/js/src/jit-test/tests/basic/fdlibm-for-pow.js
35. [S35] Chromium "Using Chromium with SwiftShader": https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md (read via https://raw.githubusercontent.com/chromium/chromium/main/docs/gpu/swiftshader.md)
36. [S36] Playwright Browsers (headless shell vs new headless): https://playwright.dev/docs/browsers (source: https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/browsers.md)
37. [S37] three.js manual, Responsive Design (HD-DPI, max pixel count): https://threejs.org/manual/#en/responsive (source `mrdoob/three.js/dev/manual/pages/responsive.html`)
38. [S38] three.js manual, How to dispose of objects (and "Rendering on demand"): https://threejs.org/manual/#en/how-to-dispose-of-objects (source `manual/pages/how-to-dispose-of-objects.html`, `rendering-on-demand.html`)
39. [S39] three.js manual, Shadows (fake shadows): https://threejs.org/manual/#en/shadows
40. [S40] three.js manual, WebGL Compatibility Check: https://threejs.org/manual/#en/webgl-compatibility-check
41. [S41] three.js manual, WebGPURenderer: https://threejs.org/manual/#en/webgpurenderer
42. [S42] three.js `src/renderers/WebGLRenderer.js` (dev, r187): https://raw.githubusercontent.com/mrdoob/three.js/dev/src/renderers/WebGLRenderer.js
43. [S43] MDN, WebGL best practices: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices (source `mdn/content`)
44. [S44] MDN, HTMLCanvasElement.getContext (powerPreference): https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext
45. [S45] MDN, webglcontextlost event: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event
46. [S46] MDN, Making PWAs installable: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
47. [S47] vite-plugin-pwa, Getting Started: https://vite-pwa-org.netlify.app/guide/ (source https://raw.githubusercontent.com/vite-pwa/docs/main/guide/index.md)
48. [S48] vite-plugin-pwa, Deploy (Cache-Control): https://vite-pwa-org.netlify.app/deployment/ (source `deployment/index.md`)
49. [S49] vite-plugin-pwa, Service worker precache (globPatterns): https://vite-pwa-org.netlify.app/guide/service-worker-precache (source `guide/service-worker-precache.md`)
50. [S50] Workbox build types (`maximumFileSizeToCacheInBytes` default 2097152): https://raw.githubusercontent.com/GoogleChrome/workbox/v7/packages/workbox-build/src/types.ts
51. [S51] Vite build options (outDir, assetsDir, target, chunkSizeWarningLimit): https://vite.dev/config/build-options (source https://raw.githubusercontent.com/vitejs/vite/main/docs/config/build-options.md)
52. [S52] actions/setup-node README (v7): https://github.com/actions/setup-node
53. [S53] actions/checkout README (v7): https://github.com/actions/checkout
54. [S54] Node.js release schedule: https://raw.githubusercontent.com/nodejs/Release/main/schedule.json
55. [S55] npm registry metadata (versions, engines, peers): https://registry.npmjs.org/ (`/<pkg>/latest`, e.g. https://registry.npmjs.org/vite-plugin-pwa/2.0.0)
56. [S56] three 0.187.0 npm tarball, measured locally (gzip -9): https://registry.npmjs.org/three/-/three-0.187.0.tgz
