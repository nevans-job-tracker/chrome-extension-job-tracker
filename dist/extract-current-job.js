(() => {
  // src/extractor.js
  function scrapeWellfoundJob(options = {}) {
    const doc = options.document || document;
    const pageUrl = options.url || location.href;
    const normalize = (value) => String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const exactHeading = (root, text) => [...root.querySelectorAll("h1, h2, h3, h4")].find(
      (element) => normalize(element.textContent).toLowerCase() === text.toLowerCase()
    );
    const orderedElements = [...doc.querySelectorAll("*")];
    const documentOrder = new Map(
      orderedElements.map((element, index) => [element, index])
    );
    const isAfter = (element, reference) => documentOrder.has(element) && documentOrder.has(reference) && documentOrder.get(element) > documentOrder.get(reference);
    const isBetween = (element, start, end) => isAfter(element, start) && isAfter(end, element);
    function canonicalJobUrl(value) {
      try {
        const url = new URL(value);
        const querySlug = url.searchParams.get("job_listing_slug");
        if (querySlug && /^\d+-[a-z0-9-]+$/i.test(querySlug)) {
          return `https://wellfound.com/jobs/${querySlug}`;
        }
        const pathMatch = url.pathname.match(/\/jobs\/(\d+-[^/?#]+)/i);
        if (pathMatch) {
          return `https://wellfound.com/jobs/${pathMatch[1]}`;
        }
      } catch {
      }
      return value;
    }
    function valueNearLabel(root, label) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const normalizedLabel = label.toLowerCase();
      const markers = [...root.querySelectorAll("*")].filter((element) => {
        const textMatches = normalize(element.textContent).toLowerCase() === normalizedLabel;
        const altMatches = element.tagName === "IMG" && normalize(element.getAttribute("alt")).toLowerCase() === normalizedLabel;
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
        const markerIndex = documentOrder.get(marker);
        for (let index = markerIndex + 1; Number.isInteger(markerIndex) && index <= markerIndex + 12; index += 1) {
          const candidateElement = orderedElements[index];
          if (!candidateElement || !root.contains(candidateElement)) break;
          if (marker.contains(candidateElement) || candidateElement.children.length > 0) {
            continue;
          }
          const candidate = normalize(candidateElement.textContent);
          if (candidate && candidate.toLowerCase() !== normalizedLabel && candidate.length <= 160) {
            return candidate;
          }
        }
      }
      return "";
    }
    function companySizeBand2(value) {
      const match = normalize(value).match(/([\d,]+)\s*(?:[-–—]|to|\+)\s*([\d,]+)?/i);
      if (!match) return null;
      const minimum = Number(match[1].replace(/,/g, ""));
      const maximum = match[2] ? Number(match[2].replace(/,/g, "")) : Infinity;
      const representative = Number.isFinite(maximum) ? maximum : minimum;
      if (representative <= 10) return "seed";
      if (representative <= 50) return "early";
      if (representative <= 200) return "mid_size";
      if (representative <= 500) return "large";
      if (representative <= 1e3) return "very_large";
      return "massive";
    }
    function parseSalary(text) {
      const token = "(?:US\\$|CA\\$|AU?\\$|NZ\\$|USD|CAD|AUD|NZD|EUR|GBP|INR|[$\u20AC\xA3\u20B9])";
      const number = "([\\d,.]+)\\s*([kKmMlL]?)";
      const range = new RegExp(
        `(${token})\\s*${number}\\s*(?:[-\u2013\u2014]|to)\\s*(?:(${token})\\s*)?${number}`,
        "i"
      ).exec(text);
      const multiplier = (suffix) => {
        if (/k/i.test(suffix)) return 1e3;
        if (/m/i.test(suffix)) return 1e6;
        if (/l/i.test(suffix)) return 1e5;
        return 1;
      };
      const amount = (raw, suffix, fallbackSuffix) => Number(raw.replace(/,/g, "")) * multiplier(suffix || fallbackSuffix);
      if (range) {
        const minimumSuffix = range[3];
        const maximumSuffix = range[6];
        return {
          salary_min: amount(range[2], minimumSuffix, maximumSuffix),
          salary_max: amount(range[5], maximumSuffix, minimumSuffix)
        };
      }
      const minimumMatch = text.match(/Salary Minimum:\s*([$€£₹])?\s*([\d,.]+)/i);
      const maximumMatch = text.match(/Salary Maximum:\s*([$€£₹])?\s*([\d,.]+)/i);
      if (minimumMatch || maximumMatch) {
        return {
          salary_min: minimumMatch ? Number(minimumMatch[2].replace(/,/g, "")) : null,
          salary_max: maximumMatch ? Number(maximumMatch[2].replace(/,/g, "")) : null
        };
      }
      return { salary_min: null, salary_max: null };
    }
    function descriptionBetween(root, startHeading, endHeading) {
      const inDescription = (element) => isAfter(element, startHeading) && (!endHeading || isAfter(endHeading, element));
      const blocks = [...root.querySelectorAll("h3, h4, h5, p, li")].filter(inDescription).map((element) => {
        const text = normalize(element.textContent);
        if (!text) return "";
        return element.tagName === "LI" ? `- ${text}` : text;
      }).filter(Boolean);
      if (blocks.length) return blocks.join("\n\n");
      const leafText = [...root.querySelectorAll("*")].filter((element) => inDescription(element) && element.children.length === 0).map((element) => normalize(element.textContent)).filter(Boolean);
      return [...new Set(leafText)].join("\n\n");
    }
    function embeddedJobHeading(root) {
      const applyControls = [...root.querySelectorAll("button, a")].filter(
        (element) => /^apply(?: now)?$/i.test(normalize(element.textContent))
      );
      const jobDetailLabels = /* @__PURE__ */ new Set([
        "hires remotely in",
        "remote work policy",
        "job type",
        "visa sponsorship",
        "relocation",
        "experience"
      ]);
      const presentDetailLabels = new Set(
        [...root.querySelectorAll("*")].map((element) => normalize(element.textContent).toLowerCase()).filter((text) => jobDetailLabels.has(text))
      );
      if (!applyControls.length || presentDetailLabels.size < 2) return null;
      const candidates = [...root.querySelectorAll("h1, h2, h3, h4")].map((element) => {
        const text = normalize(element.textContent);
        const separator = text.toLowerCase().lastIndexOf(" at ");
        if (separator <= 0) return null;
        const role = normalize(text.slice(0, separator));
        const company2 = normalize(text.slice(separator + 4));
        if (!role || !company2 || company2.length > 120) return null;
        let nearbyApply = false;
        let ancestor = element.parentElement;
        for (let depth = 0; ancestor && depth < 8; depth += 1) {
          if (applyControls.some((control) => ancestor.contains(control))) {
            nearbyApply = true;
            break;
          }
          ancestor = ancestor.parentElement;
        }
        return { element, role, company: company2, nearbyApply };
      }).filter(Boolean);
      return candidates.find((candidate) => candidate.nearbyApply) || candidates[0] || null;
    }
    function embeddedContentRoot(root, titleHeading) {
      let container = titleHeading.parentElement;
      for (let depth = 0; container && container !== root && depth < 8; depth += 1) {
        const blocks = [...container.querySelectorAll("h2, h3, h4, h5, p, li")].filter(
          (element) => isAfter(element, titleHeading)
        );
        const length = blocks.reduce(
          (total, element) => total + normalize(element.textContent).length,
          0
        );
        if (blocks.length >= 2 && length >= 250) {
          return container;
        }
        container = container.parentElement;
      }
      return null;
    }
    function embeddedDescription(descriptionRoot, titleHeading) {
      if (!descriptionRoot) return "";
      const blocks = [...descriptionRoot.querySelectorAll("h2, h3, h4, h5, p, li")].filter((element) => isAfter(element, titleHeading)).map((element) => {
        const text = normalize(element.textContent);
        if (!text) return "";
        return element.tagName === "LI" ? `- ${text}` : text;
      }).filter(Boolean);
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
        error: "The job details are not open. Open the posting itself (or its details panel), then try again.",
        recovery_url: recoveryUrl !== pageUrl ? recoveryUrl : null
      };
    }
    const jobRoot = aboutJob?.closest('[role="dialog"]') || doc.body;
    const title = aboutJob ? [...jobRoot.querySelectorAll("h1")].find((element) => isAfter(aboutJob, element)) : embeddedJob.element;
    const aboutCompany = exactHeading(jobRoot, "About the company");
    if (!title) {
      return {
        ok: false,
        error: "Wellfound's page was found, but the role title could not be read."
      };
    }
    const companyLinks = aboutJob ? [...jobRoot.querySelectorAll('a[href*="/company/"]')].filter(
      (link) => isAfter(title, link) && normalize(link.textContent)
    ) : [];
    let company = embeddedJob?.company || normalize(companyLinks.at(-1)?.textContent);
    if (!company && aboutCompany) {
      company = normalize(
        aboutCompany.parentElement?.querySelector('a[href*="/company/"]')?.textContent
      );
    }
    const metadataLists = aboutJob ? [...jobRoot.querySelectorAll("ul, ol")].filter(
      (list) => isBetween(list, title, aboutJob)
    ) : [];
    const metadata = normalize(
      metadataLists.find((list) => /years?\s+(?:of\s+)?exp|full time|remote/i.test(list.textContent))?.textContent
    );
    const experienceText = metadata || valueNearLabel(jobRoot, "Experience");
    const experienceMatch = experienceText.match(
      /(\d+(?:\.\d+)?)\+?\s+years?(?:\s+(?:of\s+)?exp)?/i
    );
    const yearsExperience = experienceMatch ? Math.floor(Number(experienceMatch[1])) : null;
    const embeddedContent = embeddedJob ? embeddedContentRoot(jobRoot, title) : null;
    const postingSummary = aboutJob ? [...jobRoot.querySelectorAll("*")].filter(
      (element) => element.children.length === 0 && isBetween(element, title, aboutJob)
    ).map((element) => normalize(element.textContent)).filter(Boolean).join(" ") : normalize(embeddedContent?.textContent);
    const salary = parseSalary(metadata || postingSummary);
    const metadataParts = metadata.split("|").map(normalize).filter(Boolean);
    const experienceIndex = metadataParts.findIndex((part) => /years?\s+(?:of\s+)?exp/i.test(part));
    const locationCandidates = (experienceIndex >= 0 ? metadataParts.slice(0, experienceIndex) : metadataParts).filter(
      (part) => !/[$€£₹]|\b(?:USD|CAD|AUD|NZD|EUR|GBP|INR)\b/i.test(part) && !/%|equity|full time|part time/i.test(part)
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
    const description = aboutJob ? descriptionBetween(jobRoot, aboutJob, aboutCompany) : embeddedDescription(embeddedContent, title);
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
        error: "Wellfound's page was found, but the company or role title could not be read."
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
        company_size: companySizeBand2(sizeText),
        years_experience_min: yearsExperience,
        salary_min: salary.salary_min,
        salary_max: salary.salary_max,
        job_description: description
      },
      warnings
    };
  }

  // src/sites/catalog.js
  var SUPPORTED_SITES = [
    {
      id: "wellfound",
      source: "Wellfound",
      matches(url) {
        return /^(?:www\.)?wellfound\.com$/i.test(url.hostname) && /\/jobs(?:\/|$)/i.test(url.pathname);
      }
    },
    {
      id: "linkedin",
      source: "LinkedIn",
      matches(url) {
        return /^(?:www\.)?linkedin\.com$/i.test(url.hostname) && /\/jobs\/view\/\d+/i.test(url.pathname);
      }
    },
    {
      id: "indeed",
      source: "Indeed",
      matches(url) {
        return /^(?:www\.)?indeed\.com$/i.test(url.hostname) && /\/viewjob\/?$/i.test(url.pathname) && Boolean(url.searchParams.get("jk"));
      }
    },
    {
      id: "builtin",
      source: "Built In",
      matches(url) {
        return /^(?:www\.)?builtin\.com$/i.test(url.hostname) && /\/job\/[^?#]+\/\d+\/?$/i.test(url.pathname);
      }
    },
    {
      id: "dice",
      source: "Dice",
      matches(url) {
        return /^(?:www\.)?dice\.com$/i.test(url.hostname) && /\/job-detail\/[0-9a-f-]{36}\/?$/i.test(url.pathname);
      }
    }
  ];
  var SUPPORTED_SITE_NAMES = SUPPORTED_SITES.map(({ source }) => source);
  function identifySite(value) {
    let url;
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    return SUPPORTED_SITES.find((site) => site.matches(url)) || null;
  }
  function unsupportedPostingMessage() {
    return `Open a supported job posting on ${SUPPORTED_SITE_NAMES.slice(0, -1).join(", ")}, or ${SUPPORTED_SITE_NAMES.at(-1)}.`;
  }

  // src/extraction/shared.js
  var normalizeText = (value) => String(value || "").replace(/\u00a0/g, " ").replace(/[\u200b-\u200d\u2060\u200e\u200f\ufeff]/g, "").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  function firstText(root, selectors) {
    for (const selector of selectors) {
      const text = normalizeText(root.querySelector(selector)?.textContent);
      if (text) return text;
    }
    return "";
  }
  function exactTextElement(root, text) {
    const expected = text.toLowerCase();
    return [...root.querySelectorAll("h1, h2, h3, h4, div, span, p")].find(
      (element) => element.children.length <= 2 && normalizeText(element.textContent).toLowerCase() === expected
    );
  }
  function htmlToPlainText(html, doc = document) {
    if (!html) return "";
    const template = doc.createElement("template");
    template.innerHTML = String(html);
    template.content.querySelectorAll("script, style, noscript, svg").forEach((node) => node.remove());
    template.content.querySelectorAll("br").forEach((node) => node.replaceWith(doc.createTextNode("\n")));
    template.content.querySelectorAll("li").forEach((node) => {
      node.prepend(doc.createTextNode("- "));
      node.append(doc.createTextNode("\n"));
    });
    template.content.querySelectorAll("p, h1, h2, h3, h4, h5, h6, div, section").forEach((node) => node.append(doc.createTextNode("\n")));
    return String(template.content.textContent || "").split(/\n+/).map(normalizeText).filter(Boolean).join("\n\n");
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
  function readJobPostingJsonLd(doc = document) {
    const values = [];
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        flattenJson(JSON.parse(script.textContent), values);
      } catch {
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
      typeof identifier === "object" ? identifier?.value : identifier
    ].map((value) => String(value || "").toLowerCase()).filter(Boolean);
  }
  function selectMatchingJobPosting(doc, identity = "", { requireIdentity = false } = {}) {
    const candidates = readJobPostingJsonLd(doc);
    const expected = String(identity || "").toLowerCase();
    if (expected) {
      const matches = candidates.filter(
        (candidate) => candidateIdentity(candidate).some((value) => value.includes(expected))
      );
      if (matches.length === 1) return matches[0];
      if (requireIdentity) return null;
    }
    return candidates.length === 1 ? candidates[0] : null;
  }
  function formatJobLocation(posting) {
    const locations = Array.isArray(posting?.jobLocation) ? posting.jobLocation : posting?.jobLocation ? [posting.jobLocation] : [];
    const formatted = locations.map((location2) => location2?.address || location2).map((address) => {
      if (typeof address === "string") return normalizeText(address);
      return [address?.addressLocality, address?.addressRegion, address?.addressCountry?.name || address?.addressCountry].map(normalizeText).filter(Boolean).join(", ");
    }).filter(Boolean);
    const remote = /telecommute|remote/i.test(String(posting?.jobLocationType || ""));
    if (remote) {
      const requirements = Array.isArray(posting?.applicantLocationRequirements) ? posting.applicantLocationRequirements : posting?.applicantLocationRequirements ? [posting.applicantLocationRequirements] : [];
      const region = requirements.map((item) => normalizeText(item?.name || item?.address?.addressCountry || item)).filter(Boolean).join(", ");
      return region ? `Remote (${region})` : "Remote";
    }
    return formatted.join("; ");
  }
  function companySizeBand(value) {
    const text = normalizeText(value);
    const range = text.match(/([\d,]+)\s*(?:[-–—]|to)\s*([\d,]+)/i);
    const plus = text.match(/([\d,]+)\s*\+/);
    const single = text.match(/([\d,]+)\s+(?:employees?|people)/i);
    const representative = range ? Number(range[2].replace(/,/g, "")) : plus ? Number(plus[1].replace(/,/g, "")) : single ? Number(single[1].replace(/,/g, "")) : NaN;
    if (!Number.isFinite(representative)) return null;
    if (representative <= 10) return "seed";
    if (representative <= 50) return "early";
    if (representative <= 200) return "mid_size";
    if (representative <= 500) return "large";
    if (representative <= 1e3) return "very_large";
    return "massive";
  }
  var salaryNumber = (raw, suffix = "") => {
    const number = Number(String(raw).replace(/,/g, ""));
    if (!Number.isFinite(number)) return null;
    if (/k/i.test(suffix)) return number * 1e3;
    if (/m/i.test(suffix)) return number * 1e6;
    return number;
  };
  var UNSUPPORTED = { salary_min: null, salary_max: null, pay_period: null };
  var PERIOD_AFTER = /^\s*(?:\/|per\s+|an?\s+|each\s+)?(hourly|hours|hour|hrs|hr|daily|days|day|weekly|weeks|week|monthly|months|month|annually|annual|yearly|years|year|yr)/i;
  function periodWordIn(tail) {
    const match = PERIOD_AFTER.exec(tail);
    if (!match) return "";
    const next = tail[match[0].length];
    if (next && /[a-z]/.test(next)) return "";
    return match[1].toLowerCase();
  }
  var PERIOD_ANYWHERE = /\b(?:hourly|per\s+hour|an\s+hour|\/\s*hour|\/\s*hr)\b|\b(?:annual(?:ly)?|per\s+year|a\s+year|\/\s*yr|\/\s*year)\b/i;
  function periodFrom(text, afterIndex) {
    const near = periodWordIn(text.slice(afterIndex, afterIndex + 24));
    const word = near || PERIOD_ANYWHERE.exec(text)?.[0]?.toLowerCase().replace(/[\s/]+/g, "") || "";
    if (!word) return "";
    if (/hour|hr/.test(word)) return "hourly";
    if (/year|yr|annual/.test(word)) return "annual";
    return "unsupported";
  }
  function parseSalaryText(value) {
    const text = normalizeText(value);
    const range = /(?:US\s*)?\$\s*([\d,.]+)\s*([km]?)\s*(?:[-–—]|to)\s*(?:US\s*)?\$?\s*([\d,.]+)\s*([km]?)/i.exec(text);
    const single = range ? null : /(?:US\s*)?\$\s*([\d,.]+)\s*([km]?)/i.exec(text);
    const match = range || single;
    if (!match) return null;
    const period = periodFrom(text, match.index + match[0].length);
    if (period === "unsupported") {
      const unit = periodWordIn(text.slice(match.index + match[0].length, match.index + match[0].length + 24));
      return {
        ...UNSUPPORTED,
        unsupported_period: normalizeText(`${match[0]} ${unit}`.trim())
      };
    }
    if (range) {
      if (!period && !/[km]/i.test(`${range[2]}${range[4]}`)) return null;
      return {
        salary_min: salaryNumber(range[1], range[2] || range[4]),
        salary_max: salaryNumber(range[3], range[4] || range[2]),
        pay_period: period || "annual",
        unsupported_period: null
      };
    }
    if (!period && !/[km]/i.test(single[2])) return null;
    const amount = salaryNumber(single[1], single[2]);
    return {
      salary_min: amount,
      salary_max: amount,
      pay_period: period || "annual",
      unsupported_period: null
    };
  }
  function parseStructuredSalary(baseSalary) {
    if (!baseSalary) return { ...UNSUPPORTED, unsupported_period: null };
    const value = baseSalary.value ?? baseSalary;
    const unit = normalizeText(value?.unitText || baseSalary.unitText).toUpperCase();
    const minimum = value?.minValue ?? baseSalary.minValue;
    const maximum = value?.maxValue ?? baseSalary.maxValue;
    const scalar = typeof value === "number" || typeof value === "string" ? value : null;
    if (unit && !/HOUR|YEAR|ANNUAL/.test(unit)) {
      const shown = minimum != null || maximum != null ? `${minimum ?? "?"}\u2013${maximum ?? "?"} ${unit}` : `${scalar} ${unit}`;
      return { ...UNSUPPORTED, unsupported_period: normalizeText(shown) };
    }
    const low = minimum != null ? salaryNumber(minimum) : scalar != null ? salaryNumber(scalar) : null;
    const high = maximum != null ? salaryNumber(maximum) : scalar != null ? salaryNumber(scalar) : null;
    if (low === null && high === null) return { ...UNSUPPORTED, unsupported_period: null };
    return {
      salary_min: low,
      salary_max: high,
      pay_period: /HOUR/.test(unit) ? "hourly" : "annual",
      unsupported_period: null
    };
  }
  var EMPLOYMENT_TYPES = {
    FULL_TIME: "full_time",
    FULLTIME: "full_time",
    PART_TIME: "part_time",
    PARTTIME: "part_time",
    CONTRACTOR: "contract",
    CONTRACT: "contract",
    TEMPORARY: "contract",
    VOLUNTEER: "volunteer"
  };
  function employmentTypeFrom(value) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      const key = normalizeText(item).toUpperCase().replace(/[\s-]+/g, "_");
      if (EMPLOYMENT_TYPES[key]) return EMPLOYMENT_TYPES[key];
    }
    return null;
  }
  var HOURS_RANGE = /(\d{1,3})\s*(?:[-–—]|to)\s*(\d{1,3})\s*(?:hours?|hrs?)\s*(?:per\s*|a\s*|\/)\s*(?:week|wk)/i;
  var HOURS_SINGLE = /(\d{1,3})\s*\+?\s*(?:hours?|hrs?)\s*(?:per\s*|a\s*|\/)\s*(?:week|wk)/i;
  function parseWeeklyHours(value) {
    const text = normalizeText(value);
    const range = HOURS_RANGE.exec(text);
    if (range) {
      return {
        hours_per_week_min: Number(range[1]),
        hours_per_week_max: Number(range[2])
      };
    }
    const single = HOURS_SINGLE.exec(text);
    if (single) {
      const hours = Number(single[1]);
      return { hours_per_week_min: hours, hours_per_week_max: hours };
    }
    return { hours_per_week_min: null, hours_per_week_max: null };
  }
  var QUALIFIER = "[^.;\\n]{0,40}?";
  var EXPERIENCE_PATTERNS = [
    // "minimum of 5 years", "at least 5 years", "requires 5+ years"
    /(?:minimum|required|requires|at least)\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*\+?\s*years?/i,
    // "Experience: 5+ years of ..."
    /experience\s*[:–—-]\s*(\d+(?:\.\d+)?)\s*\+?\s*years?/i,
    // "3-5 years of QA experience"
    new RegExp(
      `(\\d+(?:\\.\\d+)?)\\s*(?:[-\u2013\u2014]|to)\\s*\\d+(?:\\.\\d+)?\\s*years?(?:\\s+of)?\\s*${QUALIFIER}\\bexperience`,
      "i"
    ),
    // "5+ years of professional QA experience", "5+ years experience in QA"
    new RegExp(
      `(\\d+(?:\\.\\d+)?)\\s*\\+?\\s*years?(?:\\s+of)?\\s*${QUALIFIER}\\bexperience`,
      "i"
    )
  ];
  function parseMinimumExperience(value) {
    const text = normalizeText(value);
    for (const pattern of EXPERIENCE_PATTERNS) {
      const match = text.match(pattern);
      if (match) return Math.floor(Number(match[1]));
    }
    return null;
  }
  function textAfterHeading(root, headingText) {
    const heading = exactTextElement(root, headingText);
    if (!heading) return "";
    const preferred = heading.closest("section, article, [class*='description'], [class*='job-details']");
    const container = preferred && normalizeText(preferred.textContent).length >= 150 ? preferred : heading.parentElement;
    if (!container) return "";
    const blocks = [...container.querySelectorAll("p, li, h3, h4")].filter((element) => !(element === heading || heading.contains(element))).map((element) => element.tagName === "LI" ? `- ${normalizeText(element.textContent)}` : normalizeText(element.textContent)).filter(Boolean);
    return [...new Set(blocks)].join("\n\n");
  }
  function finalizeResult({ data, warnings = [], siteLabel }) {
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
      ["job_description", "Job description was not found."]
    ];
    for (const [field, message, alternate] of optionalWarnings) {
      if ((data[field] === null || data[field] === "" || data[field] === void 0) && (alternate === null || alternate === "" || alternate === void 0)) {
        warnings.push(message);
      }
    }
    return { ok: true, data, warnings: [...new Set(warnings)] };
  }

  // src/adapters/builtin.js
  function scrapeBuiltInJob({ document: doc = document, url = location.href } = {}) {
    const parsed = new URL(url);
    const id = parsed.pathname.match(/\/(\d+)\/?$/)?.[1] || "";
    const posting = selectMatchingJobPosting(doc, id);
    const description = posting?.description ? htmlToPlainText(posting.description, doc) : "";
    const employeeText = [...doc.querySelectorAll("body *")].filter((element) => element.children.length === 0).map((element) => normalizeText(element.textContent)).find((text) => /^[\d,]+(?:\s*[-–—]\s*[\d,]+)?\s+employees$/i.test(text)) || "";
    const visibleHeader = normalizeText(doc.querySelector("main")?.textContent || doc.body.textContent).slice(0, 3500);
    const visibleWorkMode = [...doc.querySelectorAll("main *")].filter((element) => element.children.length === 0).map((element) => normalizeText(element.textContent)).find((text) => /^(?:remote|hybrid|on-site)(?:\s+or\s+(?:remote|hybrid|on-site))?$/i.test(text));
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
        job_description: description
      },
      warnings: salary.unsupported_period ? [`Pay was quoted as ${salary.unsupported_period}, a period the tracker cannot store; the pay fields were left blank.`] : []
    });
  }

  // src/adapters/dice.js
  function scrapeDiceJob({ document: doc = document, url = location.href } = {}) {
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
      visibleSalary = parseSalaryText(headerText);
      if (visibleSalary) break;
      headerAncestor = headerAncestor.parentElement;
    }
    const structuredSalary = parseStructuredSalary(posting?.baseSalary);
    const salary = visibleSalary || structuredSalary;
    const warnings = [];
    const bodyStart = normalizeText(doc.body.textContent).slice(0, 5e3);
    if (/job (?:is )?no longer available|position (?:is )?no longer available|job has expired/i.test(bodyStart)) {
      warnings.push("This Dice posting appears to be unavailable; verify the extracted details before saving.");
    }
    if (salary?.unsupported_period) {
      warnings.push(`Pay was quoted as ${salary.unsupported_period}, a period the tracker cannot store; the pay fields were left blank.`);
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
        pay_period: salary?.pay_period ?? null,
        employment_type: employmentTypeFrom(posting?.employmentType),
        ...parseWeeklyHours(description),
        job_description: description
      },
      warnings
    });
  }

  // src/adapters/indeed.js
  function scrapeIndeedJob({ document: doc = document, url = location.href } = {}) {
    const parsed = new URL(url);
    const id = parsed.searchParams.get("jk");
    const posting = selectMatchingJobPosting(doc, id);
    const description = posting?.description ? htmlToPlainText(posting.description, doc) : normalizeText(doc.querySelector("#jobDescriptionText")?.innerText || doc.querySelector("#jobDescriptionText")?.textContent);
    const visibleSalary = parseSalaryText(
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
        pay_period: salary?.pay_period ?? null,
        employment_type: employmentTypeFrom(posting?.employmentType),
        ...parseWeeklyHours(description),
        job_description: description
      },
      warnings: salary?.unsupported_period ? [`Pay was quoted as ${salary.unsupported_period}, a period the tracker cannot store; the pay fields were left blank.`] : []
    });
  }

  // src/adapters/linkedin.js
  function titleParts(doc) {
    const parts = String(doc.title || "").split("|").map(normalizeText).filter(Boolean);
    if (parts.at(-1)?.toLowerCase() === "linkedin") parts.pop();
    return { role: parts[0] || "", company: parts[1] || "" };
  }
  function scrapeLinkedInJob({ document: doc = document, url = location.href } = {}) {
    const parsed = new URL(url);
    const id = parsed.pathname.match(/\/jobs\/view\/(\d+)/)?.[1] || "";
    const fallback = titleParts(doc);
    const role = firstText(doc, [
      ".job-details-jobs-unified-top-card__job-title h1",
      ".jobs-unified-top-card__job-title",
      "h1.top-card-layout__title",
      "main h1",
      "h1"
    ]) || fallback.role;
    const company = firstText(doc, [
      ".job-details-jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__company-name",
      ".topcard__org-name-link",
      "[class*='top-card'] a[href*='/company/']"
    ]) || fallback.company;
    const descriptionRoot = doc.querySelector(
      ".jobs-description-content__text, .jobs-description__content, .jobs-description, .show-more-less-html__markup"
    );
    const description = normalizeText(descriptionRoot?.innerText || descriptionRoot?.textContent) || textAfterHeading(doc, "About the job");
    const topCard = doc.querySelector(".job-details-jobs-unified-top-card, .jobs-unified-top-card") || doc.querySelector("main")?.firstElementChild;
    const topText = normalizeText(topCard?.textContent).slice(0, 3e3);
    const salary = parseSalaryText(topText) || parseSalaryText(description);
    let locationText = firstText(doc, [
      ".job-details-jobs-unified-top-card__primary-description-container",
      ".jobs-unified-top-card__bullet",
      ".topcard__flavor--bullet",
      "[class*='top-card'] [class*='primary-description']"
    ]);
    locationText = normalizeText(locationText.split("\xB7")[0]);
    const remoteBadge = [...(topCard || doc).querySelectorAll("button, span")].map((element) => normalizeText(element.textContent)).find((text) => /^(remote|hybrid|on-site)$/i.test(text));
    if (remoteBadge && !new RegExp(remoteBadge, "i").test(locationText)) {
      locationText = locationText ? `${remoteBadge} (${locationText})` : remoteBadge;
    }
    const employmentBadge = [...(topCard || doc).querySelectorAll("button, span, li")].map((element) => normalizeText(element.textContent)).find((text) => /^(full[- ]?time|part[- ]?time|contract|temporary|volunteer)$/i.test(text));
    if (!description) {
      return {
        ok: false,
        error: "LinkedIn's job details are not available. Sign in if needed, open the full posting, and try again."
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
        job_description: description
      },
      warnings: salary?.unsupported_period ? [`Pay was quoted as ${salary.unsupported_period}, a period the tracker cannot store; the pay fields were left blank.`] : []
    });
  }

  // src/adapters/index.js
  var adapters = {
    wellfound: scrapeWellfoundJob,
    linkedin: scrapeLinkedInJob,
    indeed: scrapeIndeedJob,
    builtin: scrapeBuiltInJob,
    dice: scrapeDiceJob
  };
  function extractJobPosting(options = {}) {
    const url = options.url || location.href;
    const site = identifySite(url);
    if (!site) return { ok: false, error: unsupportedPostingMessage() };
    try {
      return adapters[site.id](options);
    } catch {
      return {
        ok: false,
        error: `${site.source}'s page was found, but the posting could not be read. Refresh the page and try again.`
      };
    }
  }

  // src/content-script.js
  var listenerKey = "__jobTrackerExtractorListenerInstalled";
  if (!globalThis[listenerKey]) {
    globalThis[listenerKey] = true;
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== "EXTRACT_CURRENT_JOB") return void 0;
      sendResponse(extractJobPosting());
      return false;
    });
  }
})();
