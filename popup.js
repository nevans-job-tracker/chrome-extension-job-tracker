import { createApplication, TRACKER_ORIGIN } from "./src/api.js";
import { buildApplicationPayload, todayLocal } from "./src/payload.js";
import { identifySite, unsupportedPostingMessage } from "./src/sites/catalog.js";

const form = document.querySelector("#application-form");
const statusMessage = document.querySelector("#status-message");
const warningsPanel = document.querySelector("#warnings");
const warningList = document.querySelector("#warning-list");
const submitError = document.querySelector("#submit-error");
const createButton = document.querySelector("#create-button");
const trackingStatus = document.querySelector("#tracking-status");
const dateApplied = document.querySelector("#date-applied");
const successPanel = document.querySelector("#success-panel");
const recoveryLink = document.querySelector("#recovery-link");

function setStatus(message, type = "info") {
  statusMessage.textContent = message;
  statusMessage.className = `notice notice-${type}`;
  statusMessage.hidden = false;
}

function showWarnings(warnings) {
  warningList.replaceChildren();
  for (const warning of warnings) {
    const item = document.createElement("li");
    item.textContent = warning;
    warningList.append(item);
  }
  warningsPanel.hidden = warnings.length === 0;
}

function fillForm(data) {
  for (const [name, value] of Object.entries(data)) {
    const field = form.elements.namedItem(name);
    if (field) field.value = value ?? "";
  }
  form.elements.status.value = "interested";
  dateApplied.value = "";
  updateDateBehavior();
}

function updateDateBehavior() {
  const interested = trackingStatus.value === "interested";
  dateApplied.disabled = interested;
  if (interested) dateApplied.value = "";
  else if (!dateApplied.value) dateApplied.value = todayLocal();
}

async function extractCurrentPosting() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !identifySite(tab.url || "")) {
      throw new Error(unsupportedPostingMessage());
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["dist/extract-current-job.js"],
    });
    const result = await chrome.tabs.sendMessage(tab.id, {
      type: "EXTRACT_CURRENT_JOB",
    });

    if (!result?.ok) {
      if (result?.recovery_url) {
        recoveryLink.href = result.recovery_url;
        recoveryLink.hidden = false;
      }
      throw new Error(result?.error || "The posting could not be read.");
    }

    fillForm(result.data);
    showWarnings(result.warnings || []);
    statusMessage.hidden = true;
    form.hidden = false;
  } catch (error) {
    setStatus(error.message || "The posting could not be read.", "error");
  }
}

trackingStatus.addEventListener("change", updateDateBehavior);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitError.hidden = true;

  const values = Object.fromEntries(new FormData(form));
  values.status = trackingStatus.value;
  values.date_applied = dateApplied.value;
  const payload = buildApplicationPayload(values);

  if (
    payload.salary_min !== null &&
    payload.salary_max !== null &&
    payload.salary_min > payload.salary_max
  ) {
    submitError.textContent = "Salary minimum cannot be greater than salary maximum.";
    submitError.hidden = false;
    return;
  }

  createButton.disabled = true;
  createButton.textContent = "Creating…";

  try {
    const created = await createApplication(payload);
    form.hidden = true;
    warningsPanel.hidden = true;
    statusMessage.hidden = true;

    document.querySelector("#success-summary").textContent =
      `${created.company} — ${created.role_title}`;
    const createdLink = document.querySelector("#created-link");
    createdLink.href = `${TRACKER_ORIGIN}/applications/${created.id}`;
    successPanel.hidden = false;
  } catch (error) {
    submitError.textContent = error.message || "The application could not be created.";
    submitError.hidden = false;
    createButton.disabled = false;
    createButton.textContent = "Create application";
  }
});

extractCurrentPosting();
