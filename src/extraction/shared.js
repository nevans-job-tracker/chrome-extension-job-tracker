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

/**
 * Pay, with the period kept rather than discarded.
 *
 * This used to null the figures whenever the posting quoted an hourly rate and
 * report it as a warning, because the tracker had one pair of salary columns
 * and no way to say what they measured. KAN-50 added `pay_period`, so the
 * numbers this already parsed correctly now have somewhere to go.
 *
 * A period the tracker has no value for — a day rate — is still discarded, and
 * keeps its warning. That warning now means something specific rather than
 * standing in for "not annual".
 */
const UNSUPPORTED = { salary_min: null, salary_max: null, pay_period: null };

// Immediately after the figures — "$60 - $120/hour", "$500 per day".
//
// Longest alternatives lead, so "hourly" is not read as "hour" and "yearly"
// not as "year". Where the word ends is decided by periodWordIn below rather
// than by `\b` here, for the reason given there.
const PERIOD_AFTER =
  /^\s*(?:\/|per\s+|an?\s+|each\s+)?(hourly|hours|hour|hrs|hr|daily|days|day|weekly|weeks|week|monthly|months|month|annually|annual|yearly|years|year|yr)/i;

/**
 * The matched period word, or "" if the match landed inside a longer word.
 *
 * The boundary check lives here rather than as `(?![a-z])` in the pattern
 * because that pattern carries the `i` flag, under which `[a-z]` also matches
 * `L` — so the very case this exists for, "hourLocation", was rejected. A
 * case-sensitive test in code says what is meant: a *lowercase* continuation
 * means we matched a prefix of some longer word, an uppercase one means the
 * DOM ran two elements together.
 */
function periodWordIn(tail) {
  const match = PERIOD_AFTER.exec(tail);
  if (!match) return "";
  const next = tail[match[0].length];
  if (next && /[a-z]/.test(next)) return "";
  return match[1].toLowerCase();
}

// Anywhere in the sentence, but only in forms that cannot mean anything else.
// "annual compensation range is $73,000 to $102,200" states the period before
// the money, so proximity alone is not enough.
const PERIOD_ANYWHERE =
  /\b(?:hourly|per\s+hour|an\s+hour|\/\s*hour|\/\s*hr)\b|\b(?:annual(?:ly)?|per\s+year|a\s+year|\/\s*yr|\/\s*year)\b/i;

/**
 * The period is read from the text *following the figures* first, and only
 * then from the sentence as a whole — and the second pass matches only phrases
 * that cannot mean anything else.
 *
 * Scanning the whole description for a bare "hour" is what the previous
 * version effectively did. That was survivable while a match merely blanked
 * the fields; now that a match decides what the numbers *mean*, "flexible
 * hours" a paragraph away from an annual salary would store it as an hourly
 * rate. Wrong data is worse than absent data.
 */
function periodFrom(text, afterIndex) {
  const near = periodWordIn(text.slice(afterIndex, afterIndex + 24));
  const word =
    near || PERIOD_ANYWHERE.exec(text)?.[0]?.toLowerCase().replace(/[\s/]+/g, "") || "";
  if (!word) return "";
  if (/hour|hr/.test(word)) return "hourly";
  if (/year|yr|annual/.test(word)) return "annual";
  return "unsupported";
}

export function parseSalaryText(value) {
  const text = normalizeText(value);

  const range =
    /(?:US\s*)?\$\s*([\d,.]+)\s*([km]?)\s*(?:[-–—]|to)\s*(?:US\s*)?\$?\s*([\d,.]+)\s*([km]?)/i.exec(text);
  const single = range
    ? null
    : /(?:US\s*)?\$\s*([\d,.]+)\s*([km]?)/i.exec(text);
  const match = range || single;
  if (!match) return null;

  const period = periodFrom(text, match.index + match[0].length);

  // A day, week or month rate has no home in `pay_period`. Reported rather
  // than silently stored against the wrong unit.
  if (period === "unsupported") {
    const unit = periodWordIn(text.slice(match.index + match[0].length, match.index + match[0].length + 24));
    return {
      ...UNSUPPORTED,
      unsupported_period: normalizeText(`${match[0]} ${unit}`.trim()),
    };
  }

  if (range) {
    // Without a stated period, a K or M suffix is the only thing that makes a
    // figure legible as an annual salary. A bare "$60 - $120" is ambiguous and
    // is left alone rather than guessed at.
    if (!period && !/[km]/i.test(`${range[2]}${range[4]}`)) return null;
    return {
      salary_min: salaryNumber(range[1], range[2] || range[4]),
      salary_max: salaryNumber(range[3], range[4] || range[2]),
      pay_period: period || "annual",
      unsupported_period: null,
    };
  }

  // A single figure — "$86/hour", "$120K". Both ends are set to it, which is
  // what the tracker stores for a fixed rate.
  if (!period && !/[km]/i.test(single[2])) return null;
  const amount = salaryNumber(single[1], single[2]);
  return {
    salary_min: amount,
    salary_max: amount,
    pay_period: period || "annual",
    unsupported_period: null,
  };
}

