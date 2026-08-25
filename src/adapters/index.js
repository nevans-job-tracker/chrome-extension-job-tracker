import { scrapeWellfoundJob } from "../extractor.js";
import { identifySite, unsupportedPostingMessage } from "../sites/catalog.js";
import { scrapeBuiltInJob } from "./builtin.js";
import { scrapeDiceJob } from "./dice.js";
import { scrapeIndeedJob } from "./indeed.js";
import { scrapeLinkedInJob } from "./linkedin.js";

const adapters = {
  wellfound: scrapeWellfoundJob,
  linkedin: scrapeLinkedInJob,
  indeed: scrapeIndeedJob,
  builtin: scrapeBuiltInJob,
  dice: scrapeDiceJob,
};

export function extractJobPosting(options = {}) {
  const url = options.url || location.href;
  const site = identifySite(url);
  if (!site) return { ok: false, error: unsupportedPostingMessage() };
  try {
    return adapters[site.id](options);
  } catch {
    return {
      ok: false,
      error: `${site.source}'s page was found, but the posting could not be read. Refresh the page and try again.`,
    };
  }
}
