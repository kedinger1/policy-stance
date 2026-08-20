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

const TOPIC_LABELS: Record<string, string> = {
  housing: "Housing",
  healthcare: "Healthcare",
  reproductive_rights: "Reproductive Rights",
  policing_public_safety: "Policing & Public Safety",
  criminal_justice_reform: "Criminal Justice Reform",
  education_school_funding: "Education & School Funding",
  taxes_budget: "Taxes & Budget",
  environment_climate: "Environment & Climate",
  gun_policy: "Gun Policy",
  immigration: "Immigration",
  labor_minimum_wage: "Labor & Minimum Wage",
};

export function formatTopicLabel(topic: string): string {
  return TOPIC_LABELS[topic] ?? topic;
}
