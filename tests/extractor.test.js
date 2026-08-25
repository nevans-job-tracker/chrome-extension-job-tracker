// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { scrapeWellfoundJob } from "../src/extractor.js";

function renderPosting({
  company = "Arthrex",
  title = "Software QA Engineer Mgr (Remote)",
  metadata = "$131k – $270k | Remote (United States) | 10 years of exp | Full Time",
  size = "5000+",
  dialog = false,
} = {}) {
  const content = `
    <a href="/company/${company.toLowerCase()}">${company}</a>
    <h1>${title}</h1>
    <ul><li>${metadata}</li></ul>
    <div><span>Hires remotely in</span><span>United States</span></div>
    <div><span>Remote Work Policy</span><p>Remote only</p></div>
    <h2>About the job</h2>
    <p>Build reliable software for customers.</p>
    <p><strong>What You’ll Do</strong></p>
    <ul><li>Write useful tests</li><li>Investigate failures</li></ul>
    <h2>About the company</h2>
    <a href="/company/${company.toLowerCase()}"><h3>${company}</h3></a>
    <div><img alt="Company Size" /><span>${size}</span></div>
  `;

  document.body.innerHTML = dialog
    ? `<h1>Over 130k remote jobs</h1><div role="dialog">${content}</div>`
    : content;
}

