export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  while (cursor <= text.length) {
    const at = lower.indexOf(needle, cursor);
    if (at === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    if (at > cursor) parts.push(text.slice(cursor, at));
    parts.push(<mark key={key++}>{text.slice(at, at + q.length)}</mark>);
    cursor = at + q.length;
  }
  return <>{parts}</>;
}
