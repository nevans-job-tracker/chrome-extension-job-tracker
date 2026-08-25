const SUPPORTED_SITES = [
  {
    id: "wellfound",
    source: "Wellfound",
    matches(url) {
      return /^(?:www\.)?wellfound\.com$/i.test(url.hostname) && /\/jobs(?:\/|$)/i.test(url.pathname);
    },
  },
  {
    id: "linkedin",
    source: "LinkedIn",
    matches(url) {
      return /^(?:www\.)?linkedin\.com$/i.test(url.hostname) && /\/jobs\/view\/\d+/i.test(url.pathname);
    },
  },
  {
    id: "indeed",
    source: "Indeed",
    matches(url) {
      return /^(?:www\.)?indeed\.com$/i.test(url.hostname) && /\/viewjob\/?$/i.test(url.pathname) && Boolean(url.searchParams.get("jk"));
    },
  },
  {
    id: "builtin",
    source: "Built In",
    matches(url) {
      return /^(?:www\.)?builtin\.com$/i.test(url.hostname) && /\/job\/[^?#]+\/\d+\/?$/i.test(url.pathname);
    },
  },
  {
    id: "dice",
    source: "Dice",
    matches(url) {
      return /^(?:www\.)?dice\.com$/i.test(url.hostname) && /\/job-detail\/[0-9a-f-]{36}\/?$/i.test(url.pathname);
    },
  },
];

export const SUPPORTED_SITE_NAMES = SUPPORTED_SITES.map(({ source }) => source);

export function identifySite(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  return SUPPORTED_SITES.find((site) => site.matches(url)) || null;
}

export function unsupportedPostingMessage() {
  return `Open a supported job posting on ${SUPPORTED_SITE_NAMES.slice(0, -1).join(", ")}, or ${SUPPORTED_SITE_NAMES.at(-1)}.`;
}
