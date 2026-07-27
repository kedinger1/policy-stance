// Fixed taxonomy so positions and votes can be matched on a shared vocabulary.
export const TOPICS = [
  "housing",
  "healthcare",
  "reproductive_rights",
  "policing_public_safety",
  "criminal_justice_reform",
  "education_school_funding",
  "taxes_budget",
  "environment_climate",
  "gun_policy",
  "immigration",
  "labor_minimum_wage",
] as const;

export type Topic = (typeof TOPICS)[number];
