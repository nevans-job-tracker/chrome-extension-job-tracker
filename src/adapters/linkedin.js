import {
  finalizeResult,
  firstText,
  normalizeText,
  employmentTypeFrom,
  parseSalaryText,
  parseMinimumExperience,
  parseWeeklyHours,
  textAfterHeading,
} from "../extraction/shared.js";

function titleParts(doc) {
  const parts = String(doc.title || "").split("|").map(normalizeText).filter(Boolean);
  if (parts.at(-1)?.toLowerCase() === "linkedin") parts.pop();
  return { role: parts[0] || "", company: parts[1] || "" };
}

export function scrapeLinkedInJob({ document: doc = document, url = location.href } = {}) {
  const parsed = new URL(url);
  const id = parsed.pathname.match(/\/jobs\/view\/(\d+)/)?.[1] || "";
  const fallback = titleParts(doc);
  const role = firstText(doc, [
    ".job-details-jobs-unified-top-card__job-title h1",
    ".jobs-unified-top-card__job-title",
    "h1.top-card-layout__title",
    "main h1",
    "h1",
  ]) || fallback.role;
  const company = firstText(doc, [
    ".job-details-jobs-unified-top-card__company-name",
    ".jobs-unified-top-card__company-name",
    ".topcard__org-name-link",
    "[class*='top-card'] a[href*='/company/']",
  ]) || fallback.company;
  const descriptionRoot = doc.querySelector(
    ".jobs-description-content__text, .jobs-description__content, .jobs-description, .show-more-less-html__markup"
  );
  const description = normalizeText(descriptionRoot?.innerText || descriptionRoot?.textContent) || textAfterHeading(doc, "About the job");
  const topCard = doc.querySelector(".job-details-jobs-unified-top-card, .jobs-unified-top-card") || doc.querySelector("main")?.firstElementChild;
  const topText = normalizeText(topCard?.textContent).slice(0, 3000);
  // The description wins over the top card (KAN-69), which is the reverse of
  // what this did originally.
  //
  // The top card is the more *structured* source, which is why it was
  // preferred — but on LinkedIn it frequently carries LinkedIn's own estimate
  // rather than the employer's figure. Two real postings made the case: one
  // advertising "USD 99,000 - 128,500" was captured as 80000-80000 from a
  // single top-card number, and one stating "R$75,140.56-R$135,253.01" was
  // captured as an estimated 64.9-73.08 hourly.
  //
  // The body is where the employer states the range themselves. The top card
  // stays as the fallback for postings whose description says nothing.
  const salary = parseSalaryText(description) || parseSalaryText(topText);
  let locationText = firstText(doc, [
    ".job-details-jobs-unified-top-card__primary-description-container",
    ".jobs-unified-top-card__bullet",
    ".topcard__flavor--bullet",
    "[class*='top-card'] [class*='primary-description']",
  ]);
  locationText = normalizeText(locationText.split("·")[0]);
  const remoteBadge = [...(topCard || doc).querySelectorAll("button, span")]
    .map((element) => normalizeText(element.textContent))
    .find((text) => /^(remote|hybrid|on-site)$/i.test(text));
  if (remoteBadge && !new RegExp(remoteBadge, "i").test(locationText)) {
    locationText = locationText ? `${remoteBadge} (${locationText})` : remoteBadge;
  }

  // LinkedIn is the one adapter that reads the DOM rather than JSON-LD, so
  // there is no `employmentType` to map. The top card carries it as a discrete
  // badge, matched exactly — the same approach as remoteBadge above.
  //
  // Exact match matters here more than it does for Remote/Hybrid: "contract"
  // is a common word in a job description ("contract testing", "under
  // contract"), so scanning prose for it would mislabel roles regularly.
  const employmentBadge = [...(topCard || doc).querySelectorAll("button, span, li")]
    .map((element) => normalizeText(element.textContent))
    .find((text) => /^(full[- ]?time|part[- ]?time|contract|temporary|volunteer)$/i.test(text));

  if (!description) {
    return {
      ok: false,
      error: "LinkedIn's job details are not available. Sign in if needed, open the full posting, and try again.",
    };
  }

  return finalizeResult({
    siteLabel: "LinkedIn",
    data: {
      company,
      role_title: role,
      job_link: `https://www.linkedin.com/jobs/view/${id}/`,
      source: "LinkedIn",
      location: locationText,
      company_size: null,
      years_experience_min: parseMinimumExperience(description),
      salary_min: salary?.salary_min ?? null,
      salary_max: salary?.salary_max ?? null,
      pay_period: salary?.pay_period ?? null,
      employment_type: employmentTypeFrom(employmentBadge),
      ...parseWeeklyHours(description),
      job_description: description,
    },
    warnings: salary?.unsupported_period ? [`Pay was quoted as ${salary.unsupported_period}, a period the tracker cannot store; the pay fields were left blank.`] : [],
  });
}
