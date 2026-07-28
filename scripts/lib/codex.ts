import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { TOPICS } from "./topics";

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

const JSON_SCHEMA = {
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

// Runs Codex CLI headlessly (authenticated via `codex login` against a ChatGPT plan,
// not a metered API key) to research and extract sourced position statements in one pass.
export function researchPositionsViaCodex(politicianName: string, chamber: string, state: string): PositionCandidate[] {
  const dir = mkdtempSync(path.join(tmpdir(), "codex-positions-"));
  const schemaPath = path.join(dir, "schema.json");
  const outputPath = path.join(dir, "output.json");
  writeFileSync(schemaPath, JSON.stringify(JSON_SCHEMA));

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

  // Prompt goes via stdin, not argv — avoids shell-quoting risk from the embedded
  // quotes/punctuation in the prompt text (codex exec reads stdin when no
  // positional PROMPT arg is given). `shell: true` is required on Windows since
  // the global npm install resolves to a .cmd shim that spawnSync can't exec directly.
  const result = spawnSync(
    "codex",
    ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "-c", "tools.web_search=true", "--output-schema", schemaPath, "-o", outputPath],
    { encoding: "utf-8", maxBuffer: 1024 * 1024 * 20, input: prompt, shell: true },
  );

  if (result.status !== 0) {
    throw new Error(`codex exec failed (exit ${result.status ?? "unknown"}): ${result.stderr}`);
  }

  const raw = readFileSync(outputPath, "utf-8");
  rmSync(dir, { recursive: true, force: true });

  const parsed = ExtractionResultSchema.parse(JSON.parse(raw));
  return parsed.positions;
}
