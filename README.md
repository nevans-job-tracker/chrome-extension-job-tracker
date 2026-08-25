# Job Posting to Job Tracker

A Manifest V3 Chrome extension that extracts details from the supported job
posting currently on screen, lets you review the fields, and creates a record
in a compatible self-hosted Job Tracker. Version 0.2.x supports Wellfound,
LinkedIn Jobs, Indeed, Built In, and Dice. The expansion design is documented
in [MULTI_SITE_PLAN.md](MULTI_SITE_PLAN.md).

The extension uses plain HTML, CSS, and JavaScript. A generated content-script
bundle is committed under `dist/`, so Chrome can load the repository directly.

## What it captures

- Company and role title
- Canonical job link and source site
- Location and company size
- Minimum experience
- Salary range when stated
- Full job description as plain text

Missing optional fields remain editable and are highlighted before submission.

## Requirements

- Google Chrome or another Chromium browser that supports Manifest V3
- A reachable Job Tracker API compatible with the payload described in
  [CONTEXT.md](CONTEXT.md)
- Node.js and npm only if you want to run the automated tests

## Configure the Job Tracker

The tracker origin is deployment-specific and currently appears in two files:

1. Set `TRACKER_ORIGIN` in `src/api.js` to the origin serving your tracker.
2. Give the same origin a matching entry under `host_permissions` in
   `manifest.json`.

For example, if the tracker is available at `http://job-tracker.local`, use
that value in `src/api.js` and `http://job-tracker.local/*` in
`manifest.json`. The two values must stay aligned or Chrome will block the API
request.

## Install it in Chrome

1. Clone or download this repository.
2. Configure the Job Tracker origin as described above.
3. Open `chrome://extensions` in Chrome.
4. Turn on **Developer mode**.
5. Click **Load unpacked** and select the cloned repository folder.
6. Optionally pin **Job Posting to Job Tracker** from Chrome's Extensions menu.

Chrome may ask for permission to reach devices on the local network when the
configured tracker uses a LAN address. Allow it if that is where your tracker
is hosted.

## Use it

1. Open a job's full detail page on Wellfound, LinkedIn, Indeed, Built In, or
   Dice.
2. Click the extension button.
3. Review the extracted values and correct any missing fields.
4. Leave **Interested** selected to save no application date and set the next
   action to **Apply**, or choose **Applied** to use today's date.
5. Click **Create application**.
6. Use **Open in Job Tracker** to view the new record.

Some Wellfound search links use a URL such as
`/jobs?job_listing_slug=4548046-manual-tester`. If Wellfound has not rendered
the posting's details panel, the popup provides an **Open this job's detail
page** recovery link. Signed-in company-profile job layouts are also supported.

Currency is deliberately absent from the form and request. This workflow
assumes dollar salaries.

Opening the popup only reads the visible posting. The tracker is changed only
after **Create application** is clicked, and the button is disabled while the
request is running to prevent duplicate submissions.

## Troubleshooting

### “Could not reach the Job Tracker”

- Confirm the configured tracker origin is correct and reachable in Chrome.
- Confirm `src/api.js` and `manifest.json` specify the same origin.
- If the tracker is hosted on a LAN, check Chrome's Local Network Access
  permission.

### “The job details are not open”

Use the recovery link in the popup or open the job title so the site renders
the complete posting. LinkedIn must show the **About the job** content; an
authentication shell is deliberately rejected.

### Fields are missing or incorrect

Edit them in the popup before creating the record. If the same field fails on
several jobs, that site may have changed its page structure. Add a reduced HTML
fixture under `tests/` before adjusting its adapter under `src/adapters/`.

Dice hourly or daily pay is retained in a warning but is not copied into the
annual salary fields. Missing optional data stays blank. The extractors match
the current posting before using structured data and do not read salaries from
recommendation cards.

### Changes do not appear in Chrome

Return to `chrome://extensions` and click the extension's reload button. Then
refresh the job page before opening the extension again.

## Development

Install the pinned development dependencies and run the test suite:

```powershell
npm install
npm run build
npm test
```

Project structure:

- `manifest.json` — Manifest V3 declaration and permissions
- `popup.html`, `popup.css`, `popup.js` — review and submission interface
- `src/sites/catalog.js` — supported job-page URL detection
- `src/adapters/` — per-site extractors and dispatcher
- `src/extraction/` — shared structured-data and parsing helpers
- `src/extractor.js` — existing Wellfound extractor
- `src/content-script.js`, `dist/extract-current-job.js` — source and committed
  browser bundle
- `src/payload.js` — tracker payload conversion
- `src/api.js` — Job Tracker API client
- `tests/` — extractor, payload, and API tests

## Security and privacy

- Job-page access is temporary and begins only when the extension is clicked
  (`activeTab` plus `scripting`).
- The persistent host permission is limited to the configured tracker origin.
- Scraped text is assigned through form values or `textContent`; page HTML is
  never inserted into the extension popup.
- No credentials, cookies, browsing history, analytics, or remote code are
  collected.

See [PLAN.md](PLAN.md) for the implementation history and
[CONTEXT.md](CONTEXT.md) for the public integration contract and maintenance
notes.
