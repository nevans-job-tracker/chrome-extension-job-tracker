/**
 * Extract the current Wellfound job posting.
 *
 * Chrome copies this function into the active tab with
 * chrome.scripting.executeScript. Keep every helper inside the function: an
 * injected function cannot use imports or variables from this module.
 *
 * The optional argument exists for unit tests. Chrome invokes it with no
 * arguments, so the real page's document and location are used there.
 */
export function scrapeWellfoundJob(options = {}) {
  const doc = options.document || document;
  const pageUrl = options.url || location.href;
  const normalize = (value) =>
    String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const exactHeading = (root, text) =>
    [...root.querySelectorAll("h1, h2, h3, h4")].find(
      (element) => normalize(element.textContent).toLowerCase() === text.toLowerCase()
    );

  // A numeric DOM-order map is intentionally used instead of
  // compareDocumentPosition. It works in ordinary Chrome content scripts and
  // in restricted DOM wrappers used by browser-testing tools.
  const orderedElements = [...doc.querySelectorAll("*")];
  const documentOrder = new Map(
    orderedElements.map((element, index) => [element, index])
  );
  const isAfter = (element, reference) =>
    documentOrder.has(element) &&
    documentOrder.has(reference) &&
    documentOrder.get(element) > documentOrder.get(reference);

  const isBetween = (element, start, end) =>
    isAfter(element, start) && isAfter(end, element);

  function canonicalJobUrl(value) {
    try {
      const url = new URL(value);
      const querySlug = url.searchParams.get("job_listing_slug");
      if (querySlug && /^\d+-[a-z0-9-]+$/i.test(querySlug)) {
        return `https://wellfound.com/jobs/${querySlug}`;
      }

      // Signed-in company pages can embed the same job under a path such as
      // /company/example/jobs/123-role-name. Store the stable public URL.
      const pathMatch = url.pathname.match(/\/jobs\/(\d+-[^/?#]+)/i);
      if (pathMatch) {
        return `https://wellfound.com/jobs/${pathMatch[1]}`;
      }
    } catch {
      // The page validation below will report the unsupported URL.
    }
    return value;
  }

  function valueNearLabel(root, label) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const normalizedLabel = label.toLowerCase();
    const markers = [...root.querySelectorAll("*")].filter((element) => {
      const textMatches = normalize(element.textContent).toLowerCase() === normalizedLabel;
      const altMatches =
        element.tagName === "IMG" &&
        normalize(element.getAttribute("alt")).toLowerCase() === normalizedLabel;
      return textMatches || altMatches;
    });

    for (const marker of markers.reverse()) {
      let container = marker.parentElement;
      for (let depth = 0; container && depth < 4; depth += 1) {
        const candidate = normalize(container.textContent).replace(
          new RegExp(escaped, "i"),
          ""
        );
        if (candidate && candidate.length <= 160) return normalize(candidate);
        if (container === root) break;
        container = container.parentElement;
      }

      // Wellfound's signed-in company profile can render a label and its
      // value in separate sibling containers. In that layout, the first
      // short leaf after the label is the associated value.
      const markerIndex = documentOrder.get(marker);
      for (
        let index = markerIndex + 1;
        Number.isInteger(markerIndex) && index <= markerIndex + 12;
        index += 1
      ) {
        const candidateElement = orderedElements[index];
        if (!candidateElement || !root.contains(candidateElement)) break;
        if (marker.contains(candidateElement) || candidateElement.children.length > 0) {
          continue;
        }

        const candidate = normalize(candidateElement.textContent);
        if (
          candidate &&
          candidate.toLowerCase() !== normalizedLabel &&
          candidate.length <= 160
        ) {
          return candidate;
        }
      }
    }
    return "";
  }

  function companySizeBand(value) {
    const match = normalize(value).match(/([\d,]+)\s*(?:[-–—]|to|\+)\s*([\d,]+)?/i);
    if (!match) return null;

    const minimum = Number(match[1].replace(/,/g, ""));
    const maximum = match[2] ? Number(match[2].replace(/,/g, "")) : Infinity;
    const representative = Number.isFinite(maximum) ? maximum : minimum;

    if (representative <= 10) return "seed";
    if (representative <= 50) return "early";
    if (representative <= 200) return "mid_size";
    if (representative <= 500) return "large";
    if (representative <= 1000) return "very_large";
    return "massive";
  }

  function parseSalary(text) {
    const token = "(?:US\\$|CA\\$|AU?\\$|NZ\\$|USD|CAD|AUD|NZD|EUR|GBP|INR|[$€£₹])";
    const number = "([\\d,.]+)\\s*([kKmMlL]?)";
    const range = new RegExp(
      `(${token})\\s*${number}\\s*(?:[-–—]|to)\\s*(?:(${token})\\s*)?${number}`,
      "i"
    ).exec(text);

    const multiplier = (suffix) => {
      if (/k/i.test(suffix)) return 1_000;
      if (/m/i.test(suffix)) return 1_000_000;
      if (/l/i.test(suffix)) return 100_000;
      return 1;
    };
    const amount = (raw, suffix, fallbackSuffix) =>
      Number(raw.replace(/,/g, "")) * multiplier(suffix || fallbackSuffix);
    if (range) {
      const minimumSuffix = range[3];
      const maximumSuffix = range[6];
      return {
        salary_min: amount(range[2], minimumSuffix, maximumSuffix),
        salary_max: amount(range[5], maximumSuffix, minimumSuffix),
      };
    }

    const minimumMatch = text.match(/Salary Minimum:\s*([$€£₹])?\s*([\d,.]+)/i);
    const maximumMatch = text.match(/Salary Maximum:\s*([$€£₹])?\s*([\d,.]+)/i);
    if (minimumMatch || maximumMatch) {
      return {
        salary_min: minimumMatch ? Number(minimumMatch[2].replace(/,/g, "")) : null,
        salary_max: maximumMatch ? Number(maximumMatch[2].replace(/,/g, "")) : null,
      };
    }

    return { salary_min: null, salary_max: null };
  }

  function descriptionBetween(root, startHeading, endHeading) {
    const inDescription = (element) =>
      isAfter(element, startHeading) && (!endHeading || isAfter(endHeading, element));
    const blocks = [...root.querySelectorAll("h3, h4, h5, p, li")]
      .filter(inDescription)
      .map((element) => {
        const text = normalize(element.textContent);
        if (!text) return "";
        return element.tagName === "LI" ? `- ${text}` : text;
      })
      .filter(Boolean);

    if (blocks.length) return blocks.join("\n\n");
    const leafText = [...root.querySelectorAll("*")]
      .filter((element) => inDescription(element) && element.children.length === 0)
      .map((element) => normalize(element.textContent))
      .filter(Boolean);
    return [...new Set(leafText)].join("\n\n");
  }

  function embeddedJobHeading(root) {
    const applyControls = [...root.querySelectorAll("button, a")].filter(
      (element) => normalize(element.textContent).toLowerCase() === "apply"
    );
    const hasExperienceLabel = [...root.querySelectorAll("*")].some(
      (element) => normalize(element.textContent).toLowerCase() === "experience"
    );
    if (!applyControls.length || !hasExperienceLabel) return null;

    const candidates = [...root.querySelectorAll("h1, h2, h3, h4")]
      .map((element) => {
        const text = normalize(element.textContent);
        const separator = text.toLowerCase().lastIndexOf(" at ");
        if (separator <= 0) return null;
        const role = normalize(text.slice(0, separator));
        const company = normalize(text.slice(separator + 4));
        if (!role || !company || company.length > 120) return null;

        let nearbyApply = false;
        let ancestor = element.parentElement;
        for (let depth = 0; ancestor && depth < 8; depth += 1) {
          if (applyControls.some((control) => ancestor.contains(control))) {
            nearbyApply = true;
            break;
          }
          ancestor = ancestor.parentElement;
        }
        return { element, role, company, nearbyApply };
      })
      .filter(Boolean);

    return candidates.find((candidate) => candidate.nearbyApply) || candidates[0] || null;
  }

  function embeddedDescription(root, titleHeading) {
    let container = titleHeading.parentElement;
    let descriptionRoot = null;

    for (let depth = 0; container && container !== root && depth < 8; depth += 1) {
      const blocks = [...container.querySelectorAll("h2, h3, h4, h5, p, li")].filter(
        (element) => isAfter(element, titleHeading)
      );
      const length = blocks.reduce(
        (total, element) => total + normalize(element.textContent).length,
        0
      );
      if (blocks.length >= 2 && length >= 250) {
        descriptionRoot = container;
        break;
      }
      container = container.parentElement;
    }

    if (!descriptionRoot) return "";
    const blocks = [...descriptionRoot.querySelectorAll("h2, h3, h4, h5, p, li")]
      .filter((element) => isAfter(element, titleHeading))
      .map((element) => {
        const text = normalize(element.textContent);
        if (!text) return "";
        return element.tagName === "LI" ? `- ${text}` : text;
      })
      .filter(Boolean);
    return blocks.join("\n\n");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(pageUrl);
  } catch {
    return { ok: false, error: "The active tab does not have a valid URL." };
  }

  if (parsedUrl.hostname !== "wellfound.com" && parsedUrl.hostname !== "www.wellfound.com") {
    return { ok: false, error: "Open a Wellfound job posting before using this extension." };
  }

  const aboutJob = exactHeading(doc, "About the job");
  const embeddedJob = aboutJob ? null : embeddedJobHeading(doc);
  if (!aboutJob && !embeddedJob) {
    const recoveryUrl = canonicalJobUrl(pageUrl);
    return {
      ok: false,
      error:
        "The job details are not open. Open the posting itself (or its details panel), then try again.",
      recovery_url: recoveryUrl !== pageUrl ? recoveryUrl : null,
    };
  }

  const jobRoot = aboutJob?.closest('[role="dialog"]') || doc.body;
  const title = aboutJob
    ? [...jobRoot.querySelectorAll("h1")].find((element) => isAfter(aboutJob, element))
    : embeddedJob.element;
  const aboutCompany = exactHeading(jobRoot, "About the company");

  if (!title) {
    return {
      ok: false,
      error: "Wellfound's page was found, but the role title could not be read.",
    };
  }

  const companyLinks = aboutJob
    ? [...jobRoot.querySelectorAll('a[href*="/company/"]')].filter(
        (link) => isAfter(title, link) && normalize(link.textContent)
      )
    : [];
  let company = embeddedJob?.company || normalize(companyLinks.at(-1)?.textContent);
  if (!company && aboutCompany) {
    company = normalize(
      aboutCompany.parentElement?.querySelector('a[href*="/company/"]')?.textContent
    );
  }

  const metadataLists = aboutJob
    ? [...jobRoot.querySelectorAll("ul, ol")].filter((list) =>
        isBetween(list, title, aboutJob)
      )
    : [];
  const metadata = normalize(
    metadataLists.find((list) => /years?\s+(?:of\s+)?exp|full time|remote/i.test(list.textContent))
      ?.textContent
  );

  const experienceText = metadata || valueNearLabel(jobRoot, "Experience");
  const experienceMatch = experienceText.match(
    /(\d+(?:\.\d+)?)\+?\s+years?(?:\s+(?:of\s+)?exp)?/i
  );
  const yearsExperience = experienceMatch ? Math.floor(Number(experienceMatch[1])) : null;
  const salary = parseSalary(metadata || normalize(jobRoot.textContent));

  const metadataParts = metadata
    .split("|")
    .map(normalize)
    .filter(Boolean);
  const experienceIndex = metadataParts.findIndex((part) => /years?\s+(?:of\s+)?exp/i.test(part));
  const locationCandidates = (experienceIndex >= 0
    ? metadataParts.slice(0, experienceIndex)
    : metadataParts
  ).filter(
    (part) =>
      !/[$€£₹]|\b(?:USD|CAD|AUD|NZD|EUR|GBP|INR)\b/i.test(part) &&
      !/%|equity|full time|part time/i.test(part)
  );
  let jobLocation = normalize(locationCandidates.at(-1));

  if (!jobLocation) {
    const remoteTarget = valueNearLabel(jobRoot, "Hires remotely in");
    const remotePolicy = valueNearLabel(jobRoot, "Remote Work Policy");
    if (remoteTarget && /remote/i.test(remotePolicy || "remote")) {
      jobLocation = `Remote (${remoteTarget})`;
    } else {
      jobLocation = valueNearLabel(jobRoot, "Company Location");
    }
  }

  const sizeText = valueNearLabel(jobRoot, "Company Size");
  const description = aboutJob
    ? descriptionBetween(jobRoot, aboutJob, aboutCompany)
    : embeddedDescription(jobRoot, title);
  const canonicalUrl = canonicalJobUrl(pageUrl);
  const warnings = [];

  if (!jobLocation) warnings.push("Location was not found.");
  if (!sizeText) warnings.push("Company size was not found.");
  if (yearsExperience === null) warnings.push("Years of experience were not found.");
  if (salary.salary_min === null && salary.salary_max === null) {
    warnings.push("Salary was not stated.");
  }
  if (!description) warnings.push("Job description was not found.");

  if (!company || !normalize(title.textContent)) {
    return {
      ok: false,
      error: "Wellfound's page was found, but the company or role title could not be read.",
    };
  }

  return {
    ok: true,
    data: {
      company,
      role_title: embeddedJob?.role || normalize(title.textContent),
      job_link: canonicalUrl,
      source: "Wellfound",
      location: jobLocation,
      company_size: companySizeBand(sizeText),
      years_experience_min: yearsExperience,
      salary_min: salary.salary_min,
      salary_max: salary.salary_max,
      job_description: description,
    },
    warnings,
  };
}
