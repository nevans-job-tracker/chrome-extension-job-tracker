# Persisted project context

Last updated: 2026-08-22

## Workspace

The parent `job-tracker` directory is a workspace, not a Git repository. Its
relevant sibling directories are:

- `chrome-extension-wellfound` — this extension project
- `job-tracker-frontend` — React/Vite tracker UI
- `job-tracker-backend` — FastAPI tracker API
- `job-tracker-docs` — shared architecture and requirements

Do not edit the `docs/` submodule copies inside either code repository. Shared
documentation changes belong in the top-level `job-tracker-docs` repository.

## Existing tracker integration contract

Deployed origin: `http://192.168.0.151/`

Create endpoint:

```text
POST http://192.168.0.151/api/applications
Content-Type: application/json
```

Nginx strips `/api/` before proxying to the loopback FastAPI service. The API
route itself is `/applications` and returns the created record with status 201.

Payload fields used by the extension:

| Field | Type/behavior |
|---|---|
| `company` | Required string |
| `role_title` | Required string |
| `job_link` | Nullable HTTP(S) URL |
| `source` | Nullable free text; extension uses `Wellfound` |
| `location` | Nullable string |
| `company_size` | Nullable enum |
| `years_experience_min` | Nullable integer, minimum 0 |
| `status` | `applied` or `interested` for this workflow |
| `salary_min`, `salary_max` | Nullable numbers; min may not exceed max |
| `date_applied` | Date string or null |
| `notes`, `next_action`, `next_action_date` | Created as null |
| `job_description` | Nullable plain text |

Company-size enum mapping already used by the tracker:

| Wellfound size | API value |
|---|---|
| 1–10 | `seed` |
| 11–50 | `early` |
| 51–200 | `mid_size` |
| 201–500 | `large` |
| 501–1000 | `very_large` |
| 1001+ | `massive` |

The tracker has no authentication and is intentionally LAN-only. Applications
are archived, never hard-deleted, so live smoke tests should be deliberate.

## Extension decisions

- Manifest V3.
- No framework and no production bundling.
- `activeTab` + `scripting` instead of permanent Wellfound host access.
- Exact host permission `http://192.168.0.151/*` for the API request.
- The extension popup performs the request; no service worker is needed.
- Scraping is based on semantic headings, labels, links, and text patterns—not
  Wellfound's generated CSS class names.
- Two rendered layouts are supported: public/canonical pages with an **About
  the job** heading, and signed-in company-profile pages whose heading is
  formatted as `{role} at {company}` and whose details use labeled sidebars.
- Labeled sidebar values may share a container with the label or appear in the
  nearest following container. Both forms are supported, including Wellfound's
  split `Company size` / `201-500 people` markup.
- The full description is stored as plain paragraphs and `- ` list items.
- Salary parsing currently supports USD/CAD/AUD/NZD/EUR/GBP/INR symbols or
  codes plus `k`, `m`, and Indian `L` suffixes.
- Interested is the popup default and always sends a null application date.
  Choosing Applied fills today's local calendar date.
- Currency is intentionally neither displayed nor sent. Salaries in this
  workflow are assumed to be dollars, and the tracker field is due to be
  removed.
- Missing optional fields generate warnings rather than blocking creation.

## Supplied example URLs

- `https://wellfound.com/jobs/4575515-software-engineer-in-test`
- `https://wellfound.com/jobs/4544552-software-qa-engineer-mgr-remote`
- `https://wellfound.com/jobs/4617271-senior-quality-assurance-analyst`
- `https://wellfound.com/jobs?job_listing_slug=4548046-manual-tester`
- `https://wellfound.com/jobs?job_listing_slug=4588255-quality-control-programmer`

Query-style links may render a signed-in details panel, but in a signed-out
session they currently show the generic jobs landing page. Their canonical
detail URLs are derived without guessing:

- `https://wellfound.com/jobs/4548046-manual-tester`
- `https://wellfound.com/jobs/4588255-quality-control-programmer`

## Read-only live verification on 2026-08-21

The exact extractor function was run against the five canonical detail pages.
Observed key results:

| Posting | Company | Location | Size | Experience | Salary |
|---|---|---|---|---:|---|
| Software Engineer in Test | Roadie | Remote (Everywhere) | `large` | 3 | Not stated |
| Software QA Engineer Mgr | Arthrex | Remote (United States) | `massive` | 10 | USD 131,000–270,000 |
| Senior Quality Assurance Analyst | Corserv Solutions | Remote (United States) | `mid_size` | 5 | Not stated |
| Manual Tester | The Phoenix Team | Remote (United States) | `mid_size` | 2 | Not stated |
| Quality Control Programmer | Durex Industries | Remote (United States) | `large` | 3 | Not stated |

All returned a nonempty full description. No Apply button was clicked and no
tracker request was made during this verification.

## Testing state

Automated tests cover:

- canonical and query-style URL behavior
- signed-in company-profile job layout behavior
- generic landing-page refusal and recovery URL
- required field extraction
- remote location, company-size, and experience mapping
- salary present/absent and Indian lakh parsing
- Applied/Interested payload behavior
- successful API request, FastAPI validation errors, and LAN failures

Latest result: 3 test files, 15 tests, all passing.

Normal setup is `npm install` followed by `npm test`. During initial development,
the already-installed compatible Vitest/jsdom copies in the sibling frontend
repository were also used for verification because package network access was
restricted. The two direct development dependency versions are pinned exactly
in `package.json`; there is no lockfile because the restricted local npm cache
could not reconstruct a valid cross-platform one without registry metadata.

## Useful primary documentation

- Chrome activeTab: <https://developer.chrome.com/docs/extensions/develop/concepts/activeTab>
- Chrome scripting: <https://developer.chrome.com/docs/extensions/reference/api/scripting>
- Cross-origin extension requests: <https://developer.chrome.com/docs/extensions/develop/concepts/network-requests>
- Local Network Access: <https://developer.chrome.com/blog/local-network-access>
