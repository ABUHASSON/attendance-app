const TASHKEEL =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g;

const NAME_KEYWORDS = [
  "اسم الطالب",
  "الاسم الثلاثي",
  "الاسم",
  "اسم",
  "student name",
  "name",
];

export function normalizeArabic(input: string): string {
  if (!input) return "";
  return input
    .replace(TASHKEEL, "")
    .replace(/[\u0622\u0623\u0625]/g, "\u0627") // آ أ إ -> ا
    .replace(/\u0649/g, "\u064A") // ى -> ي
    .replace(/\u0629/g, "\u0647") // ة -> ه
    .replace(/\s+/g, " ")
    .trim();
}

export function matchNameColumn(headers: string[]): number {
  const norm = headers.map((h) => normalizeArabic(h));
  for (const kw of NAME_KEYWORDS) {
    const target = normalizeArabic(kw);
    const idx = norm.findIndex(
      (h) => h === target || h.includes(target)
    );
    if (idx >= 0) return idx;
  }
  return -1;
}
