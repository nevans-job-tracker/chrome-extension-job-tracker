import { describe, expect, it } from "vitest";
import {
  employmentTypeFrom,
  parseSalaryText,
  parseStructuredSalary,
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