export function parseStructuredSalary(baseSalary) {
  if (!baseSalary) return { ...UNSUPPORTED, unsupported_period: null };
  const value = baseSalary.value ?? baseSalary;
  const unit = normalizeText(value?.unitText || baseSalary.unitText).toUpperCase();
  const minimum = value?.minValue ?? baseSalary.minValue;
  const maximum = value?.maxValue ?? baseSalary.maxValue;
  const scalar = typeof value === "number" || typeof value === "string" ? value : null;

  if (unit && !/HOUR|YEAR|ANNUAL/.test(unit)) {
    const shown =
      minimum != null || maximum != null
        ? `${minimum ?? "?"}–${maximum ?? "?"} ${unit}`
        : `${scalar} ${unit}`;
    return { ...UNSUPPORTED, unsupported_period: normalizeText(shown) };
  }

  const low = minimum != null ? salaryNumber(minimum) : scalar != null ? salaryNumber(scalar) : null;
  const high = maximum != null ? salaryNumber(maximum) : scalar != null ? salaryNumber(scalar) : null;
  if (low === null && high === null) return { ...UNSUPPORTED, unsupported_period: null };

  return {
    salary_min: low,
    salary_max: high,
    pay_period: /HOUR/.test(unit) ? "hourly" : "annual",
    unsupported_period: null,
  };
}

/**
 * schema.org JobPosting.employmentType -> the tracker's enum (KAN-51).
 *
 * `contract_to_hire` is deliberately absent: schema.org has no equivalent, so
 * it cannot be scraped and stays a manual edit on the detail screen.
 *
 * Anything unmapped — INTERN, PER_DIEM, OTHER — leaves the field blank rather
 * than guessing. Blank means "not recorded", which is exactly right for OTHER.
 */
const EMPLOYMENT_TYPES = {
  FULL_TIME: "full_time",
  FULLTIME: "full_time",
  PART_TIME: "part_time",
  PARTTIME: "part_time",
  CONTRACTOR: "contract",
  CONTRACT: "contract",
  TEMPORARY: "contract",
  VOLUNTEER: "volunteer",
};

export function employmentTypeFrom(value) {
  const values = Array.isArray(value) ? value : [value];
  for (const item of values) {
    const key = normalizeText(item).toUpperCase().replace(/[\s-]+/g, "_");
    if (EMPLOYMENT_TYPES[key]) return EMPLOYMENT_TYPES[key];
  }
  return null;
}

/**
 * Expected weekly hours, e.g. "Commitment: 10-40 hrs/week".
 *
 * Best-effort by nature — unlike the two above this is a regex over prose
 * rather than structured data. It stays silent when it finds nothing: most
 * full-time postings never state hours, and a warning on every one of them
 * would be noise that trains you to ignore warnings.
 */
// Written as literal patterns rather than built from a string: the unit
// fragment is dense with escapes, and assembling it dynamically is how you get
// a regex that silently means something else.
const HOURS_RANGE =
  /(\d{1,3})\s*(?:[-–—]|to)\s*(\d{1,3})\s*(?:hours?|hrs?)\s*(?:per\s*|a\s*|\/)\s*(?:week|wk)/i;
const HOURS_SINGLE =
  /(\d{1,3})\s*\+?\s*(?:hours?|hrs?)\s*(?:per\s*|a\s*|\/)\s*(?:week|wk)/i;

export function parseWeeklyHours(value) {
  const text = normalizeText(value);

  const range = HOURS_RANGE.exec(text);
  if (range) {
    return {
      hours_per_week_min: Number(range[1]),
      hours_per_week_max: Number(range[2]),
    };
  }

  // A fixed commitment sets both ends, which is what the tracker stores.
  const single = HOURS_SINGLE.exec(text);
  if (single) {
    const hours = Number(single[1]);
    return { hours_per_week_min: hours, hours_per_week_max: hours };
  }

  return { hours_per_week_min: null, hours_per_week_max: null };
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
