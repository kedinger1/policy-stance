// Plain <img>, not next/image — headshot URLs come from many different NY
// government/campaign domains, and next/image requires each one whitelisted
// in next.config.ts. Not worth the maintenance burden for a lightweight tool.
export function Avatar({ src, name, size = 40 }: { src: string | null; name: string; size?: number }) {
  const style = { width: size, height: size };

  if (!src) {
    const initials = name
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
    return (
      <div
        style={style}
        className="flex shrink-0 items-center justify-center rounded-full bg-teal-100 font-mono text-xs font-semibold text-teal-800 dark:bg-teal-950 dark:text-teal-300"
      >
        {initials}
      </div>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={name} style={style} className="shrink-0 rounded-full object-cover" />;
}
