const nullableText = (value) => {
  const trimmed = String(value || "").trim();
  return trimmed || null;
};

const nullableNumber = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function todayLocal(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildApplicationPayload(values) {
  const isApplied = values.status === "applied";

  return {
    company: String(values.company || "").trim(),
    role_title: String(values.role_title || "").trim(),
    job_link: nullableText(values.job_link),
    source: nullableText(values.source),
    location: nullableText(values.location),
    company_size: nullableText(values.company_size),
    years_experience_min: nullableNumber(values.years_experience_min),
    status: isApplied ? "applied" : "interested",
    salary_min: nullableNumber(values.salary_min),
    salary_max: nullableNumber(values.salary_max),
    date_applied: isApplied ? nullableText(values.date_applied) : null,
    notes: null,
    next_action: isApplied ? null : "Apply",
    next_action_date: null,
    job_description: nullableText(values.job_description),
  };
}
