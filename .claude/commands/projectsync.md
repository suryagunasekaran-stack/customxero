---
name: projectsync
description: |
  ## Goal
  Implement a new **sync feature** on `app/organisation/xero/page.tsx` that:
  - Fetches **WIP/WIP-like** Pipedrive *won* deals per tenant.
  - Validates quotes & projects against **Xero**.
  - Runs cleanup checks (lost/won consistency).
  - Presents a **Sync** button that executes the workflow and reports results.

  ## Inputs & References (read these files)
  - `PIPEDRIVEROUTES.yaml`  → Pipedrive endpoints & expected params.
  - `xeroapi.json`          → Xero endpoints, pagination, and response shapes.
  - `CUSTOMFIELDS.md`       → Tenants, pipeline IDs/names, and custom field IDs.
  - Project codebase under `app/`, `lib/`, `services/`, `components/`.

  ## Tenants (from CUSTOMFIELDS.md)
  - **Tenant 1**: id `ea67107e-c352-40a9-a8b8-24d81ae3fc85`
    - Pipedrive: pipeline id **2** (“Work In Progress”)
  - **Tenant 2**: id `6dd39ea4-e6a6-4993-a37a-21482ccf8d22`
    - Pipedrive WIP pipelines: **3,4,5,6,7,8,9,16** (names in file)

  ## Business Rules to Enforce
  1) **Deal title format** (won deals):
     - Standard: `PROJECTNAME-VESSELNAME` (e.g., `AF255189-Olympic lion`)
     - ED deals:  `ED<digits>-<MIDDLE>-<VESSEL>` (e.g., `ED251763-ESE-Ice Victory`)
  2) **Required custom fields** (per tenant; see `CUSTOMFIELDS.md`):
     - `ipc`, `vesselname`, `department`, `location`, `person in charge` / `sales in charge`,
       and **WOPQ / WO / MO** number as applicable to the tenant (naming differs per tenant).
  3) **Xero quote validation**:
     - Read **Xero Quote ID** from the deal’s custom field. Fetch the quote via `xeroapi.json`.
     - Verify: **quote value matches**, **line items/products match**, **quote number equals the custom field value**, and **status is `ACCEPTED`**.
     - Accepted quote naming patterns:
       - Standard: `ipc-quxxx-1` or `ipc-quxxx-v1/v2...`
       - ED: e.g., `ED251763-ESE-QUxx-1 ...` (accept variants where middle token may differ)
     - Deal’s **organization** must match **Xero customer**.
  4) **Cleanup checks**:
     - All **lost** deals with a non-empty **Xero Quote ID** → corresponding Xero quote must be **Declined**.
     - All **won** deals must live in the **WIP / Work In Progress** pipelines.
  5) **Project stage checks (Xero Projects)**:
     - For each **won** deal in WIP pipelines, there must be a **matching Xero Project** with status **In Progress**.
     - **ED projects**: the project name omits the middle token; e.g., `ED251763-ESE-Ice Victory` → project name `ED251763-Ice Victory`.
     - **Estimates**: For ED, ignore project estimate match; for all others, project estimate **must equal** deal value.

  ## UI/UX
  - Add a **Sync** button to `app/organisation/xero/page.tsx`.
  - On click: run the multi-tenant sync pipeline, show a progress log and a final summary:
    - totals per tenant (fetched, validated, mismatches, fixed/flagged)
    - per-rule violations (with actionable messages)
  - Non-blocking UX: use async actions/hooks; don’t freeze UI.

  ## Architecture & Files to (Re)use/Create
  - `services/pipedrive.ts`   → typed client; helpers: `getWonDealsInPipelines(tenant, pipelineIds, fields)`
  - `services/xero.ts`        → typed client; helpers: `getQuoteById(tenant, quoteId)`, `listProjects(tenant, page)`
  - `lib/sync/matchers.ts`    → title/quote/customer matchers; ED title normalizer
  - `lib/sync/validators.ts`  → field presence checks, quote validation, project validation
  - `lib/sync/orchestrator.ts`→ orchestrate per-tenant steps; pagination loops; aggregates results
  - `components/xero/SyncButton.tsx` → button + status output
  - `types/pipedrive.ts` / `types/xero.ts` → infer from specs (`xeroapi.json`, `PIPEDRIVEROUTES.yaml`)
  - `docs/plan.md`            → planner output (kept up to date)

  ## Constraints & Guardrails
  - **Do not hardcode secrets**. Read API keys & tenant config from **env** or existing config utilities.
  - Respect **rate limits**; implement pagination for Xero Projects listing.
  - **No destructive writes** to Xero/Pipedrive in this task; read/validate only.
  - Write **JSDoc** for public helpers. Keep functions small and testable.
  - Commit in **small, logical chunks**.

  ## Acceptance Criteria
  - Sync button exists and performs end-to-end **read/validate** flow for both tenants.
  - Console/log panel shows clear per-tenant summaries and violations.
  - Quote & project checks follow rules above (including ED name normalization).
  - Code organized under `services/`, `lib/sync/`, `components/xero/`, updated `page.tsx`.
  - No hardcoded keys; compiles with type-safe clients and JSDoc present.

steps:
  - agent: implementation-planner
    message: |
      Read: PIPEDRIVEROUTES.yaml, xeroapi.json, CUSTOMFIELDS.md, and the codebase under app/, lib/, services/, components/.
      Produce a precise task plan in `docs/plan.md` that includes:
        - Files to create/modify with paths
        - Function signatures and data flow
        - Title parsing rules incl. ED normalization
        - How to map pipeline IDs per tenant (from CUSTOMFIELDS.md)
        - Pagination strategy for Xero projects
        - Logging/summary format for the UI
      The plan must be directly actionable by the implementer.

  - agent: code-design-reviewer
    message: |
      Review `docs/plan.md` for architectural soundness:
        - Separation of concerns (services vs lib/sync vs UI)
        - Error handling and rate-limit safety
        - Multi-tenant abstraction
        - orchestartion services
        - business logic modifiable
      Update the plan with corrections. Keep it concise and executable.

  - agent: feature-implementer
    message: |
      Implement the feature according to `docs/plan.md`:
        - Create/modify files as planned, including:
          services/pipedrive.ts, services/xero.ts,
          lib/sync/matchers.ts, lib/sync/validators.ts, lib/sync/orchestrator.ts,
          components/xero/SyncButton.tsx,
          app/organisation/xero/page.tsx (wire the button & logs)
        - Read tenant config and field IDs from CUSTOMFIELDS.md (or existing config module).
        - Use env variables for API keys. No secrets in code.
        - Implement read-only validation for quotes/projects as specified.
        - Ensure ED title normalization and project name comparison.
      Return with working code and minimal, clear logs in the UI.

  - agent: style-compliance-refactor
    message: |
      Apply style and formatting fixes to all newly created/modified files.
      Ensure consistent naming, imports, and linting. Make atomic edits only.

  - agent: jsdoc-comment-generator
    message: |
      Add or update JSDoc on all exported functions in:
        services/pipedrive.ts, services/xero.ts,
        lib/sync/matchers.ts, lib/sync/validators.ts, lib/sync/orchestrator.ts,
        components/xero/SyncButton.tsx
      Include @param/@returns with concrete types.

  - agent: git-commit-manager
    message: |
      Stage and commit changes in logical chunks:
        - chore(plan): add docs/plan.md
        - feat(sync): services + lib + UI button for Pipedrive→Xero validation
        - style: formatting and lint fixes
        - docs: JSDoc updates
      Use clear, descriptive messages.
