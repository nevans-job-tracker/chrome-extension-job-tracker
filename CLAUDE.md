# Job Tracker extension — project context

Chrome extension that extracts a job posting from a supported site and POSTs it to
the Job Tracker API. Distinct from the Posting Closed extension, which marks an
existing application closed and lives in its own repository.

## Read first

@CONTEXT.md

That file is the authority for this extension: the integration contract, every
payload field and its type, the company-size and status mappings, the per-site
adapter design, and the reasoning behind each. Do not restate its contents here —
update it there.

## Shared context

Read the sibling docs checkout, not the detached submodule copies inside the
backend and frontend:

@../job-tracker-docs/WORKSPACE.md
@../job-tracker-docs/REQUIREMENTS.md

This repository deliberately has no `docs/` submodule — `WORKSPACE.md` records
that decision. The sibling path is how it reaches shared context, matching the
Posting Closed extension.

## The drift risk worth knowing about

`CONTEXT.md` documents the `POST /api/applications` payload **independently of the
backend that receives it.** Nothing enforces agreement between the two. If the
backend adds a required field, changes an enum value, or alters an accepted
status, this extension breaks silently and neither repository records that the
dependency exists.

Both directions need a manual check:

- Changing that endpoint in `job-tracker-backend` → verify `CONTEXT.md` here.
- Changing the payload here → verify the backend's schema and CRUD layer.

This is the cost of not having a shared schema. It is accepted, not overlooked,
but it only works if the check actually happens.

## Conventions

- The configured tracker origin appears in both `src/api.js` and the
  `manifest.json` host permissions. **The two must stay aligned** or Chrome blocks
  the request — this is the most common way a working install breaks.
- Machine-specific paths, deployment addresses and local testing values belong in
  the ignored `LOCAL_CONTEXT.md`. Never put them here, in `CONTEXT.md`, or in any
  tracked file.
- Per-site extraction lives in `src/adapters/`. Adding a site means adding an
  adapter there and registering it in `src/adapters/index.js`, not special-casing
  the shared extraction code.
