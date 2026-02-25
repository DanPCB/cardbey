# Draft job progress – instrumentation and debugging

Use this when the "Creating your store draft" progress UI runs indefinitely or appears stuck (e.g. at Images step).

## What was added

1. **Always-on logs (no flag)**  
   - `[DraftJob] mount` / `[DraftJob] unmount` – when the review page with a jobId mounts or unmounts.  
   - `[DraftJob] start called` – when the safety-net start (POST run) is triggered (should appear **once** per jobId).  
   - `[DraftJob] progressPoll start` – when the 1s draft-poll interval starts (endpoint: GET draft).  
   - `[DraftJob] progressPoll skip (job terminal)` – when we **do not** start that interval because the job is already terminal.  
   - `[DraftJob] draftPoll request` – before each GET `/stores/:id/draft` (endpoint + jobId).  
   - `[DraftJob] draftPoll response` – after each draft response (draftStatus from API).  
   - `[DraftJob] jobPoll start` – when the job-status poll interval starts (GET `/api/mi/orchestra/job/:jobId`).  
   - `[DraftJob] jobPoll stop (initial fetch terminal)` – job was already terminal on first fetch, so we never start polling.  
   - `[DraftJob] jobPoll stop (terminal)` – we got a terminal status in a poll tick and stopped.  
   - `[DraftJob] jobPoll stop (4xx)` – we got 401/403/404 and stopped.

2. **Verbose per-tick log (opt-in)**  
   - Set `localStorage.setItem('cardbey.draftJob.log', '1')` then reload.  
   - You will get `[DraftJob] jobPoll tick` on **every** job-status poll (≈1.25s) with `responseStatus` and `isTerminal`.  
   - Use this to see the **exact** `status` value the backend returns and whether the UI treats it as terminal.

## How to capture evidence

1. Reproduce: open `/app/store/temp/review?mode=draft&jobId=...` and wait until the progress bar is stuck (e.g. at Images).  
2. Open DevTools → Console.  
3. (Optional) Run `localStorage.setItem('cardbey.draftJob.log', '1')` and refresh to get per-tick job status.  
4. In Network, filter by "draft" or "orchestra/job" and note:  
   - Which URL is called repeatedly (draft vs job status).  
   - Response status code and the `status` (and if present `step`) field in the response body.  
5. In Console, note:  
   - Whether you see `[DraftJob] jobPoll stop (terminal)` or `progressPoll skip (job terminal)` (if yes, UI did recognize terminal).  
   - The `responseStatus` / `draftStatus` values in the logs.

## How to interpret

- **Repeated calls every ~1s to GET `/stores/.../draft`**  
  Expected: draft poll. It should stop when `jobTerminal` is true (so you should see `progressPoll skip (job terminal)` and no new `progressPoll start`).

- **Repeated calls to GET `/api/mi/orchestra/job/:jobId`**  
  Expected: job-status poll (~1.25s). It should stop when the backend returns a terminal status and we log `[DraftJob] jobPoll stop (terminal)`.

- **If you never see any `jobPoll stop` or `progressPoll skip (job terminal)`**  
  - Either the **backend never returns a terminal status** (job stuck in running/Images), or  
  - The **backend returns a status we don’t treat as terminal** (e.g. `"complete"` was missing from the mapping – now added).

- **If `[DraftJob] start called` appears more than once for the same jobId**  
  Start is being re-triggered; the sessionStorage guard should prevent that. Check that the key is `cardbey.storeReview.runTriggered.<jobId>`.

## Terminal status mapping (frontend)

We treat these as **terminal** (stop polling, progress can end):  
`completed`, `complete`, `done`, `success`, `finished`, `failed`, `error`, `cancelled`, `canceled`, `timeout`, `timed_out`, `stale`, and any status ending with `_timeout`.

Success-like (show review / continue): `completed`, `complete`, `done`, `success`, `finished`.
