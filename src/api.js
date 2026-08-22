export const TRACKER_ORIGIN = "http://192.168.0.151";
export const APPLICATIONS_URL = `${TRACKER_ORIGIN}/api/applications`;

function formatDetail(detail) {
  if (!detail) return null;
  if (typeof detail === "string") return detail;
  if (!Array.isArray(detail)) return null;

  return detail
    .map((item) => {
      const field = Array.isArray(item.loc)
        ? item.loc.filter((part) => part !== "body").join(".")
        : null;
      const message = item.msg || "Invalid value";
      return field ? `${field}: ${message}` : message;
    })
    .join("; ");
}

export async function createApplication(payload, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs || 12_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetchImpl(APPLICATIONS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("The Job Tracker did not respond within 12 seconds.");
    }
    throw new Error(
      "Could not reach the Job Tracker. Confirm that you are on the home LAN and the server is running."
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let message = response.statusText || `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = formatDetail(body.detail) || message;
    } catch {
      // Keep the HTTP status text when the response is not JSON.
    }
    throw new Error(message);
  }

  return response.json();
}
