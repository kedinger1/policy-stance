import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { TOPICS } from "./topics";

// Shared low-level runner: headlessly invokes Codex CLI (authenticated via `codex
// login` against a ChatGPT plan, not a metered API key) with an enforced JSON
// output shape. Returns the raw parsed JSON — callers validate with their own zod schema.
function runCodexExec(prompt: string, jsonSchema: object, opts: { webSearch: boolean }): unknown {
  const dir = mkdtempSync(path.join(tmpdir(), "codex-run-"));
  const schemaPath = path.join(dir, "schema.json");
  const outputPath = path.join(dir, "output.json");
  writeFileSync(schemaPath, JSON.stringify(jsonSchema));

  const args = ["exec", "--sandbox", "read-only", "--skip-git-repo-check"];
  if (opts.webSearch) args.push("-c", "tools.web_search=true");
  args.push("--output-schema", schemaPath, "-o", outputPath);

  // Prompt goes via stdin, not argv — avoids shell-quoting risk from embedded
  // quotes/punctuation. `shell: true` is required on Windows since the global
  // npm install resolves to a .cmd shim that spawnSync can't exec directly.
  const result = spawnSync("codex", args, {
    encoding: "utf-8",
    maxBuffer: 1024 * 1024 * 20,
    input: prompt,
    shell: true,
  });

  if (result.status !== 0) {
    throw new Error(`codex exec failed (exit ${result.status ?? "unknown"}): ${result.stderr}`);
  }

  const raw = readFileSync(outputPath, "utf-8");
  rmSync(dir, { recursive: true, force: true });
  return JSON.parse(raw);
}

// --- Position research -------------------------------------------------

const PositionSchema = z.object({
  topic: z.enum(TOPICS),
  statement_text: z.string(),
  stated_at: z.string(),
  source_url: z.string(),
  source_type: z.enum(["press_release", "speech", "social", "news_quote", "other"]),
  confidence: z.number(),
});

const ExtractionResultSchema = z.object({
  positions: z.array(PositionSchema),
});

const POSITION_JSON_SCHEMA = {
  type: "object",
  properties: {
    positions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string", enum: [...TOPICS] },
          statement_text: { type: "string" },
          stated_at: {
            type: "string",
            description:
              "ISO date YYYY-MM-DD for when the statement was actually made or published, as given by the source. " +
              "Never invent or default this — if the source has no identifiable date, omit the position entirely.",
          },
          source_url: { type: "string" },
          source_type: { type: "string", enum: ["press_release", "speech", "social", "news_quote", "other"] },
          confidence: { type: "number" },
        },
        required: ["topic", "statement_text", "stated_at", "source_url", "source_type", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["positions"],
  additionalProperties: false,
};

export type PositionCandidate = z.infer<typeof PositionSchema>;

export function researchPositionsViaCodex(politicianName: string, chamber: string, state: string): PositionCandidate[] {
  const topicList = TOPICS.join(", ");
  const prompt =
    `Research public statements and stated positions from ${politicianName}, a ${chamber} member in ${state}, ` +
    `on each of these policy topics: ${topicList}. ` +
    `Search official press releases, official legislative website statements, official social media, and news coverage quoting them directly. ` +
    `For each position found, record: topic, what they said (their own words or a close paraphrase), the exact date the statement was made or published, and the source URL. ` +
    `A specific date is required — an article publish date, a press release date, a speech date, a social media post's timestamp. ` +
    `Generic biographical or "about me" page content that isn't tied to a specific date is NOT a position statement — leave it out entirely rather than guessing a date for it. ` +
    `A voting record entry ("voted yes/no on bill X") is NOT a position statement by itself — votes are tracked separately elsewhere. ` +
    `Only include it if they also explained their reasoning in their own words (a floor speech, press release, or sponsor memo quote); the statement_text should be what they said, not just how they voted. ` +
    `Only include statements you can attribute to a real, findable source with a URL. If you find nothing credible and dated for a topic, skip it — do not fabricate content or dates. ` +
    `Respond with the final JSON result only, matching the provided schema.`;

  const raw = runCodexExec(prompt, POSITION_JSON_SCHEMA, { webSearch: true });
  return ExtractionResultSchema.parse(raw).positions;
}

// --- Vote topic tagging -------------------------------------------------

const TopicTagSchema = z.object({
  results: z.array(
    z.object({
      label: z.string(),
      topic: z.enum(TOPICS).nullable(),
    }),
  ),
});

const TOPIC_TAG_JSON_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          topic: { type: ["string", "null"], enum: [...TOPICS, null] },
        },
        required: ["label", "topic"],
        additionalProperties: false,
      },
    },
  },
  required: ["results"],
  additionalProperties: false,
};

