export function familyColor(id: string, depth = 0): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return `hsl(${hash % 360},${48 + Math.min(depth, 4) * 4}%,${48 + Math.min(depth, 4) * 3}%)`;
}
