// Plain, environment-agnostic — used both server-side (verification/new and
// verification/pending/[id] pages, computing default values) and would be fine client-side too.
// Kept out of entry-form.tsx (a "use client" module) specifically so the server-side callers can
// invoke it directly instead of just rendering it as a component prop.
export function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
