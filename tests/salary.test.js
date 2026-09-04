import { describe, expect, it } from "vitest";
import {
  employmentTypeFrom,
  parseSalaryText,
  parseStructuredSalary,
  parseMinimumExperience,
  parseWeeklyHours,
} from "../src/extraction/shared.js";

describe("parseSalaryText (KAN-52)", () => {
  it.each([
    ["$60 - $120/hour", 60, 120, "hourly"],
    ["$45.50 an hour", 45.5, 45.5, "hourly"],
    ["$30 hourly", 30, 30, "hourly"],
    ["$106,400 - $177,300 per year", 106400, 177300, "annual"],
    ["$120K - $145K", 120000, 145000, "annual"],
    ["$95,000 yearly", 95000, 95000, "annual"],
  ])("reads %s", (text, min, max, period) => {
    expect(parseSalaryText(text)).toMatchObject({
      salary_min: min,
      salary_max: max,
      pay_period: period,
    });
  });

  it("reads a period that the DOM ran into the next element", () => {
    // textContent concatenates adjacent elements without separators, so a
    // posting laid out as "Compensation: $60 - $120/hour" above "Location:
    // Remote" arrives as one string. A \b between "hour" and "Location" finds
    // no boundary, and the rate was silently stored as an annual salary.
    expect(parseSalaryText("Compensation: $60 - $120/hourLocation: Remote"))
      .toMatchObject({ salary_min: 60, salary_max: 120, pay_period: "hourly" });
  });

  it("reads a period stated before the figures", () => {
    expect(parseSalaryText("annual compensation range is $73,000 to $102,200."))
      .toMatchObject({ pay_period: "annual" });
  });

  it("does not let a stray 'hours' in prose decide the period", () => {
    // The whole-text fallback matches only phrases that cannot mean anything
    // else. This mattered less when a match merely blanked the fields; now
    // that it decides what the numbers *mean*, a wrong match is wrong data.
    expect(parseSalaryText("Flexible hours. Salary $120,000 - $140,000 annually"))
      .toMatchObject({ salary_min: 120000, pay_period: "annual" });
  });

  it("refuses a period the tracker cannot store", () => {
    const result = parseSalaryText("$500 per day");
    expect(result.salary_min).toBeNull();
    expect(result.pay_period).toBeNull();
    expect(result.unsupported_period).toContain("day");
  });

  it.each([
    ["$60 - $120", "no period and no K/M suffix is ambiguous"],
    ["$50,000 housing stipend", "a figure that is not pay"],
    ["No compensation stated", "no figure at all"],
  ])("declines %s (%s)", (text) => {
    expect(parseSalaryText(text)).toBeNull();
  });
});

describe("parseStructuredSalary (KAN-52)", () => {
  const wrap = (unitText, minValue, maxValue) => ({ value: { unitText, minValue, maxValue } });

  it("keeps an hourly rate rather than discarding it", () => {
    expect(parseStructuredSalary(wrap("HOUR", 60, 120))).toMatchObject({
      salary_min: 60, salary_max: 120, pay_period: "hourly",
    });
  });

  it("keeps a yearly salary", () => {
    expect(parseStructuredSalary(wrap("YEAR", 106400, 177300))).toMatchObject({
      salary_min: 106400, salary_max: 177300, pay_period: "annual",
    });
  });

  it("refuses a unit with no home in the enum", () => {
    const result = parseStructuredSalary(wrap("DAY", 500, 600));
    expect(result.salary_min).toBeNull();
    expect(result.unsupported_period).toContain("DAY");
  });

  it("returns blanks rather than throwing on no salary at all", () => {
    expect(parseStructuredSalary(null)).toMatchObject({
      salary_min: null, pay_period: null,
    });
  });
});

describe("employmentTypeFrom (KAN-52)", () => {
  it.each([
    ["FULL_TIME", "full_time"],
    ["PART_TIME", "part_time"],
    ["CONTRACTOR", "contract"],
    ["TEMPORARY", "contract"],
    ["VOLUNTEER", "volunteer"],
    ["Full-time", "full_time"],
  ])("maps %s to %s", (input, expected) => {
    expect(employmentTypeFrom(input)).toBe(expected);
  });

  it("takes the first mappable value from a list", () => {
    expect(employmentTypeFrom(["OTHER", "PART_TIME"])).toBe("part_time");
  });

  it.each(["INTERN", "PER_DIEM", "OTHER", "", null, undefined])(
    "leaves %s blank rather than guessing", (input) => {
      // Blank means "not recorded" on the tracker, which is exactly right for
      // OTHER — a guess would be worse than an absence.
      expect(employmentTypeFrom(input)).toBeNull();
    }
  );

  it("never produces contract_to_hire", () => {
    // schema.org has no equivalent, so it cannot be scraped and stays a
    // manual edit. Pinned so nobody later maps it onto CONTRACTOR.
    const everything = ["FULL_TIME", "PART_TIME", "CONTRACTOR", "TEMPORARY",
                        "VOLUNTEER", "INTERN", "PER_DIEM", "OTHER", "CONTRACT_TO_HIRE"];
    for (const value of everything) {
      expect(employmentTypeFrom(value)).not.toBe("contract_to_hire");
    }
  });
});

describe("parseWeeklyHours (KAN-52)", () => {
  it.each([
    ["Commitment: 10-40 hrs/week", 10, 40],
    ["10 - 40 hours per week", 10, 40],
    ["20 to 30 hrs / week", 20, 30],
    ["40 hours per week", 40, 40],
    ["40+ hrs/week", 40, 40],
    ["30 hrs a week", 30, 30],
  ])("reads %s", (text, min, max) => {
    expect(parseWeeklyHours(text)).toEqual({
      hours_per_week_min: min, hours_per_week_max: max,
    });
  });

  it.each([
    "Great team, remote first",
    "5 years experience",
    "$60 - $120/hour",
  ])("stays silent on %s", (text) => {
    // Most full-time postings never state hours. Warning on every one of them
    // would be noise that trains you to ignore warnings.
    expect(parseWeeklyHours(text)).toEqual({
      hours_per_week_min: null, hours_per_week_max: null,
    });
  });
});

