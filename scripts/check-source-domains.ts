import { supabase } from "./lib/supabase";

async function run() {
  const { data, error } = await supabase.from("positions").select("source_url");
  if (error) throw error;

  const onTheIssues = data.filter((p) => p.source_url?.includes("ontheissues.org"));
  console.log(`${onTheIssues.length} of ${data.length} positions cite ontheissues.org`);

  const domainCounts = new Map<string, number>();
  for (const p of data) {
    if (!p.source_url) continue;
    try {
      const domain = new URL(p.source_url).hostname;
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
    } catch {
      // skip malformed URLs
    }
  }
  console.log("\nAll source domains used, by frequency:");
  for (const [domain, count] of [...domainCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count}\t${domain}`);
  }
}

run();
