import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { anthropic } from "./lib/anthropic";
import { supabase } from "./lib/supabase";
import { TOPICS } from "./lib/topics";

// Small pilot batch while validating the extraction pipeline — raise once confirmed good.
const PILOT_LIMIT = 2;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const PositionSchema = z.object({
  topic: z.enum(TOPICS),
  statement_text: z.string(),
  stated_at: z
    .string()
    .describe(
      "ISO date YYYY-MM-DD for when the statement was actually made or published, as given by the source. " +
        "Never invent or default this — if the source has no identifiable date, this position must not appear in the output at all.",
    ),
  source_url: z.string(),
  source_type: z.enum(["press_release", "speech", "social", "news_quote", "other"]),
  confidence: z.number().describe("0 to 1: confidence this is a genuine, verifiable public statement"),
});

const ExtractionResultSchema = z.object({
  positions: z.array(PositionSchema),
});

// Multi-round web-search calls can run long; give them more room than the
// SDK default and retry transient connection/timeout errors a couple times.
async function createWithRetry(
  params: Anthropic.MessageCreateParamsNonStreaming,
  retriesLeft = 2,
): Promise<Anthropic.Message> {
  try {
    return await anthropic.messages.create(params, { timeout: 20 * 60 * 1000 });
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionError && retriesLeft > 0) {
      console.log(`Connection error, retrying (${retriesLeft} attempt(s) left)...`);
      return createWithRetry(params, retriesLeft - 1);
    }
    throw err;
  }
}

async function researchPositions(politicianName: string, chamber: string, state: string): Promise<string> {
  const topicList = TOPICS.join(", ");
  let messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        `Research public statements and stated positions from ${politicianName}, a ${chamber} member in ${state}, ` +
        `on each of these policy topics: ${topicList}. ` +
        `Search official press releases, official legislative website statements, official social media, and news coverage quoting them directly. ` +
        `For each position found, write a dated, sourced note: topic, what they said (in their own words or closely paraphrased), the exact date the statement was made or published, and the source URL. ` +
        `A specific date is required — an article publish date, a press release date, a speech date, a social media post's timestamp. ` +
        `Generic biographical or "about me" page content that isn't tied to a specific date is NOT a position statement — leave it out entirely rather than guessing a date for it. ` +
        `Only include statements you can attribute to a real, findable source with a URL. If you find nothing credible and dated for a topic, skip it — do not fabricate content or dates.`,
    },
  ];

  for (;;) {
    const response = await createWithRetry({
      model: "claude-sonnet-5",
      max_tokens: 8000,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
      messages,
    });

    if (response.stop_reason === "pause_turn") {
      messages = [...messages, { role: "assistant", content: response.content }];
      continue;
    }

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n\n");
  }
}

async function extractPositions(brief: string) {
  const response = await anthropic.messages.parse({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content:
          `Extract every dated, sourced position statement from this research brief into structured form. ` +
          `Skip anything without a clear source URL or a specific, real date — never invent a date, and never use a generic/default date like the start of a year or the current date. ` +
          `Undated biographical or "about me" content is not a position statement; exclude it.\n\n${brief}`,
      },
    ],
    output_config: { format: zodOutputFormat(ExtractionResultSchema) },
  });

  return response.parsed_output?.positions ?? [];
}

async function run() {
  const { data: politicians, error } = await supabase
    .from("politicians")
    .select("id, full_name, chamber, state")
    .limit(PILOT_LIMIT);
  if (error) throw error;

  for (const politician of politicians) {
    console.log(`Researching ${politician.full_name}...`);
    const brief = await researchPositions(politician.full_name, politician.chamber, politician.state);
    console.log(`Brief length: ${brief.length} chars`);

    const positions = await extractPositions(brief);
    console.log(`Extracted ${positions.length} candidate positions`);

    const rows = [];
    let skippedBadDate = 0;
    for (const p of positions) {
      if (!DATE_RE.test(p.stated_at)) {
        skippedBadDate++;
        continue;
      }
      rows.push({
        politician_id: politician.id,
        topic: p.topic,
        statement_text: p.statement_text,
        source_type: p.source_type,
        source_url: p.source_url,
        stated_at: p.stated_at,
        extraction_confidence: p.confidence,
      });
    }

    if (skippedBadDate > 0) {
      console.log(`Skipped ${skippedBadDate} positions with unparseable dates`);
    }

    // Dev-loop convenience: clear this politician's prior extraction before inserting the fresh one.
    const { error: deleteError } = await supabase.from("positions").delete().eq("politician_id", politician.id);
    if (deleteError) throw deleteError;

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from("positions").insert(rows);
      if (insertError) throw insertError;
    }
    console.log(`Inserted ${rows.length} positions for ${politician.full_name}`);
  }

  console.log("Done.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
