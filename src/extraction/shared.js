export const normalizeText = (value) =>
  String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

export function firstText(root, selectors) {
  for (const selector of selectors) {
    const text = normalizeText(root.querySelector(selector)?.textContent);
    if (text) return text;
  }
  return "";
}

export function exactTextElement(root, text) {
  const expected = text.toLowerCase();
  return [...root.querySelectorAll("h1, h2, h3, h4, div, span, p")].find(
    (element) =>
      element.children.length <= 2 &&
      normalizeText(element.textContent).toLowerCase() === expected
  );
}

export function htmlToPlainText(html, doc = document) {
  if (!html) return "";
  const template = doc.createElement("template");
  template.innerHTML = String(html);
  template.content.querySelectorAll("script, style, noscript, svg").forEach((node) => node.remove());
  template.content.querySelectorAll("br").forEach((node) => node.replaceWith(doc.createTextNode("\n")));
  template.content.querySelectorAll("li").forEach((node) => {
    node.prepend(doc.createTextNode("- "));
    node.append(doc.createTextNode("\n"));
  });
  template.content
    .querySelectorAll("p, h1, h2, h3, h4, h5, h6, div, section")
    .forEach((node) => node.append(doc.createTextNode("\n")));

  return String(template.content.textContent || "")
    .split(/\n+/)
    .map(normalizeText)
    .filter(Boolean)
    .join("\n\n");
}

function flattenJson(value, output) {
  if (Array.isArray(value)) {
    value.forEach((item) => flattenJson(item, output));
    return;
  }
  if (!value || typeof value !== "object") return;
  output.push(value);
  if (value["@graph"]) flattenJson(value["@graph"], output);
}

export function readJobPostingJsonLd(doc = document) {
  const values = [];
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      flattenJson(JSON.parse(script.textContent), values);
    } catch {
      // Ignore malformed page data and allow a scoped DOM fallback.
    }
  }
  return values.filter((item) => {
    const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
    return types.some((type) => String(type).toLowerCase() === "jobposting");
  });
}

function candidateIdentity(candidate) {
  const identifier = candidate.identifier;
  return [
    candidate.url,
    candidate["@id"],
    typeof identifier === "object" ? identifier?.value : identifier,
  ]
    .map((value) => String(value || "").toLowerCase())
    .filter(Boolean);
}

export function selectMatchingJobPosting(doc, identity = "", { requireIdentity = false } = {}) {
  const candidates = readJobPostingJsonLd(doc);
  const expected = String(identity || "").toLowerCase();
  if (expected) {
    const matches = candidates.filter((candidate) =>
      candidateIdentity(candidate).some((value) => value.includes(expected))
    );
    if (matches.length === 1) return matches[0];
    if (requireIdentity) return null;
  }
  return candidates.length === 1 ? candidates[0] : null;
}

export function formatJobLocation(posting) {
  const locations = Array.isArray(posting?.jobLocation)
    ? posting.jobLocation
    : posting?.jobLocation
      ? [posting.jobLocation]
      : [];
  const formatted = locations
    .map((location) => location?.address || location)
    .map((address) => {
      if (typeof address === "string") return normalizeText(address);
      return [address?.addressLocality, address?.addressRegion, address?.addressCountry?.name || address?.addressCountry]
        .map(normalizeText)
        .filter(Boolean)
        .join(", ");
    })
    .filter(Boolean);

  const remote = /telecommute|remote/i.test(String(posting?.jobLocationType || ""));
  if (remote) {
    const requirements = Array.isArray(posting?.applicantLocationRequirements)
      ? posting.applicantLocationRequirements
      : posting?.applicantLocationRequirements
        ? [posting.applicantLocationRequirements]
        : [];
    const region = requirements
      .map((item) => normalizeText(item?.name || item?.address?.addressCountry || item))
      .filter(Boolean)
      .join(", ");
    return region ? `Remote (${region})` : "Remote";
  }
  return formatted.join("; ");
}

export function companySizeBand(value) {
  const text = normalizeText(value);
  const range = text.match(/([\d,]+)\s*(?:[-–—]|to)\s*([\d,]+)/i);
  const plus = text.match(/([\d,]+)\s*\+/);
  const single = text.match(/([\d,]+)\s+(?:employees?|people)/i);
  const representative = range
    ? Number(range[2].replace(/,/g, ""))
    : plus
      ? Number(plus[1].replace(/,/g, ""))
      : single
        ? Number(single[1].replace(/,/g, ""))
        : NaN;
  if (!Number.isFinite(representative)) return null;
  if (representative <= 10) return "seed";
  if (representative <= 50) return "early";
  if (representative <= 200) return "mid_size";
  if (representative <= 500) return "large";
  if (representative <= 1000) return "very_large";
  return "massive";
}

