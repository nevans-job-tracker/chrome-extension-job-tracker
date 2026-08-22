# Wellfound to Job Tracker

A small Chrome extension that reads the Wellfound job currently on screen,
lets you review the extracted fields, and creates a record in the Job Tracker
running on the home LAN.

The extension is intentionally plain HTML, CSS, and JavaScript. Chrome loads
the source directory directly; there is no production build step.

## Install it in Chrome

1. Make sure this computer is connected to the same LAN as the Job Tracker.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** in the upper-right corner.
4. Click **Load unpacked**.
5. Select this directory:

   `C:\Users\evans\Projects\job-tracker\chrome-extension-wellfound`

6. Open Chrome's Extensions menu and pin **Wellfound to Job Tracker** if you
   want its button to stay visible.

Chrome may show a one-time prompt allowing the extension to connect to devices
on the local network. Allow it so the extension can reach
`http://192.168.0.151`.

## Use it

1. Open a Wellfound job's detail page.
2. Click the extension button.
3. Review the extracted fields. Missing optional fields are called out in a
   yellow warning box and may be filled manually.
4. **Interested** is selected by default and saves no application date. Choose
   **Applied** to use today's date.
5. Click **Create application**.
6. Use **Open in Job Tracker** to view or edit the new record.

Some Wellfound search links use a URL like
`/jobs?job_listing_slug=4548046-manual-tester`. When Wellfound does not render
the job's details panel, the popup displays **Open this job's detail page**.
Open that link and click the extension again.

Signed-in Wellfound sessions may instead show a job embedded directly inside a
company profile. That layout is supported too, even though it has no **About
the job** heading.

Currency is deliberately absent from the review form and create request. This
workflow assumes dollar salaries, and the tracker is expected to remove that
field.

Creating a record is the only write action. Merely opening the popup never
changes the tracker. The create button is disabled while a request is running
and remains unavailable after success, which prevents accidental double-click
submissions.

## Troubleshooting

### “Could not reach the Job Tracker”

- Confirm the computer is on the home LAN.
- Open <http://192.168.0.151/> directly to verify that the server is running.
- Check whether Chrome is waiting for Local Network Access permission.

### “The job details are not open”

Use the recovery link in the popup or open the job title so Wellfound shows the
full posting, including its **About the job** section.

### Fields are missing or incorrect

Edit them in the popup before creating the record. If the same field fails on
several jobs, Wellfound may have changed its page structure; add a reduced HTML
fixture under `tests/` before adjusting `src/extractor.js`.

### Changes do not appear in Chrome

Return to `chrome://extensions` and click the extension's reload button. Open
the Wellfound page again if Chrome reports that its previous tab access ended.

## Development

Requirements:

- Node.js 22.22.2+ or 24.15+
- npm

Install the pinned test dependencies and run the tests:

```powershell
npm install
npm test
```

The source files are loaded directly by Chrome:

- `manifest.json` — Manifest V3 declaration and narrow permissions
- `popup.html`, `popup.css`, `popup.js` — review and submission interface
- `src/extractor.js` — self-contained Wellfound DOM extractor
- `src/payload.js` — tracker payload conversion
- `src/api.js` — LAN API client
- `tests/` — extractor, payload, and API tests

The tracker address is present in two places that must stay aligned:

- `src/api.js` contains the request URL.
- `manifest.json` grants Chrome permission to contact that host.

Changing only one will break submission.

## Security boundaries

- Wellfound access is temporary and begins only when the extension button is
  clicked (`activeTab` plus `scripting`).
- The only persistent host permission is the exact LAN tracker host.
- Scraped text is assigned through form values or `textContent`; Wellfound HTML
  is never inserted into the extension popup.
- No credentials, cookies, browsing history, analytics, or remote code are
  collected.

See [PLAN.md](PLAN.md) for the implementation plan and [CONTEXT.md](CONTEXT.md)
for the integration contract and live verification notes.
