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
});
