# Project context

Last updated: 2026-08-22

This document preserves the technical decisions and integration contract
needed to maintain the extension. Machine-specific paths and deployment values
belong in the ignored `LOCAL_CONTEXT.md` file instead.

## Job Tracker integration contract

Configured origin: `{TRACKER_ORIGIN}`

Create endpoint:

```text
POST {TRACKER_ORIGIN}/api/applications
Content-Type: application/json
```

The extension expects the endpoint to return the created record, including its
`id`, with HTTP status 201.

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
| `status` | `applied` or `interested` |
| `salary_min`, `salary_max` | Nullable numbers; min may not exceed max |
| `date_applied` | Date string or null |
| `notes`, `next_action`, `next_action_date` | Created as null |
| `job_description` | Nullable plain text |

Company-size mapping:

| Wellfound size | API value |
|---|---|
| 1–10 | `seed` |
| 11–50 | `early` |
| 51–200 | `mid_size` |
| 201–500 | `large` |
| 501–1000 | `very_large` |
| 1001+ | `massive` |

Authentication is not implemented by this extension. Deployments should
protect the tracker according to their own network and security requirements.

## Extension decisions

- Manifest V3 with no framework or production bundling.
- `activeTab` plus `scripting` instead of permanent Wellfound host access.
- A host permission limited to the configured tracker origin.
- The popup performs the request; no service worker is needed.
- Scraping uses semantic headings, labels, links, and text patterns rather than
  Wellfound's generated CSS class names.
- Public job pages and signed-in company-profile job layouts are supported.
- Labeled sidebar values may share a container with the label or appear in the
  nearest following container. Both forms are supported.
- Descriptions are stored as plain paragraphs and `- ` list items.
- Salary parsing supports common currency symbols or codes plus `k`, `m`, and
  Indian `L` suffixes, although currency itself is not sent to the tracker.
- Interested is the default and sends a null application date. Choosing
  Applied fills today's local date.
- Missing optional fields generate warnings rather than blocking creation.

## Supported URL forms

- Canonical posting: `https://wellfound.com/jobs/{id}-{slug}`
- Search URL: `https://wellfound.com/jobs?job_listing_slug={id}-{slug}`
- Signed-in company page containing `/jobs/{id}-{slug}`

Query-style links may show a rendered details panel or only the generic jobs
landing page. When details are unavailable, the extension derives a canonical
recovery URL without scraping or submitting the landing page.

## Verification history

During initial development, the extractor was checked read-only against five
representative Wellfound postings covering:

- stated and unstated salary ranges
- remote locations
- every relevant company-size mapping
- canonical and query-style URLs
- public and signed-in company-profile layouts

No Apply button was clicked and no tracker record was created during that
read-only verification.

Automated tests cover:

- canonical, query-style, and signed-in layout behavior
- generic landing-page refusal and recovery URLs
- required-field extraction
- remote location, company-size, and experience mapping
- salary present/absent and Indian lakh parsing
- Applied/Interested payload behavior
- successful API requests, validation errors, and connection failures

Latest result: 3 test files, 15 tests, all passing.

Run `npm install` followed by `npm test` for normal verification.

## Maintainer notes

Keep deployment-specific addresses, workspace paths, and local testing
shortcuts in `LOCAL_CONTEXT.md`. That file is intentionally ignored by Git so
public documentation can remain reusable without discarding local working
context.

Useful primary documentation:

- Chrome activeTab: <https://developer.chrome.com/docs/extensions/develop/concepts/activeTab>
- Chrome scripting: <https://developer.chrome.com/docs/extensions/reference/api/scripting>
- Cross-origin extension requests: <https://developer.chrome.com/docs/extensions/develop/concepts/network-requests>
- Local Network Access: <https://developer.chrome.com/blog/local-network-access>
