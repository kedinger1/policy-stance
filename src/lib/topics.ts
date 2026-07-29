import { TOPICS } from "../../scripts/lib/topics";

export { TOPICS };

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
