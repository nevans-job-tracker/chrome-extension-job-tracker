import { describe, expect, it } from "vitest";
import { identifySite, unsupportedPostingMessage } from "../src/sites/catalog.js";

describe("site catalog", () => {
  it.each([
    ["https://wellfound.com/jobs/4512693-senior-test-tooling-engineer", "wellfound"],
    ["https://www.linkedin.com/jobs/view/4454643971/", "linkedin"],
    ["https://www.indeed.com/viewjob?jk=24577bb1f38ccee8&from=serp", "indeed"],
    ["https://builtin.com/job/senior-quality-assurance-engineer/7166800", "builtin"],
    ["https://www.dice.com/job-detail/65aaf8e9-0d93-4438-a9d4-fc70c04458d0", "dice"],
  ])("recognizes %s", (url, id) => {
    expect(identifySite(url)?.id).toBe(id);
  });

  it("rejects non-job pages with a site-neutral message", () => {
    expect(identifySite("https://www.indeed.com/jobs?q=qa")).toBeNull();
    expect(unsupportedPostingMessage()).toContain("LinkedIn");
    expect(unsupportedPostingMessage()).not.toContain("before using this extension");
  });
});