describe("parseMinimumExperience (KAN-54)", () => {
  it.each([
    ["4+ years of professional experience in software QA", 4],
    ["5+ years of software testing experience", 5],
    ["5+ years of QA experience", 5],
    ["5+ years experience in QA engineering", 5],
    ["8+ years of QA/test engineering experience", 8],
    ["5+ years of professional QA Experience", 5],
    ["7+ years of experience in software quality engineering", 7],
    ["5+ years of Scrum and Agile experience", 5],
    [
      "Experience: 5+ years of dedicated professional experience in software QA automation engineering",
      5,
    ],
  ])("reads %s", (text, expected) => {
    // All nine are real postings that reported "not found" before KAN-54. The
    // old pattern allowed only a literal "relevant" between "years" and
    // "experience"; every miss had some other qualifier there.
    expect(parseMinimumExperience(text)).toBe(expected);
  });

  it.each([
    ["3-5 years of QA experience", 3],
    ["Minimum of 6 years in test automation", 6],
    ["At least 10 years of experience", 10],
    ["Requires 4+ years", 4],
  ])("still reads the older forms: %s", (text, expected) => {
    expect(parseMinimumExperience(text)).toBe(expected);
  });

  it("survives zero-width characters in pasted text", () => {
    // Two U+FEFF sit before the digit in one real posting, picked up from
    // whatever it was pasted through. They render as nothing, so the text
    // looks identical and fails to match for a reason invisible in a diff.
    const zwsp = String.fromCharCode(0xfeff);
    expect(parseMinimumExperience(`${zwsp}${zwsp}5+ years of professional QA Experience`))
      .toBe(5);
  });

  it("takes the headline requirement, not the smallest", () => {
    // A posting states its overall requirement first, then smaller per-tool
    // ones. The column means the role's minimum, so the smallest would be
    // wrong.
    expect(
      parseMinimumExperience("5+ years of QA experience. 2+ years with Cypress.")
    ).toBe(5);
  });

  it.each([
    "Great culture. We have been around 5 years.",
    "Founded 3 years ago by ex-Google engineers",
    "No experience requirement stated",
  ])("does not invent a number from %s", (text) => {
    expect(parseMinimumExperience(text)).toBeNull();
  });
});

describe("currency written as a code (KAN-69)", () => {
  it.each([
    ["Gross Annual Base Salary: USD 99,000 - 128,500", 99000, 128500],
    ["USD 99,000 to 128,500 annually", 99000, 128500],
    ["99,000 - 128,500 USD per year", 99000, 128500],
  ])("reads %s", (text, min, max) => {
    // The pattern required a literal "$", so a posting writing the currency
    // as a code was invisible to it — and the real range was never seen.
    expect(parseSalaryText(text)).toMatchObject({
      salary_min: min,
      salary_max: max,
      pay_period: "annual",
    });
  });

  it("still needs a currency marker of some kind", () => {
    // Without one, "3 - 5 years" and "10 - 40 hrs/week" become salary ranges,
    // which is worse than missing a figure.
    expect(parseSalaryText("99,000 - 128,500")).toBeNull();
    expect(parseSalaryText("3 - 5 years of experience")).toBeNull();
    expect(parseSalaryText("Commitment: 10-40 hrs/week")).toBeNull();
  });

  it("does not treat USDA as a currency", () => {
    // The word boundary earns its place here.
    expect(parseSalaryText("USDA approved 5 - 10 sites")).toBeNull();
  });
});

describe("a period the posting does not state (KAN-69)", () => {
  it("reads a five-figure range as annual", () => {
    // "R$75,140.56-R$135,253.01" states no period. Nobody is paid $75,140 an
    // hour, so magnitude settles it — the same line §4.2 draws when it renders
    // values below 1000 unrounded.
    expect(parseSalaryText("R$75,140.56-R$135,253.01")).toMatchObject({
      salary_min: 75140.56,
      salary_max: 135253.01,
      pay_period: "annual",
    });
  });

  it("still refuses a small range with no period", () => {
    // "$60 - $120" could be hourly or a daily rate. Guessing would be worse
    // than leaving it blank.
    expect(parseSalaryText("$60 - $120")).toBeNull();
  });

  it("reads a currency symbol with a country prefix", () => {
    // The second "R$" broke the range before: the pattern allowed an optional
    // "$" on the closing figure but no letters before it.
    expect(parseSalaryText("R$75,140.56-R$135,253.01").salary_max).toBe(135253.01);
  });
});

describe("the thousands suffix (KAN-69)", () => {
  it.each([
    ["$5,000 - $9,000 may apply per year", 5000, 9000],
    ["$5,000 - $9,000 kickoff range per year", 5000, 9000],
  ])("does not read the next word's first letter as a multiplier: %s", (text, min, max) => {
    // "may" turned $5,000 into $5,000,000,000 and "kickoff" into $5,000,000.
    // The suffix now needs a word boundary after it.
    expect(parseSalaryText(text)).toMatchObject({
      salary_min: min,
      salary_max: max,
    });
  });

  it.each([
    ["$120K - $145K", 120000],
    ["$1.2M package", 1200000],
  ])("still applies a real suffix: %s", (text, expected) => {
    expect(parseSalaryText(text).salary_min).toBe(expected);
  });
});
