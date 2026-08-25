import {
  finalizeResult,
  formatJobLocation,
  htmlToPlainText,
  normalizeText,
  parseAnnualSalaryText,
  parseMinimumExperience,
  parseStructuredSalary,
  selectMatchingJobPosting,
} from "../extraction/shared.js";

export function scrapeIndeedJob({ document: doc = document, url = location.href } = {}) {
  const parsed = new URL(url);
  const id = parsed.searchParams.get("jk");
  const posting = selectMatchingJobPosting(doc, id);
  const description = posting?.description
    ? htmlToPlainText(posting.description, doc)
    : normalizeText(doc.querySelector("#jobDescriptionText")?.innerText || doc.querySelector("#jobDescriptionText")?.textContent);
  const visibleSalary = parseAnnualSalaryText(
    doc.querySelector("#salaryInfoAndJobType")?.textContent || ""
  );
  const salary = visibleSalary || parseStructuredSalary(posting?.baseSalary);

  return finalizeResult({
    siteLabel: "Indeed",
    data: {
      company: posting?.hiringOrganization?.name || doc.querySelector('[data-testid="inlineHeader-companyName"]')?.textContent,
      role_title: posting?.title || doc.querySelector("h1")?.textContent,
      job_link: `https://www.indeed.com/viewjob?jk=${encodeURIComponent(id)}`,
      source: "Indeed",
      location: formatJobLocation(posting) || doc.querySelector('[data-testid="job-location"]')?.textContent || "",
      company_size: null,
      years_experience_min: parseMinimumExperience(description),
      salary_min: salary?.salary_min ?? null,
      salary_max: salary?.salary_max ?? null,
      job_description: description,
    },
    warnings: salary?.non_annual ? [`Non-annual pay was found (${salary.non_annual}); salary fields were left blank.`] : [],
  });
}
