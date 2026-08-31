import { describe, expect, it, vi } from "vitest";
import { APPLICATIONS_URL, createApplication } from "../src/api.js";

describe("createApplication", () => {
  it("posts JSON to the deployed tracker endpoint", async () => {
    const created = { id: 42, company: "Roadie", role_title: "SDET" };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => created,
    });

    const result = await createApplication({ company: "Roadie" }, { fetchImpl });

    expect(result).toEqual(created);
    expect(fetchImpl).toHaveBeenCalledWith(
      APPLICATIONS_URL,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: "Roadie" }),
      })
    );
  });

  it("formats FastAPI validation errors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      statusText: "Unprocessable Entity",
      json: async () => ({
        detail: [{ loc: ["body", "company"], msg: "Field required" }],
      }),
    });

    await expect(createApplication({}, { fetchImpl })).rejects.toThrow(
      "company: Field required"
    );
  });

  it("turns connection failures into a useful LAN message", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(createApplication({}, { fetchImpl })).rejects.toThrow(
      "Confirm that you are on the home LAN"
    );
  });

  // KAN-55 returns 409 with a plain sentence naming the existing record, and
  // the popup has no 409-specific handling — it renders whatever message the
  // error carries. That makes "the detail survives verbatim" the whole
  // contract: fall back to statusText and the user sees "Conflict", which
  // names neither the posting nor the record they already have.
  it("surfaces a duplicate rejection verbatim", async () => {
    const detail = "Already tracked as #79: Sequencing.com — Senior QA Engineer.";
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      statusText: "Conflict",
      json: async () => ({ detail }),
    });

    await expect(
      createApplication({ company: "Sequencing.com" }, { fetchImpl })
    ).rejects.toThrow(detail);
  });

  // The archive marker is the part most worth keeping: a rejection pointing at
  // a record that is not in the list is baffling without it.
  it("keeps the archived marker on a duplicate rejection", async () => {
    const detail =
      "Already tracked as #80 (archived): Sequencing.com — Senior QA Engineer.";
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      statusText: "Conflict",
      json: async () => ({ detail }),
    });

    await expect(
      createApplication({ company: "Sequencing.com" }, { fetchImpl })
    ).rejects.toThrow("(archived)");
  });
});
