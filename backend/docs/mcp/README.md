# RAGSuite MCP Connector (outbound)

Self-hosted **outbound** MCP server so Cursor, Claude Desktop, and Manus can search/ask knowledge **and** operate the product (read + safe writes).

This is **not** Sources connectors (Drive, Notion, …). Sources sync content *into* RAGSuite. MCP exposes RAGSuite *to* AI hosts.

## Endpoint

- Streamable HTTP: `{origin}/api/v1/mcp/` (**trailing slash required**)
- Also accepts `{origin}/api/v1/mcp` (no 307 redirect)
- Auth: `Authorization: Bearer <personal MCP key>` from Management → MCP (`rgs_live_…`). Project API keys are rejected.
- Per-key `rate_limit` (requests/hour); usage bumps `request_count` / `last_used_at`
- Setup snippets: `GET /api/v1/mcp-setup/template?project_id=…` (JWT session)

Set `PUBLIC_API_BASE_URL` to your public/ngrok API base and **restart the API**.

## Knowledge tools

| Tool | Purpose |
|------|---------|
| `search_knowledge` | Ranked chunks. Optional: `source_id`, `url_prefix`, `language`, `top_k` |
| `ask_knowledge` | Grounded Q&A. Optional: `format` (`brief` \| `steps` \| `citations_only`), filters |
| `list_sources` | Crawl sources + upload counts |
| `connector_status` | MCP health snapshot (no secrets) |

## Platform READ tools (examples)

Projects: `list_projects`, `get_project`  
History: `top_chat_queries`, `top_search_queries`, `recent_queries`, `recent_chat_history`  
Ops: `overview_metrics`, `list_recent_jobs`, `get_job_status`, `list_notifications`, `system_health_snapshot`  
Crawl: `list_crawl_sources`, `get_crawl_source`  
Documents: `list_documents`, `get_document`  
Config: `describe_chatbot_config`, `describe_search_config`, `describe_widget_config`, `get_embedding_coverage`  
Connectors: `list_connectors`, `get_connector` (no tokens)  
Feedback / audit: `list_feedback`, `list_audit_events`  
EE (only when modules loaded): `analytics_overview`, `compare_models_status`

## What it can do

Call `describe_capabilities` when someone asks what RAGSuite can do. It answers in plain language. Tool names are included only when `include_tool_names=true`.

| Area | Examples | Confirmation |
|------|----------|----------------|
| Knowledge | `search_knowledge`, `ask_knowledge`, `list_documents` | Read only. Retrieved text is untrusted. |
| Projects | `list_projects`, `create_project`, `set_active_project`, `delete_project` | Create uses `confirm=true`. Delete uses a preview token. |
| Sources | `create_crawl_source`, `start_crawl`, `stop_crawl`, `crawl_status` | Create and start use `confirm=true`. Stop uses a preview token. |
| Documents | `update_document_metadata`, `bulk_update_documents`, `reindex_document` | Bulk and delete use a preview token. Reindex returns a job id. |
| Chatbot and search | `update_chatbot_settings`, `update_search_settings`, `update_widget_settings` | `confirm=true`. Brand fields follow the license. |
| Analytics | `search_analytics`, `chat_analytics`, `list_audit_events` | Read only. |
| Jobs | `list_jobs`, `retry_job` | Retry uses `confirm=true`. |
| Administration | `list_members`, `invite_member`, `grant_project_access` | Enterprise org admins only. Writes use a preview token. |

## Confirmation

Creates, ordinary updates, crawl start, and job retry still run when `confirm=true`.

Deletes, bulk changes, permission changes, disconnects, and other sensitive actions do not run on the first call, even if `confirm=true`. That call returns `requires_confirmation`, a `preview`, a one-time `confirmation_token`, and `expires_at` (10 minutes). The second call with that token runs the action. The token is bound to the API key, the user, the tool, and the arguments. Reuse, expiry, a different key, or changed arguments are rejected. `cancel_pending_action` drops a pending token.

## Platform WRITE tools

Ordinary writes still use `confirm=true`:

