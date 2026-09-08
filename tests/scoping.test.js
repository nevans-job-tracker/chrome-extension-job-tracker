// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { textAfterHeading } from "../src/extraction/shared.js";

/**
 * Scoping tests for the description fallback (KAN-75).
 *
 * `textAfterHeading` is what runs when a site's description selectors miss. It
 * climbs to an ancestor and harvests every block inside, which is the right
 * shape for a description written as loose paragraphs — and the wrong shape the
 * moment that ancestor also encloses something else on the page.
 *
 * That is how a promoted job card's hourly rate became the pay of three
 * unrelated applications. The parser was working perfectly; it was handed the
 * wrong text. Nothing here existed before, which is exactly why the defect
 * survived KAN-69's parsing tests.
 */
beforeEach(() => {
  document.body.innerHTML = "";
});

const scope = (html, heading = "About the job") => {
  document.body.innerHTML = html;
  return textAfterHeading(document, heading);
};

describe("textAfterHeading", () => {
  it("harvests the blocks of the heading's own section", () => {
    const text = scope(`
      <section>
        <h2>About the job</h2>
        <p>We are hiring a test engineer.</p>
        <p>The role is remote.</p>
      </section>`);

    expect(text).toContain("hiring a test engineer");
    expect(text).toContain("The role is remote");
  });

  it("returns nothing when the heading is not on the page", () => {
    expect(scope("<section><h2>Something else</h2><p>Body.</p></section>")).toBe("");
  });

  it("prefixes list items so they survive as a list", () => {
    const text = scope(`
      <section>
        <h2>About the job</h2>
        <p>Requirements follow.</p>
        <ul><li>Five years of Selenium</li></ul>
      </section>`);

    expect(text).toContain("- Five years of Selenium");
  });
});

describe("it stops at the edge of the heading's own section (KAN-75)", () => {
  it("excludes a sibling section nested inside the container", () => {
    // The reported shape: the climb lands on an ancestor holding both the
    // description and the More jobs rail, so the rail's rate is harvested as
    // though the employer had written it.
    const text = scope(`
      <section>
        <h2>About the job</h2>
        <p>Keeper Security is hiring an SDET for the Vault team.</p>
        <section class="jobs-similar-jobs">
          <h3>More jobs</h3>
          <p>QA Engineer - $64.90 - $73.08 per hour</p>
        </section>
      </section>`);

    expect(text).toContain("Vault team");
    expect(text).not.toContain("64.90");
    expect(text).not.toContain("More jobs");
  });

  it("excludes a rail built from plain divs, matched by class", () => {
    // Structural elements are the reliable half, but a rail is often a div.
    const text = scope(`
      <section>
        <h2>About the job</h2>
        <p>Own the automation suite.</p>
        <div class="jobs-similar-jobs__list">
          <p>Automation Tester - $70.00 - $80.00 per hour</p>
        </div>
      </section>`);

    expect(text).toContain("automation suite");
    expect(text).not.toContain("70.00");
  });

  it("excludes an aside and a complementary rail", () => {
    const text = scope(`
      <section>
        <h2>About the job</h2>
        <p>Ship reliable software.</p>
        <aside><p>Promoted: SDET at $99.00 per hour</p></aside>
        <div role="complementary"><p>Also viewed: QA Lead $88.00 per hour</p></div>
      </section>`);

    expect(text).toContain("reliable software");
    expect(text).not.toContain("99.00");
    expect(text).not.toContain("88.00");
  });

  it("keeps content in a nested section that contains the heading", () => {
    // The rule is "a section the heading does not own", not "any nesting".
    // Over-pruning would empty the description on any site that wraps it in a
    // section of its own — which is the common case, not the exotic one.
    const text = scope(`
      <section class="jobs-description">
        <article>
          <h2>About the job</h2>
          <p>This paragraph is a sibling of the heading, inside a nested article.</p>
        </article>
      </section>`);

    expect(text).toContain("sibling of the heading");
  });

  it("keeps a plain nested wrapper that is not a section", () => {
    // A div with no sectioning role and no rail-ish class is just markup.
    const text = scope(`
      <section>
        <h2>About the job</h2>
        <div><div><p>Deeply wrapped but still the description.</p></div></div>
      </section>`);

    expect(text).toContain("still the description");
  });
});
