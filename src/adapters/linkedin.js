import {
  finalizeResult,
  firstText,
  normalizeText,
  parseAnnualSalaryText,
  parseMinimumExperience,
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
  const salary = parseAnnualSalaryText(topText) || parseAnnualSalaryText(description);
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
      job_description: description,
    },
    warnings: salary?.non_annual ? [`Non-annual pay was found (${salary.non_annual}); salary fields were left blank.`] : [],
  });
}
