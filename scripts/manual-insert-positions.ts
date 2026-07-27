import { supabase } from "./lib/supabase";

// Manually researched via Claude Code's own WebSearch/WebFetch (no Anthropic API spend) —
// a one-off validation pass to check the extraction methodology without burning API credits.
// Every entry below was verified against its source URL: real date, real quote, real page.

const STIRPE_POSITIONS = [
  {
    topic: "taxes_budget",
    statement_text:
      "The 2025-26 state budget delivers real results! We plan to tackle affordability to ensure that New York remains a place where people can thrive and reach their full potential.",
    source_type: "press_release",
    source_url: "https://nyassembly.gov/mem/Al-Stirpe/story/113929",
    stated_at: "2025-05-06",
    extraction_confidence: 0.9,
  },
  {
    topic: "healthcare",
    statement_text:
      "Hospice and palliative care are critical resources for New Yorkers approaching the end of their life, yet sadly these services are underused.",
    source_type: "press_release",
    source_url: "https://nyassembly.gov/mem/Al-Stirpe/story/101989",
    stated_at: "2022-05-17",
    extraction_confidence: 0.85,
  },
  {
    topic: "housing",
    statement_text:
      "It's more important than ever that we take smart and effective steps to encourage growth in our communities that will last for years to come.",
    source_type: "press_release",
    source_url: "https://nyassembly.gov/mem/Al-Stirpe/story/101987",
    stated_at: "2022-05-11",
    extraction_confidence: 0.8,
  },
  {
    topic: "taxes_budget",
    statement_text: "Diapers are a basic need that no baby should ever have to go without.",
    source_type: "press_release",
    source_url: "https://nyassembly.gov/mem/Al-Stirpe/story/102327",
    stated_at: "2022-06-06",
    extraction_confidence: 0.75,
  },
  {
    topic: "education_school_funding",
    statement_text:
      "Every student deserves a comprehensive education that affords them the skills needed to succeed in the 21st-century economy and build a secure future.",
    source_type: "press_release",
    source_url: "https://www.assembly.ny.gov/mem/Al-Stirpe/story/69076",
    stated_at: "2016-04-01",
    extraction_confidence: 0.85,
  },
];

const TAYLOR_POSITIONS = [
  {
    topic: "gun_policy",
    statement_text: "Gun violence is a scourge on our communities that has claimed far too many lives.",
    source_type: "press_release",
    source_url: "https://nyassembly.gov/mem/Al-Taylor/story/99547",
    stated_at: "2021-10-29",
    extraction_confidence: 0.9,
  },
  {
    topic: "labor_minimum_wage",
    statement_text: "Raising the minimum wage in New York was much needed and long overdue.",
    source_type: "press_release",
    source_url: "https://nyassembly.gov/mem/Al-Taylor/story/84391",
    stated_at: "2019-01-01",
    extraction_confidence: 0.9,
  },
  {
    topic: "immigration",
    statement_text:
      "Dreamers came to New York with their families, as many immigrants did before them, and are an integral part of the New York community.",
    source_type: "press_release",
    source_url: "https://nyassembly.gov/mem/Al-Taylor/story/84576",
    stated_at: "2019-01-23",
    extraction_confidence: 0.9,
  },
  {
    topic: "education_school_funding",
    statement_text:
      "The bill gives school districts the ability to determine what is best for their students. Standardized tests should not guide classroom instruction.",
    source_type: "press_release",
    source_url: "https://nyassembly.gov/mem/Al-Taylor/story/84679",
    stated_at: "2019-01-23",
    extraction_confidence: 0.85,
  },
  {
    topic: "healthcare",
    statement_text:
      "The ongoing opioid epidemic has devastated New York families with heartbreaking consequences, and settlement funds will support addiction prevention and treatment programs.",
    source_type: "press_release",
    source_url: "https://nyassembly.gov/mem/Al-Taylor/story/99568",
    stated_at: "2021-06-09",
    extraction_confidence: 0.8,
  },
  {
    topic: "housing",
    statement_text: "Everyone has struggled and we can't leave small landlords and renters behind.",
    source_type: "press_release",
    source_url: "https://nyassembly.gov/mem/Al-Taylor/story/99567",
    stated_at: "2021-09-01",
    extraction_confidence: 0.85,
  },
  {
    topic: "reproductive_rights",
    statement_text:
      "I was glad to be able to step into this space, and do what I should have done last year, which is allow people to go into the booth and pull the lever and make their own decision. My views should not overrule the right for someone else to make their own decisions.",
    source_type: "news_quote",
    source_url:
      "https://www.cityandstateny.com/politics/2023/01/al-taylor-has-come-around-new-yorks-equality-amendment/382222/",
    stated_at: "2023-01-26",
    extraction_confidence: 0.9,
  },
];

async function run() {
  const { data: politicians, error } = await supabase
    .from("politicians")
    .select("id, full_name")
    .in("full_name", ["Al Stirpe", "Al Taylor"]);
  if (error) throw error;

  const idByName = new Map(politicians.map((p) => [p.full_name, p.id]));
  const stirpeId = idByName.get("Al Stirpe");
  const taylorId = idByName.get("Al Taylor");
  if (!stirpeId || !taylorId) throw new Error("Could not find both pilot politicians in the politicians table");

  const rows = [
    ...STIRPE_POSITIONS.map((p) => ({ ...p, politician_id: stirpeId })),
    ...TAYLOR_POSITIONS.map((p) => ({ ...p, politician_id: taylorId })),
  ];

  const { error: deleteError } = await supabase.from("positions").delete().in("politician_id", [stirpeId, taylorId]);
  if (deleteError) throw deleteError;

  const { error: insertError } = await supabase.from("positions").insert(rows);
  if (insertError) throw insertError;

  console.log(`Inserted ${rows.length} manually-researched positions (${STIRPE_POSITIONS.length} Stirpe, ${TAYLOR_POSITIONS.length} Taylor).`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
