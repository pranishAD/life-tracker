// Emoji data for the pickers (11c goal identity, 12b category dialog).
// The data comes from @emoji-mart/data (data only — we style the picker
// ourselves). It's ~400 KB of JSON, so it's loaded with a dynamic
// `import()`: Vite splits it into its own chunk that's only downloaded the
// first time a picker opens, keeping the main bundle small.
import type { EmojiMartData } from "@emoji-mart/data";

export interface EmojiEntry {
  native: string;
  name: string;
  /** Lowercase search words (name words + keywords). */
  words: string[];
}

export interface EmojiSection {
  id: string;
  label: string;
  emojis: EmojiEntry[];
}

export interface EmojiIndex {
  sections: EmojiSection[];
  all: EmojiEntry[];
}

// Section order in the picker: the categories people use for goals first.
const SECTION_ORDER: { id: string; label: string }[] = [
  { id: "activity", label: "Activity" },
  { id: "objects", label: "Objects" },
  { id: "foods", label: "Food" },
  { id: "nature", label: "Nature" },
  { id: "symbols", label: "Symbols" },
  { id: "people", label: "Smileys and people" },
  { id: "places", label: "Travel and places" },
  { id: "flags", label: "Flags" },
];

let cache: Promise<EmojiIndex> | null = null;

/** Load (once) and index the emoji data. */
export function loadEmojiIndex(): Promise<EmojiIndex> {
  if (!cache) {
    cache = import("@emoji-mart/data").then((mod) => {
      const data = ((mod as { default?: EmojiMartData }).default ?? mod) as EmojiMartData;
      return buildIndex(data);
    });
    // If the chunk fails to download, let the next open try again.
    cache.catch(() => {
      cache = null;
    });
  }
  return cache;
}

export function buildIndex(data: EmojiMartData): EmojiIndex {
  const toEntry = (id: string): EmojiEntry | null => {
    const e = data.emojis[id];
    if (!e?.skins?.[0]) return null;
    const words = [...e.name.toLowerCase().split(/[\s_-]+/), ...e.keywords.map((k) => k.toLowerCase())];
    return { native: e.skins[0].native, name: e.name, words };
  };
  const sections: EmojiSection[] = [];
  for (const { id, label } of SECTION_ORDER) {
    const cat = data.categories.find((c) => c.id === id);
    if (!cat) continue;
    sections.push({ id, label, emojis: cat.emojis.map(toEntry).filter((e): e is EmojiEntry => !!e) });
  }
  return { sections, all: sections.flatMap((s) => s.emojis) };
}

/** Search by name/keyword prefix, best matches first. */
export function searchEmoji(index: EmojiIndex, query: string, limit = 64): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const exact: EmojiEntry[] = [];
  const prefix: EmojiEntry[] = [];
  for (const e of index.all) {
    if (e.words.includes(q)) exact.push(e);
    else if (e.words.some((w) => w.startsWith(q))) prefix.push(e);
  }
  return [...exact, ...prefix].slice(0, limit);
}

// Hand-picked suggestions for common goal words, so "Run 5 km" gives a
// sensible row (design 11c: "Suggested for running"). Anything else falls
// back to a keyword search on the goal name.
const CURATED: { match: RegExp; label: string; emojis: string[] }[] = [
  { match: /\b(run|runs|running|jog|5k|10k|marathon)\b/, label: "running", emojis: ["🏃", "🏃‍♀️", "👟", "⏱️", "🏅", "🔥", "💨", "🛣️"] },
  { match: /\b(gym|lift|lifting|bench|squat|deadlift|workout|strength)\b/, label: "the gym", emojis: ["💪", "🏋️", "🏋️‍♀️", "🔥", "🥇", "⏱️", "🍗", "🎯"] },
  { match: /\b(read|reading|book|books|pages)\b/, label: "reading", emojis: ["📖", "📚", "🔖", "🤓", "☕", "🧠", "✍️", "🌙"] },
  { match: /\b(study|exam|assignment|class|course|uni|revise|test)\b/, label: "studying", emojis: ["📝", "🎓", "📚", "🧠", "✏️", "📐", "💡", "⏰"] },
  { match: /\b(sleep|bed|wake)\b/, label: "sleep", emojis: ["🌙", "😴", "🛏️", "⏰", "🌅", "💤", "🧸", "🕚"] },
  { match: /\b(save|saving|money|rs|budget|debt|invest)\b/, label: "money", emojis: ["🐷", "💰", "💵", "🏦", "📈", "🪙", "💳", "🎯"] },
  { match: /\b(meditate|meditation|mindful|calm|breathe|yoga)\b/, label: "mindfulness", emojis: ["🧘", "🧘‍♀️", "🌿", "🕯️", "☮️", "🌸", "🫧", "🌙"] },
  { match: /\b(job|jobs|apply|career|interview|cv|resume)\b/, label: "job hunting", emojis: ["📨", "💼", "📄", "🤝", "🎯", "📈", "✉️", "🏢"] },
  { match: /\b(react|code|coding|program|portfolio|site|website|app|ship)\b/, label: "coding", emojis: ["💻", "⚛️", "🌐", "🚀", "🛠️", "🧑‍💻", "⌨️", "🐛"] },
  { match: /\b(water|drink|hydrate)\b/, label: "water", emojis: ["💧", "🚰", "🥤", "🧊", "🌊", "🥛", "🫗", "✅"] },
  { match: /\b(walk|walking|steps|hike)\b/, label: "walking", emojis: ["🚶", "👟", "🥾", "⛰️", "🌳", "🗺️", "🦶", "☀️"] },
  { match: /\b(swim|swimming)\b/, label: "swimming", emojis: ["🏊", "🏊‍♀️", "🌊", "🥽", "💧", "⏱️", "🏅", "🐬"] },
  { match: /\b(bike|cycle|cycling|ride)\b/, label: "cycling", emojis: ["🚴", "🚲", "🚵", "⛰️", "⏱️", "🛣️", "🏅", "💨"] },
  { match: /\b(write|writing|journal|blog)\b/, label: "writing", emojis: ["✍️", "📝", "📓", "🖋️", "💭", "📚", "☕", "💡"] },
];

const STOP_WORDS = new Set([
  "the", "and", "for", "under", "with", "day", "days", "week", "weeks", "times", "time", "min", "mins",
  "target", "every", "per", "get", "finish", "start", "more", "less", "than", "from", "into", "a", "an",
]);

/** "Suggested for <thing>" row for a goal name, or null if nothing fits. */
export function suggestForGoal(index: EmojiIndex | null, goalName: string): { label: string; emojis: string[] } | null {
  const name = goalName.toLowerCase();
  if (!name.trim()) return null;
  const curated = CURATED.find((c) => c.match.test(name));
  if (curated) return { label: curated.label, emojis: curated.emojis };
  if (!index) return null;
  const tokens = name.split(/[^a-z]+/).filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
  for (const token of tokens) {
    const hits = searchEmoji(index, token, 8);
    if (hits.length > 0) return { label: token, emojis: hits.map((h) => h.native) };
  }
  return null;
}

// Recent picks, newest first, kept on this device only.
const RECENT_KEY = "bihan_recent_emoji";
const RECENT_MAX = 16;

export function getRecentEmoji(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecentEmoji(emoji: string): void {
  const next = [emoji, ...getRecentEmoji().filter((e) => e !== emoji)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // storage full / disabled: recents are a nice-to-have, ignore.
  }
}
