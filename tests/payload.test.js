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

describe("todayLocal", () => {
  it("formats the local calendar date without UTC conversion", () => {
    expect(todayLocal(new Date(2026, 7, 21, 23, 59))).toBe("2026-08-21");
  });
});
