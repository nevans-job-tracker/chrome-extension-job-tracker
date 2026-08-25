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

export function scrapeDiceJob({ document: doc = document, url = location.href } = {}) {
  const parsed = new URL(url);
  const id = parsed.pathname.match(/\/job-detail\/([0-9a-f-]{36})/i)?.[1] || "";
  const posting = selectMatchingJobPosting(doc, id, { requireIdentity: true });
  const description = posting?.description ? htmlToPlainText(posting.description, doc) : "";
  const h1 = doc.querySelector("h1");
  let visibleSalary = null;
  let headerAncestor = h1?.parentElement;
  for (let depth = 0; headerAncestor && depth < 6; depth += 1) {
    if (/^(?:BODY|MAIN)$/.test(headerAncestor.tagName)) break;
    const headerText = normalizeText(headerAncestor.textContent);
    if (headerText.length > 2500) break;
    visibleSalary = parseAnnualSalaryText(headerText);
    if (visibleSalary) break;
    headerAncestor = headerAncestor.parentElement;
  }
  const structuredSalary = parseStructuredSalary(posting?.baseSalary);
  const salary = visibleSalary || structuredSalary;
  const warnings = [];
  const bodyStart = normalizeText(doc.body.textContent).slice(0, 5000);
  if (/job (?:is )?no longer available|position (?:is )?no longer available|job has expired/i.test(bodyStart)) {
    warnings.push("This Dice posting appears to be unavailable; verify the extracted details before saving.");
  }
  if (salary?.non_annual) {
    warnings.push(`Non-annual pay was found (${salary.non_annual}); salary fields were left blank.`);
  }

  return finalizeResult({
    siteLabel: "Dice",
    data: {
      company: posting?.hiringOrganization?.name || doc.querySelector('[data-cy="companyNameLink"]')?.textContent,
      role_title: posting?.title || h1?.textContent,
      job_link: `https://www.dice.com/job-detail/${id}`,
      source: "Dice",
      location: formatJobLocation(posting) || normalizeText(doc.querySelector('[data-cy="location"]')?.textContent),
      company_size: null,
      years_experience_min: parseMinimumExperience(description),
      salary_min: salary?.salary_min ?? null,
      salary_max: salary?.salary_max ?? null,
      job_description: description,
    },
    warnings,
  });
}