const salaryNumber = (raw, suffix = "") => {
  const number = Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(number)) return null;
  if (/k/i.test(suffix)) return number * 1_000;
  if (/m/i.test(suffix)) return number * 1_000_000;
  return number;
};

export function parseAnnualSalaryText(value) {
  const text = normalizeText(value);
  const period = /(?:per|a|\/)?\s*(hour|hr|day|daily|year|yr|annual(?:ly)?)/i.exec(text)?.[1]?.toLowerCase() || "";
  const range = /(?:US\s*)?\$\s*([\d,.]+)\s*([km]?)\s*(?:[-–—]|to)\s*(?:US\s*)?\$?\s*([\d,.]+)\s*([km]?)/i.exec(text);
  if (!range) return null;
  if (/hour|hr|day|daily/.test(period)) {
    return { salary_min: null, salary_max: null, non_annual: range[0] + (period ? ` ${period}` : "") };
  }
  if (!/year|yr|annual/.test(period) && !/[km]/i.test(`${range[2]}${range[4]}`)) return null;
  return {
    salary_min: salaryNumber(range[1], range[2] || range[4]),
    salary_max: salaryNumber(range[3], range[4] || range[2]),
    non_annual: null,
  };
}

export function parseStructuredSalary(baseSalary) {
  if (!baseSalary) return { salary_min: null, salary_max: null, non_annual: null };
  const value = baseSalary.value ?? baseSalary;
  const unit = normalizeText(value?.unitText || baseSalary.unitText).toUpperCase();
  const minimum = value?.minValue ?? baseSalary.minValue;
  const maximum = value?.maxValue ?? baseSalary.maxValue;
  const scalar = typeof value === "number" || typeof value === "string" ? value : null;
  if (/HOUR|DAY/.test(unit)) {
    const range = minimum != null || maximum != null ? `${minimum ?? "?"}–${maximum ?? "?"} ${unit}` : `${scalar} ${unit}`;
    return { salary_min: null, salary_max: null, non_annual: normalizeText(range) };
  }
  if (unit && !/YEAR|ANNUAL/.test(unit)) {
    return { salary_min: null, salary_max: null, non_annual: null };
  }
  return {
    salary_min: minimum != null ? salaryNumber(minimum) : scalar != null ? salaryNumber(scalar) : null,
    salary_max: maximum != null ? salaryNumber(maximum) : scalar != null ? salaryNumber(scalar) : null,
    non_annual: null,
  };
}

export function parseMinimumExperience(value) {
  const text = normalizeText(value);
  const patterns = [
    /(?:minimum|required|at least)\s+(?:of\s+)?(\d+(?:\.\d+)?)\+?\s+years?/i,
    /(\d+(?:\.\d+)?)\+\s+years?(?:\s+of)?\s+(?:relevant\s+)?experience/i,
    /(\d+(?:\.\d+)?)\s*(?:[-–—]|to)\s*\d+(?:\.\d+)?\s+years?(?:\s+of)?\s+(?:relevant\s+)?experience/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Math.floor(Number(match[1]));
  }
  return null;
}

export function textAfterHeading(root, headingText) {
  const heading = exactTextElement(root, headingText);
  if (!heading) return "";
  const preferred = heading.closest("section, article, [class*='description'], [class*='job-details']");
  const container = preferred && normalizeText(preferred.textContent).length >= 150
    ? preferred
    : heading.parentElement;
  if (!container) return "";
  const blocks = [...container.querySelectorAll("p, li, h3, h4")]
    .filter((element) => !(element === heading || heading.contains(element)))
    .map((element) => element.tagName === "LI" ? `- ${normalizeText(element.textContent)}` : normalizeText(element.textContent))
    .filter(Boolean);
  return [...new Set(blocks)].join("\n\n");
}

export function finalizeResult({ data, warnings = [], siteLabel }) {
  data.company = normalizeText(data.company);
  data.role_title = normalizeText(data.role_title);
  if (!data.company || !data.role_title) {
    return { ok: false, error: `${siteLabel}'s page was found, but the company or role title could not be read.` };
  }
  const optionalWarnings = [
    ["location", "Location was not found."],
    ["company_size", "Company size was not found."],
    ["years_experience_min", "Years of experience were not found."],
    ["salary_min", "Salary was not stated.", data.salary_max],
    ["job_description", "Job description was not found."],
  ];
  for (const [field, message, alternate] of optionalWarnings) {
    if ((data[field] === null || data[field] === "" || data[field] === undefined) && (alternate === null || alternate === "" || alternate === undefined)) {
      warnings.push(message);
    }
  }
  return { ok: true, data, warnings: [...new Set(warnings)] };
}
