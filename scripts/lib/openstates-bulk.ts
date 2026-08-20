import { writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";

// Public, unauthenticated bulk exports -- no API key, no rate limit. Far faster
// and more reliable than paginating the live API for closed historical sessions
// (per OpenStates: monthly-refreshed, so not ideal for the still-open session
// between refreshes -- keep using ingest-votes.ts for that one's day-to-day top-ups).
export const SESSIONS = [
  { identifier: "2025-2026", url: "https://data.openstates.org/csv/latest/NY_2025-2026_csv_1ZC9XOeLy28LfCuj12GFBA.zip" },
  { identifier: "2023-2024", url: "https://data.openstates.org/csv/latest/NY_2023-2024_csv_2JUIuQ57UGKUJ0di0KC4w7.zip" },
  { identifier: "2021-2022", url: "https://data.openstates.org/csv/latest/NY_2021-2022_csv_1i36qUkzrbr6jNLjFrdisY.zip" },
  { identifier: "2019-2020", url: "https://data.openstates.org/csv/latest/NY_2019-2020_csv_OiJvES2l2q9g8qRZJhAqF.zip" },
];

export type CsvRow = Record<string, string>;

export function readSessionCsv(csvDir: string, sessionId: string, name: string): CsvRow[] {
  const filePath = path.join(csvDir, `NY_${sessionId}_${name}.csv`);
  return parse(readFileSync(filePath, "utf-8"), { columns: true, skip_empty_lines: true });
}

export async function downloadAndExtractSession(url: string, identifier: string, workDir: string): Promise<string> {
  console.log(`[${identifier}] Downloading...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${identifier}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const zipPath = path.join(workDir, `${identifier}.zip`);
  writeFileSync(zipPath, buffer);

  console.log(`[${identifier}] Extracting (${Math.round(buffer.byteLength / 1024 / 1024)}MB)...`);
  const extractDir = path.join(workDir, identifier);
  new AdmZip(zipPath).extractAllTo(extractDir, true);
  return path.join(extractDir, "NY", identifier);
}
