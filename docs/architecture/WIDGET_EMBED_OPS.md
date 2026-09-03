# Widget embed ops — third-party Chat + Search

Stable framing for customer sites depends on deterministic `/embed/*` CSP plus loaders that do not leave invisible iframes. This checklist is for HEH / Docker deploys after shipping the stable-embed changes.

## Architecture (do not break)

1. Customer page loads `/widget/v1/ragsuite-init.js` and/or `/search-widget/v1/ragsuite-init.js`.
2. Init injects `loader.js` → AppChat / AppSearch iframe at `/embed/chatbot` or `/embed/search` with `parentOrigin=<page origin>`.
3. Nginx `auth_request` on `/embed/search` and `/embed/chatbot` calls surface-specific internals (`/internal/embed-policy-search|chat`). Project and parent are captured with **concatenation** (`set $embed_project "${arg_projectid}${embed_project}"`) so the auth subrequest cannot wipe them. Internals call `GET /api/v1/widget/embed-frame-policy?project_id=…&surface=search|chat` and set `X-Original-URI` to a synthetic `/embed/…?projectId=…&parentOrigin=…`. Nginx copies `X-Embed-CSP` onto the embed HTML.
4. Backend also accepts project from `X-Original-URI` (`projectId` / `project_id`) as defense in depth if query/header project is empty.
5. Legacy UMD remains **opt-in only** (`data-legacy-widget="true"`).

**Do not** use plain `set $embed_project $arg_projectid` in the same location as `auth_request` — that re-evaluates empty on the subrequest and causes intermittent `frame-ancestors 'self'`.  
**Do not** put `?$args` on the `auth_request` URI — exact internal locations fail to match and policy is skipped.

## Per-parent CSP (no full allowlist leak)

Allowed Domains in admin remain the multi-site permission list. The CSP header is **current parent ∩ allowlist**:

| Parent resolution | CSP |
|-------------------|-----|
| `parentOrigin` on embed URL (or policy query) and host is on allowlist | `frame-ancestors 'self' <that origin only>` |
| Parent present but **not** on allowlist | `frame-ancestors 'self'` (deny framing) |
| Parent missing (old cached loaders / stripped Referer) | **Full** allowlist (legacy fallback) |

Never put an unvalidated Referer/parent into CSP. After deploy + fresh loader bust (`20260904`+), DevTools on Accesstive should show Accesstive only — not t3planet / ragsuite siblings. Multi-domain testing still uses the full Allowed Domains list in admin.

## Deploy (HEH / Docker)

Ship **all three** together:

| Piece | Why |
|-------|-----|
| Backend | Policy returns **503** on lookup outage (not 200 `frame-ancestors 'self'`); narrows CSP when `parentOrigin` is present; project fallback from `X-Original-URI` |
| Web / nginx | Concatenation capture for project/parent; surface-specific internals; default `$embed_csp` fail-open `frame-ancestors *` |
| Synced widget static | Loaders pass `parentOrigin`; retry / reveal / remove failed shells; init `WIDGET_ASSET_VERSION` aligned |

After deploy, regenerate Integration snippets in admin so `?v=` / `data-cache-bust` pick up the new bust (`20260904` or later).

## Allowed Domains hygiene

Keep Chat and Search allowlists intentional for API `X-Request-Domain` checks. Unused hosts no longer appear in CSP when the new loader sends `parentOrigin`, but they still grant API access — trim unused hosts.

For a shared demo project (example `25452d81-…`):

1. Open **Chatbot → Allowed Domains** and **Search → Allowed Domains**.
2. Keep only intentional embed origins (e.g. `https://staging.accesstive.com`, `https://staging.t3planet.de`, `https://ragsuite.de` + www variants as needed).
3. Keep Chat and Search lists **aligned** when the same sites embed both.
4. Origins cover all paths (`https://ragsuite.de` includes `/it-platform/`).

Do **not** auto-edit other tenants’ domain lists in the database.

## Curl acceptance (post-deploy)

Replace `PROJECT_ID` and expect **only** the customer origin in CSP when `parentOrigin` is set. **Zero** bare `frame-ancestors 'self'` across the loop when the parent is allowlisted (intermittent self-only is a regression):

```bash
PROJECT_ID='25452d81-cce8-4be5-a7fc-25af68c07e91'
HOST='https://rag.heh.keeen.net'
PARENT='https://staging.accesstive.com'
EXPECT='staging.accesstive.com'
PARENT_Q=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$PARENT', safe=''))")

fails=0
for surface in search chatbot; do
  echo "=== /embed/$surface (narrow, 40x) ==="
  for i in $(seq 1 40); do
    csp=$(curl -sI "$HOST/embed/$surface?projectId=$PROJECT_ID&parentOrigin=$PARENT_Q" \
      | tr -d '\r' | grep -i '^content-security-policy:' || true)
    if echo "$csp" | grep -q "frame-ancestors 'self'$"; then
      echo "FAIL $i: self-only — $csp"
      fails=$((fails+1))
    elif echo "$csp" | grep -qi "$EXPECT" && ! echo "$csp" | grep -qiE 't3planet|ragsuite\.de'; then
      echo "OK $i (narrow)"
    else
      echo "CHECK $i: $csp"
    fi
  done
done
echo "self-only fails: $fails (expect 0)"

echo "=== legacy (no parentOrigin) — full allowlist OK ==="
curl -sI "$HOST/embed/chatbot?projectId=$PROJECT_ID" \
  | tr -d '\r' | grep -i '^content-security-policy:' || true

echo "=== unauthorized parent — deny ==="
curl -sI "$HOST/embed/search?projectId=$PROJECT_ID&parentOrigin=https%3A%2F%2Fevil.example" \
  | tr -d '\r' | grep -i '^content-security-policy:' || true
```

**Pass:** `self-only fails: 0`; with `parentOrigin`, CSP contains that host and not sibling allowlist hosts; evil parent is bare `'self'`.  
Infra blips may briefly show `frame-ancestors *` (fail-open) — that must not look like a deny.

## Browser acceptance

On each customer host (Accesstive, t3planet, ragsuite.de):

1. Hard reload ×5 with cache disabled — **both** search and chatbot appear on first paint (no ~10s lottery).
2. Network: both `embed/search` and `embed/chatbot` documents; CSP includes **only** the page origin (plus `'self'`).
3. Console: no `Framing … frame-ancestors 'self'` for the RAGSuite host; no permanent invisible shell.
4. Soft navigation on Astro marketing (`ragsuite.de` → `/it-platform/`): chatbot must not show a broken-document icon (site-side persist/re-adopt + stable CSP).

## Asset sync (developers)

Edit under `backend/app/static/{widget,search-widget}/v1/`, then:

```bash
cd frontend && npm run sync-widget-assets
```

Keep in sync:

- both `ragsuite-init.js` `WIDGET_ASSET_VERSION` + `STALE_CACHE_BUSTS`
- `frontend/src/shared/utils/widget-embed-asset-version.ts`
