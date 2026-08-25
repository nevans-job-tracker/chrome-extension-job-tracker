import { describe, expect, it } from "vitest";
import { buildApplicationPayload, todayLocal } from "../src/payload.js";

const values = {
  company: " Roadie ",
  role_title: " Software Engineer in Test ",
  job_link: "https://wellfound.com/jobs/1-example",
  source: "Wellfound",
  location: "Remote (Everywhere)",
  company_size: "large",
  years_experience_min: "3",
  salary_min: "",
  salary_max: "150000",
  status: "applied",
  date_applied: "2026-08-21",
  job_description: " Description ",
};

describe("buildApplicationPayload", () => {
  it("matches the tracker create schema", () => {
    expect(buildApplicationPayload(values)).toEqual({
      company: "Roadie",
      role_title: "Software Engineer in Test",
      job_link: "https://wellfound.com/jobs/1-example",
      source: "Wellfound",
      location: "Remote (Everywhere)",
      company_size: "large",
      years_experience_min: 3,
      status: "applied",
      salary_min: null,
      salary_max: 150000,
      pay_period: "annual",
      employment_type: null,
      hours_per_week_min: null,
      hours_per_week_max: null,
      date_applied: "2026-08-21",
      notes: null,
      next_action: null,
      next_action_date: null,
      job_description: "Description",
    });
    expect(buildApplicationPayload({ ...values, salary_currency: "A$" })).not.toHaveProperty(
      "salary_currency"
    );
  });

  it("clears the application date and sets Apply for interested jobs", () => {
    const payload = buildApplicationPayload({
      ...values,
      status: "interested",
      date_applied: "2026-08-21",
    });

    expect(payload.status).toBe("interested");
    expect(payload.date_applied).toBeNull();
    expect(payload.next_action).toBe("Apply");
  });

  it("defaults an omitted status to interested with no application date", () => {
    const payload = buildApplicationPayload({
      ...values,
      status: undefined,
    });

    expect(payload.status).toBe("interested");
    expect(payload.date_applied).toBeNull();
    expect(payload.next_action).toBe("Apply");
  });
});

describe("the fields KAN-50 and KAN-51 added", () => {
  it("carries an hourly period through", () => {
    const payload = buildApplicationPayload({
      ...values, pay_period: "hourly", salary_min: "60", salary_max: "120",
    });
    expect(payload.pay_period).toBe("hourly");
    expect(payload.salary_min).toBe(60);
  });

  it("falls back to annual rather than sending null", () => {
    // pay_period is NOT NULL on the tracker with an annual default, so a null
    // would be rejected where an absent period simply means "not stated".
    expect(buildApplicationPayload({ ...values, pay_period: null }).pay_period)
      .toBe("annual");
    expect(buildApplicationPayload({ ...values, pay_period: undefined }).pay_period)
      .toBe("annual");
  });

  it("sends a blank employment type as null, not an empty string", () => {
    // Blank means "not recorded" on the tracker; "" would fail enum validation.
    expect(buildApplicationPayload({ ...values, employment_type: "" }).employment_type)
      .toBeNull();
  });

  it("carries the weekly hours range as numbers", () => {
    const payload = buildApplicationPayload({
      ...values, hours_per_week_min: "10", hours_per_week_max: "40",
    });
    expect(payload.hours_per_week_min).toBe(10);
    expect(payload.hours_per_week_max).toBe(40);
  });
});

describe("todayLocal", () => {
  it("formats the local calendar date without UTC conversion", () => {
    expect(todayLocal(new Date(2026, 7, 21, 23, 59))).toBe("2026-08-21");
  });
});
