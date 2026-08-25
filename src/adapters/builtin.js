import {
  companySizeBand,
  finalizeResult,
  firstText,
  formatJobLocation,
  htmlToPlainText,
  normalizeText,
  employmentTypeFrom,
  parseSalaryText,
  parseMinimumExperience,
  parseWeeklyHours,
  parseStructuredSalary,
  selectMatchingJobPosting,
} from "../extraction/shared.js";

export function scrapeBuiltInJob({ document: doc = document, url = location.href } = {}) {
  const parsed = new URL(url);
  const id = parsed.pathname.match(/\/(\d+)\/?$/)?.[1] || "";
  const posting = selectMatchingJobPosting(doc, id);
  const description = posting?.description ? htmlToPlainText(posting.description, doc) : "";
  const employeeText = [...doc.querySelectorAll("body *")]
    .filter((element) => element.children.length === 0)
    .map((element) => normalizeText(element.textContent))
    .find((text) => /^[\d,]+(?:\s*[-–—]\s*[\d,]+)?\s+employees$/i.test(text)) || "";
  const visibleHeader = normalizeText(doc.querySelector("main")?.textContent || doc.body.textContent).slice(0, 3500);
  const visibleWorkMode = [...doc.querySelectorAll("main *")]
    .filter((element) => element.children.length === 0)
    .map((element) => normalizeText(element.textContent))
    .find((text) => /^(?:remote|hybrid|on-site)(?:\s+or\s+(?:remote|hybrid|on-site))?$/i.test(text));
  const salary = parseStructuredSalary(posting?.baseSalary);
  const visibleSalary = parseSalaryText(visibleHeader);
  if (visibleSalary && salary.salary_min === null) Object.assign(salary, visibleSalary);

  return finalizeResult({
    siteLabel: "Built In",
    data: {
      company: posting?.hiringOrganization?.name || firstText(doc, ["[class*='company-title']", "[class*='company-name']"]),
      role_title: posting?.title || firstText(doc, ["h1"]),
      job_link: `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`,
      source: "Built In",
      location: visibleWorkMode || formatJobLocation(posting),
      company_size: companySizeBand(employeeText),
      years_experience_min: parseMinimumExperience(description),
      salary_min: salary.salary_min,
      salary_max: salary.salary_max,
      pay_period: salary.pay_period,
      employment_type: employmentTypeFrom(posting?.employmentType),
      ...parseWeeklyHours(description),
      job_description: description,
    },
    warnings: salary.unsupported_period ? [`Pay was quoted as ${salary.unsupported_period}, a period the tracker cannot store; the pay fields were left blank.`] : [],
  });
}
