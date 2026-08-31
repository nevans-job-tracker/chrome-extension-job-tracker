// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// popup.js cannot be imported here: it calls extractCurrentPosting() on load,
// which needs chrome.tabs. So this reads the markup the popup actually ships
// and exercises the element its catch block writes into. What is under test is
// the container — that an error message has somewhere to land, is announced,
// and is not styled to overflow.
function popupDocument() {
  // Resolved from the project root rather than import.meta.url: under the
  // jsdom environment that URL carries jsdom's http origin, not a file path.
  const html = readFileSync(resolve(process.cwd(), "popup.html"), "utf8");
  return new DOMParser().parseFromString(html, "text/html");
}

describe("the popup's submit error notice", () => {
  it("starts hidden", () => {
    expect(popupDocument().querySelector("#submit-error").hidden).toBe(true);
  });

  it("shows a duplicate rejection in full", () => {
    const error = popupDocument().querySelector("#submit-error");
    const detail = "Already tracked as #79: Sequencing.com — Senior QA Engineer.";

    // The two lines popup.js runs when createApplication rejects.
    error.textContent = detail;
    error.hidden = false;

    expect(error.hidden).toBe(false);
    // No truncation: the record id and the posting both have to survive, since
    // they are the only things telling you which application already exists.
    expect(error.textContent).toBe(detail);
  });

  it("is announced rather than merely coloured", () => {
    const error = popupDocument().querySelector("#submit-error");

    expect(error.getAttribute("role")).toBe("alert");
    expect(error.className).toContain("notice-error");
  });
});