| Tool | Notes |
|------|------|
| `create_project` | Arg `project_name` (not `name`). Returns `project_id` only — create a project API key in UI for knowledge MCP on the new project |
| `update_project` | Name/description |
| `create_crawl_source` / `update_crawl_source` | Args use `source_name` (not `name`); SSRF-checked; then `start_crawl` |
| `start_crawl` / `reindex_source` | Crawl lifecycle |
| `reindex_document` / `update_document_metadata` | Uploads (no binary upload via MCP) |
| `update_chatbot_settings` / `update_search_settings` / `update_widget_settings` | Pass `fields_json` (safe fields only; never `api_key`) |
| `sync_connector` | Only if already connected in UI (no OAuth connect via MCP) |

`delete_project` still refuses the active project, after the preview token. `delete_crawl_source` and `delete_document` each remove one record and share the REST delete path.

### Example prompts

- “Give me the last 5 chat queries” stays a read (`recent_queries` or `top_chat_queries`).
- “Create a project named Demo” uses `create_project` with `project_name="Demo"` and `confirm=true`.
- “What would happen if I deleted the Docs source?” returns the preview only.
- “Delete the invoice document” previews first. Only an explicit yes to that preview sends `confirmation_token`.
- “Failed jobs today” uses `list_jobs` with status and since filters.
- “Invite alex@example.com as a member” is org-admin only and never returns the temporary password.

## Authentication

Personal MCP keys (`rgs_live_` / `rgs_test_`, scope `mcp_user`) from Management → MCP. Send `Authorization: Bearer <key>`. Project REST API keys are rejected. MCP does not use OAuth. An “unexpected EOF” during an OAuth handshake means the client tried OAuth against a Bearer-only endpoint. Paste the Bearer header from the Connect tab instead.

## Security model

Checks run in this order: policy, license entitlement, project access (including the key's active project, rechecked every call), permission, confirmation, idempotency, then the action, then audit. Audit records a request id, the MCP client name, whether the call was a preview, a confirmation, or a cancel, and redacts secrets. Unexpected failures return a reference id and keep the technical detail in `debug`.

Retrieved knowledge text is labeled untrusted and never grants authority. A sentence inside a document cannot complete a delete, because the delete still needs the preview token.

## Migration

Tool names, argument names, and existing response keys are unchanged. New arguments are optional. New response keys (`success`, `message`, `requires_confirmation`, `confirmation_token`, `job`, `reference_id`) are additive.

One behavior change: `delete_project`, `delete_crawl_source`, `delete_document`, and any tool classed as sensitive or permission-changing no longer run when the only signal is `confirm=true`. The first call returns a preview and token.

## Limitations

- There is no user-group entity. Access is per-project membership, so “remove the Support group” means changing each member's project access.
- MCP cannot upload files or images, including the chat face.
- MCP cannot start an OAuth connect. `disconnect_connector` only disconnects an existing connector.
- Member tools appear only when the Enterprise organization module is loaded, and only for organization admins. An admin cannot deactivate themselves. Invites never return the temporary password or invite token.

## Crawl identity & reindex

Crawl chunks use per-page `document_id` with `crawl_source_id` in metadata. After upgrades, **reindex crawl sources** so vectors pick up new IDs.

## Indexing tips

- Index product docs as crawl sources for platform Q&A via knowledge tools.
- Denylist demo/marketing domains on crawl sources.

## UI

**Management → MCP** — one personal MCP key per user (create or rotate; secret shown once). That key can read and write every project the user can access. Host tabs: Cursor, Claude, Manus, Other. Project API keys stay under Configuration and are not accepted by MCP.

## Troubleshooting

- 401: the key is missing, inactive, expired, or it is a project API key.
- `confirmation_invalid`: the token expired, was used, or belongs to another key. Ask again and use the new preview.
- `confirmation_args_changed`: the arguments differ from the preview.
- `not_org_admin`: member tools require an organization admin.
- `entitlement`: the license does not include that feature.
- `fields_rejected`: the settings payload included `api_key` or a field MCP will not set. Nothing was saved.

## Module

CE module: `modules/mcp`. Policies, confirmation tokens, the response envelope, and name lookup live in that module. Document, crawl, project, and notification deletes share service functions with the REST routes.