describe("scrapeWellfoundJob", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("extracts and maps a canonical posting", () => {
    renderPosting();

    const result = scrapeWellfoundJob({
      document,
      url: "https://wellfound.com/jobs/4544552-software-qa-engineer-mgr-remote?ref=search",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      company: "Arthrex",
      role_title: "Software QA Engineer Mgr (Remote)",
      job_link: "https://wellfound.com/jobs/4544552-software-qa-engineer-mgr-remote",
      source: "Wellfound",
      location: "Remote (United States)",
      company_size: "massive",
      years_experience_min: 10,
      salary_min: 131000,
      salary_max: 270000,
    });
    expect(result.data.job_description).toContain("Build reliable software");
    expect(result.data.job_description).toContain("- Write useful tests");
    expect(result.warnings).toEqual([]);
  });

  it("keeps missing salary nullable and maps Wellfound's 201-500 band", () => {
    renderPosting({
      company: "Roadie",
      title: "Software Engineer in Test",
      metadata: "Remote (Everywhere) | 3 years of exp | Full Time",
      size: "201-500",
    });

    const result = scrapeWellfoundJob({
      document,
      url: "https://wellfound.com/jobs/4575515-software-engineer-in-test",
    });

    expect(result.data).toMatchObject({
      location: "Remote (Everywhere)",
      company_size: "large",
      years_experience_min: 3,
      salary_min: null,
      salary_max: null,
    });
    expect(result.warnings).toContain("Salary was not stated.");
  });

  it("reads a company-size value rendered after a separate label container", () => {
    renderPosting({
      company: "Roadie",
      title: "Software Engineer in Test",
      metadata: "Remote (Everywhere) | 3 years of exp | Full Time",
      size: "",
    });
    document.querySelector('img[alt="Company Size"]').parentElement.remove();
    document.body.insertAdjacentHTML(
      "beforeend",
      `
        <aside>
          <div><span>Company</span> size</div>
          <div><span>201-500 people</span></div>
        </aside>
      `
    );

    const result = scrapeWellfoundJob({
      document,
      url: "https://wellfound.com/jobs/4575515-software-engineer-in-test",
    });

    expect(result.data.company_size).toBe("large");
    expect(result.warnings).not.toContain("Company size was not found.");
  });

  it("uses the open details dialog and canonicalizes query-style URLs", () => {
    renderPosting({ company: "QualityCo", title: "Manual Tester", dialog: true });

    const result = scrapeWellfoundJob({
      document,
      url: "https://wellfound.com/jobs?job_listing_slug=4548046-manual-tester",
    });

    expect(result.ok).toBe(true);
    expect(result.data.company).toBe("QualityCo");
    expect(result.data.role_title).toBe("Manual Tester");
    expect(result.data.job_link).toBe(
      "https://wellfound.com/jobs/4548046-manual-tester"
    );
  });

  it("parses Indian lakh salary ranges", () => {
    renderPosting({ metadata: "₹6L – ₹12L | Remote (India) | 4 years of exp | Full Time" });

    const result = scrapeWellfoundJob({
      document,
      url: "https://wellfound.com/jobs/1234567-qa-engineer",
    });

    expect(result.data.salary_min).toBe(600000);
    expect(result.data.salary_max).toBe(1200000);
    expect(result.data).not.toHaveProperty("salary_currency");
  });

  it("extracts the signed-in company-profile job layout", () => {
    document.body.innerHTML = `
      <header><h1>Circana</h1><p>Data analytics firm aiding brands</p></header>
      <div class="job-layout">
        <section class="job-description-column">
          <h2>VP II AI, Machine Learning|US Remote* at Circana</h2>
          <div>$202k – $210k</div>
          <h3>Let’s be unstoppable together!</h3>
          <p>
            Circana is a leading provider of technology, AI, and data solutions
            for consumer packaged goods companies, manufacturers, and retailers.
            Our predictive analytics platform helps clients uncover consumer behavior.
          </p>
          <h3>Role Overview &amp; Job Responsibilities</h3>
          <p>
            Lead and supervise the Quality Assurance team in the creation,
            design, execution, development, integration, and maintenance of
            software test plans and procedures across the organization.
          </p>
        </section>
        <aside>
          <button>Save</button><button>Apply</button>
          <div><span>Hires remotely in</span><span>United States</span></div>
          <div><span>Remote work policy</span><span>Remote only</span></div>
          <div><span>Company Location</span><span>Chicago</span></div>
          <div><span>Experience</span><span>10+ years</span></div>
        </aside>
      </div>
      <aside><div><span>Company size</span><span>5000+ people</span></div></aside>
    `;

    const result = scrapeWellfoundJob({
      document,
      url: "https://wellfound.com/company/circana/jobs/4620000-vp-ii-ai-machine-learning-us-remote",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      company: "Circana",
      role_title: "VP II AI, Machine Learning|US Remote*",
      job_link:
        "https://wellfound.com/jobs/4620000-vp-ii-ai-machine-learning-us-remote",
      location: "Remote (United States)",
      company_size: "massive",
      years_experience_min: 10,
      salary_min: 202000,
      salary_max: 210000,
    });
    expect(result.data.job_description).toContain("Let’s be unstoppable together!");
    expect(result.data.job_description).toContain("Role Overview & Job Responsibilities");
    expect(result.data.job_description).not.toContain("Hires remotely in");
    expect(result.warnings).toEqual([]);
  });

  it("accepts a signed-in job layout without an experience field", () => {
    document.body.innerHTML = `
      <header><h1>TigerData</h1><p>Help build the next great database company!</p></header>
      <div class="job-layout">
        <section class="job-description-column">
          <h2>Senior Test Tooling Engineer at TigerData</h2>
          <h3>Senior Test Tooling Engineer</h3>
          <p>
            Tiger Data is seeking a passionate Senior Test Tooling Engineer to
            elevate our release infrastructure and processes across our core
            products and build robust testing and benchmarking systems.
          </p>
          <h3>What You Will Be Responsible For In This Role:</h3>
          <p>
            Drive and evolve CI/CD infrastructure, own the end-to-end release
            process, and design stress testing infrastructure from the ground up.
          </p>
        </section>
        <aside>
          <button>Save</button><button>Apply</button>
          <div><span>Hires remotely in</span><span>United States</span></div>
          <div><span>Job type</span><span>Full Time</span></div>
          <div><span>Visa sponsorship</span><span>Not Available</span></div>
          <div><span>Relocation</span><span>Not Allowed</span></div>
        </aside>
      </div>
      <aside><div><span>Company size</span><span>51-200 people</span></div></aside>
    `;

    const result = scrapeWellfoundJob({
      document,
      url: "https://wellfound.com/jobs/4512693-senior-test-tooling-engineer",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      company: "TigerData",
      role_title: "Senior Test Tooling Engineer",
      location: "Remote (United States)",
      company_size: "mid_size",
      years_experience_min: null,
      salary_min: null,
      salary_max: null,
    });
    expect(result.data.job_description).toContain("release infrastructure");
    expect(result.warnings).toContain("Years of experience were not found.");
  });

  it("does not take a salary from an unrelated job card", () => {
    document.body.innerHTML = `
      <header><h1>EmpiRx Health</h1><p>Changing the face of healthcare</p></header>
      <div class="job-layout">
        <section class="job-description-column">
          <h2>Staff Software Development Engineer in Test at EmpiRx Health</h2>
          <h3>Staff Software Development Engineer in Test (Databricks)</h3>
          <p>
            EmpiRx Health is seeking a highly skilled and experienced Staff
            Software Development Engineer in Test to provide technical leadership
            for quality engineering and test automation across data platforms.
          </p>
          <h3>Required Qualifications &amp; Experience</h3>
          <p>
            Eight or more years of experience in quality engineering and test
            automation, including technical leadership for other engineers.
          </p>
        </section>
        <aside>
          <button>Save</button><button>Apply</button>
          <div><span>Hires remotely in</span><span>United States</span></div>
          <div><span>Remote work policy</span><span>Remote only</span></div>
          <div><span>Experience</span><span>8+ years</span></div>
        </aside>
      </div>
      <aside><div><span>Company size</span><span>201-500 people</span></div></aside>
      <section class="recommended-jobs">
        <h2>Recommended jobs</h2>
        <a href="/jobs/9999999-unrelated-role">Unrelated role $57k – $65k</a>
      </section>
    `;

    const result = scrapeWellfoundJob({
      document,
      url:
        "https://wellfound.com/jobs/4595086-staff-software-development-engineer-in-test",
    });

    expect(result.ok).toBe(true);
    expect(result.data.salary_min).toBeNull();
    expect(result.data.salary_max).toBeNull();
    expect(result.warnings).toContain("Salary was not stated.");
  });

  it("does not scrape the generic jobs landing page", () => {
    document.body.innerHTML = "<h1>Over 130k remote & local startup jobs</h1>";

    const result = scrapeWellfoundJob({
      document,
      url: "https://wellfound.com/jobs?job_listing_slug=4548046-manual-tester",
    });

    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("job details are not open"),
      recovery_url: "https://wellfound.com/jobs/4548046-manual-tester",
    });
  });

  it("rejects non-Wellfound tabs", () => {
    document.body.innerHTML = "<h1>Something else</h1>";

    const result = scrapeWellfoundJob({ document, url: "https://example.com/jobs/1" });

    expect(result).toEqual({
      ok: false,
      error: "Open a Wellfound job posting before using this extension.",
    });
  });
});