export type VoteForTagging = { label: string; billTitle: string };

// Classifies each bill title into one topic from the fixed taxonomy, or null if
// it doesn't relate to any tracked topic (e.g. a commemorative highway naming).
// No web search needed — this is pure reasoning over the title text.
export function tagVoteTopics(voteList: VoteForTagging[]): Record<string, string | null> {
  const itemsText = voteList.map((v) => `${v.label}: ${v.billTitle}`).join("\n");
  const topicList = TOPICS.join(", ");
  const prompt =
    `Classify each bill below into exactly one topic from this fixed list, or null if it doesn't clearly relate to any of them: ${topicList}. ` +
    `Ceremonial/commemorative bills (naming highways, recognizing individuals or events) and narrow technical/procedural bills should get null. ` +
    `Respond with the final JSON result only, one entry per label, in the same order given.\n\n${itemsText}`;

  const raw = runCodexExec(prompt, TOPIC_TAG_JSON_SCHEMA, { webSearch: false });
  const parsed = TopicTagSchema.parse(raw);
  return Object.fromEntries(parsed.results.map((r) => [r.label, r.topic]));
}

// --- Vote-to-position matching -------------------------------------------------

const MatchClassificationSchema = z.object({
  results: z.array(
    z.object({
      label: z.string(),
      classification: z.enum(["kept", "broken", "partial", "na"]),
      rationale: z.string(),
      confidence: z.number(),
    }),
  ),
});

const MATCH_JSON_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          classification: { type: "string", enum: ["kept", "broken", "partial", "na"] },
          rationale: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["label", "classification", "rationale", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["results"],
  additionalProperties: false,
};

export type MatchCandidate = {
  label: string;
  billTitle: string;
  voteValue: string;
  positionStatement: string;
  positionDate: string;
};

export type MatchResult = z.infer<typeof MatchClassificationSchema>["results"][number];

// Judges whether a vote is consistent with the politician's most recent stated
// position on that topic. No web search — reasoning over the given text only.
export function classifyMatches(items: MatchCandidate[]): Record<string, Omit<MatchResult, "label">> {
  const itemsText = items
    .map(
      (i) =>
        `${i.label}:\n  Stated position (${i.positionDate}): "${i.positionStatement}"\n  Vote: "${i.voteValue}" on "${i.billTitle}"`,
    )
    .join("\n\n");

  const prompt =
    `For each item below, judge whether the vote is consistent with the politician's earlier stated position on the same topic. ` +
    `Classify as "kept" (vote clearly matches the stated position), "broken" (vote clearly contradicts it), ` +
    `"partial" (the bill is bundled/omnibus, or the vote is a defensible tradeoff that doesn't cleanly match or contradict — explain the tradeoff in the rationale), ` +
    `or "na" (the vote and position aren't actually about the same thing closely enough to judge). ` +
    `Write a one-to-two sentence rationale citing the specific vote and position. Give a confidence score from 0 to 1. ` +
    `Respond with the final JSON result only, one entry per label.\n\n${itemsText}`;

  const raw = runCodexExec(prompt, MATCH_JSON_SCHEMA, { webSearch: false });
  const parsed = MatchClassificationSchema.parse(raw);
  return Object.fromEntries(parsed.results.map(({ label, ...rest }) => [label, rest]));
}
