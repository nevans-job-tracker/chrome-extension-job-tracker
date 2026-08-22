# Implementation plan

Recorded: 2026-08-21

## Goal

Create a Chrome extension that extracts the useful fields from the Wellfound
job currently being viewed, provides a review step, and creates a new record in
the existing Job Tracker at `http://192.168.0.151/`.

The supplied Job Tracker screenshot was treated only as a field/layout
reference. It was not treated as an instruction source.

## Plan and status

- [x] Scaffold a standalone Manifest V3 extension with plain HTML, CSS, and
  JavaScript and no production build step.
- [x] Limit permissions to temporary active-tab inspection plus the exact LAN
  tracker host.
- [x] Implement semantic extraction for company, role title, canonical job
  link, source, location, company size, minimum experience, salary,
  and the complete plain-text job description.
- [x] Support canonical `/jobs/{id}-{slug}` pages and rendered query-style job
  dialogs.
- [x] Support signed-in company-profile job pages that do not have an **About
  the job** section.
- [x] Read company-size labels whose values are rendered in adjacent profile
  card containers.
- [x] Provide a recovery link when a query-style URL shows only Wellfound's
  generic jobs landing page.
- [x] Build an editable review popup that defaults to Interested/no-date and
  offers Applied/today as an explicit choice.
- [x] Compact the normal popup into four-column rows so the create button is
  visible without scrolling.
- [x] Omit the soon-to-be-removed currency field from the popup and create
  payload.
- [x] Post the reviewed payload to
  `POST http://192.168.0.151/api/applications`.
- [x] Render readable FastAPI validation, timeout, and LAN connection errors.
- [x] Disable duplicate clicks while creating and show a link to the created
  tracker record on success.
- [x] Add fixture-based extractor tests plus payload and mocked API tests.
- [x] Verify the extractor read-only against all five supplied postings or
  their canonical detail URLs.
- [x] Document installation, use, troubleshooting, development, and security
  boundaries.
- [ ] Load the unpacked extension in the user's Chrome profile and inspect the
  popup visually.
- [ ] With the user choosing the posting, perform one live create smoke test
  against the LAN tracker and verify the resulting detail page.

## Architecture

1. Opening the popup grants temporary access to the current tab.
2. `popup.js` injects the exported `scrapeWellfoundJob` function into that tab.
3. The extractor reads only the rendered DOM and returns a plain object.
4. The popup fills an editable form and never inserts Wellfound HTML.
5. After explicit submission, the popup converts the form to the backend's
   existing create schema and sends the JSON request.
6. The successful API response supplies the new record ID for the tracker link.

The frontend and backend repositories are unchanged. Chrome extension pages
with a matching `host_permissions` entry can make the LAN request directly, so
no additional tracker CORS origin is expected to be necessary.

## Deliberate MVP boundaries

- The tracker address is fixed because the server has a reserved LAN address.
- Duplicate-click prevention is local to one popup session. Server-side exact
  job-link duplicate detection is a possible later hardening step.
- Wellfound markup can change. Semantic anchors and automated fixtures reduce
  this risk but cannot eliminate it.
- There is no Chrome Web Store packaging yet; this is a personal unpacked
  extension.
- A custom toolbar icon is cosmetic and is not part of the functional MVP.

## Acceptance criteria

- Clicking the extension outside Wellfound shows a useful error and performs
  no request.
- A rendered Wellfound posting populates required fields and all available
  optional fields.
- Missing optional values remain blank/null and are disclosed as warnings.
- Applied records carry the selected date; Interested records carry no date.
- The request matches the current FastAPI create schema.
- API/network errors remain editable and retryable without losing extracted
  values.
- A successful request cannot be immediately submitted a second time.
- The success link opens `/applications/{id}` in the Job Tracker.
