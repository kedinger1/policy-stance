import Link from "next/link";
import { TOPICS, formatTopicLabel } from "@/lib/topics";

const PILL_BASE = "rounded-full border px-3 py-1 font-mono text-xs transition-colors";
const PILL_ACTIVE = "border-teal-700 bg-teal-700 text-white dark:border-teal-400 dark:bg-teal-400 dark:text-stone-950";
const PILL_INACTIVE =
  "border-stone-300 text-stone-600 hover:border-teal-700 hover:text-teal-700 dark:border-stone-700 dark:text-stone-400";

// basePath is the current page's own path ("/" or "/politicians/<id>") so the
// filter persists across navigation instead of resetting when a topic-filtered
// list is clicked into.
export function TopicPills({ activeTopic, basePath }: { activeTopic: string | null; basePath: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link href={basePath} className={`${PILL_BASE} ${activeTopic === null ? PILL_ACTIVE : PILL_INACTIVE}`}>
        All
      </Link>
      {TOPICS.map((t) => (
        <Link key={t} href={`${basePath}?topic=${t}`} className={`${PILL_BASE} ${activeTopic === t ? PILL_ACTIVE : PILL_INACTIVE}`}>
          {formatTopicLabel(t)}
        </Link>
      ))}
    </div>
  );
}
