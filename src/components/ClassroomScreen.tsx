import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Copy,
  Download,
  Filter,
  Plus,
  Search,
  Share2,
  Sun,
  Moon,
  Trash2,
  UserPlus,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import type {
  AttendanceStatus,
  LectureRecord,
  Section,
  Student,
} from "@/types";
import { normalizeArabic } from "@/lib/normalize";
import { getSection, saveSection } from "@/lib/db";
import { exportSectionReport } from "@/lib/excel";
import { buildLectureReportText, shareText, copyText } from "@/lib/share";
import { useTheme } from "@/lib/theme";

interface Props {
  sectionId: string;
  onBack: () => void;
}

const MAX_PARTICIPATION = 2;
const WARNING_THRESHOLD = 10;

const STATUS_ORDER: AttendanceStatus[] = ["present", "absent", "leave"];
const STATUS_META: Record<
  AttendanceStatus,
  { label: string; icon: React.ReactNode; active: string; dot: string }
> = {
  present: {
    label: "حاضر",
    icon: <CheckCircle2 className="h-4 w-4" />,
    active: "bg-emerald-500 text-white",
    dot: "bg-emerald-500",
  },
  absent: {
    label: "غائب",
    icon: <XCircle className="h-4 w-4" />,
    active: "bg-red-500 text-white",
    dot: "bg-red-500",
  },
  leave: {
    label: "إجازة",
    icon: <Clock className="h-4 w-4" />,
    active: "bg-amber-500 text-white",
    dot: "bg-amber-500",
  },
};

function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

function formatDateAR(iso: string): string {
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("ar-EG", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export default function ClassroomScreen({ sectionId, onBack }: Props) {
  const [theme, toggleTheme] = useTheme();
  const [section, setSection] = useState<Section | null>(null);
  const [loading, setLoading] = useState(true);
  const [lectureDate, setLectureDate] = useState<string>(todayISO());
  const [query, setQuery] = useState("");
  const [absentsOnly, setAbsentsOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [newStudentName, setNewStudentName] = useState("");
  const [showAddStudent, setShowAddStudent] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);
  const savedFlashTimer = useRef<number | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const s = await getSection(sectionId);
      if (alive) {
        setSection(s ?? null);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [sectionId]);

  const lecture: LectureRecord | null = useMemo(() => {
    if (!section) return null;
    const found = section.lectures.find((l) => l.date === lectureDate);
    if (found) return found;
    return {
      date: lectureDate,
      attendance: {},
      participation: {},
    };
  }, [section, lectureDate]);

  const scheduleSave = (updated: Section) => {
    setSection(updated);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = window.setTimeout(async () => {
      await saveSection(updated);
      setSaving(false);
      setSavedFlash(true);
      if (savedFlashTimer.current)
        window.clearTimeout(savedFlashTimer.current);
      savedFlashTimer.current = window.setTimeout(
        () => setSavedFlash(false),
        2000
      );
    }, 400);
  };

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 dark:bg-slate-900">
        <div className="text-sm text-slate-400 dark:text-slate-500">جاري التحميل…</div>
      </div>
    );
  }

  if (!section) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 dark:bg-slate-900 px-6 text-center">
        <div>
          <p className="text-slate-500 dark:text-slate-400">تعذّر تحميل بيانات الشعبة.</p>
          <button
            onClick={onBack}
            className="mt-3 rounded-xl bg-primary-700 px-4 py-2 text-sm font-bold text-white"
          >
            رجوع
          </button>
        </div>
      </div>
    );
  }

  const cycleAttendance = (studentId: string) => {
    if (!lecture) return;
    const current = lecture.attendance[studentId] ?? "present";
    const next =
      STATUS_ORDER[(STATUS_ORDER.indexOf(current) + 1) % STATUS_ORDER.length];
    const attendance = { ...lecture.attendance, [studentId]: next };
    const participation = { ...lecture.participation };
    if (next !== "present") participation[studentId] = 0;
    upsertLecture({ ...lecture, attendance, participation });
  };

  const cycleParticipation = (studentId: string) => {
    if (!lecture) return;
    const status = lecture.attendance[studentId] ?? "present";
    if (status !== "present") return;
    const current = lecture.participation[studentId] ?? 0;
    let next: number;
    if (current === 0) next = 1;
    else if (current === 1) next = 2;
    else next = 1;
    upsertLecture({
      ...lecture,
      participation: { ...lecture.participation, [studentId]: next },
    });
  };

  const handleShareReport = async () => {
    if (!section || !lecture) return;
    const text = buildLectureReportText(section, lecture.date);
    const result = await shareText(text, `تقرير ${section.subject}`);
    if (result === "copied") showToast("تم نسخ التقرير إلى الحافظة");
    else if (result === "failed") showToast("تعذّر المشاركة والنسخ");
  };

  const handleCopyReport = async () => {
    if (!section || !lecture) return;
    const text = buildLectureReportText(section, lecture.date);
    const result = await copyText(text);
    showToast(result === "copied" ? "تم نسخ التقرير" : "تعذّر النسخ");
  };

  const upsertLecture = (lec: LectureRecord) => {
    const others = section.lectures.filter((l) => l.date !== lec.date);
    const updated: Section = { ...section, lectures: [...others, lec] };
    scheduleSave(updated);
  };

  const handleAddStudent = () => {
    const name = newStudentName.trim();
    if (!name) return;
    const norm = normalizeArabic(name);
    if (section.students.some((s) => s.normName === norm)) {
      showToast("هذا الطالب موجود بالفعل.");
      return;
    }
    const student: Student = {
      id: uid(),
      name,
      normName: norm,
      order: section.students.length,
    };
    const updated: Section = {
      ...section,
      students: [...section.students, student],
    };
    scheduleSave(updated);
    setNewStudentName("");
    setShowAddStudent(false);
    showToast("تمت إضافة الطالب.");
  };

  const handleDeleteStudent = (studentId: string) => {
    const student = section.students.find((s) => s.id === studentId);
    if (!student) return;
    if (!confirm(`حذف الطالب "${student.name}" من القائمة؟`)) return;
    const updated: Section = {
      ...section,
      students: section.students.filter((s) => s.id !== studentId),
      lectures: section.lectures.map((l) => {
        const attendance = { ...l.attendance };
        const participation = { ...l.participation };
        delete attendance[studentId];
        delete participation[studentId];
        return { ...l, attendance, participation };
      }),
    };
    scheduleSave(updated);
    showToast("تم حذف الطالب.");
  };

  // Absence count per student across all lectures
  const absenceCountFor = (studentId: string): number =>
    section.lectures.filter((l) => l.attendance[studentId] === "absent").length;

  const absencePercentFor = (studentId: string): number => {
    if (!section.totalLectures || section.totalLectures <= 0) return 0;
    return (absenceCountFor(studentId) / section.totalLectures) * 100;
  };

  // Stats
  const presentCount = section.students.filter(
    (s) => (lecture?.attendance[s.id] ?? "present") === "present"
  ).length;
  const absentCount = section.students.filter(
    (s) => lecture?.attendance[s.id] === "absent"
  ).length;
  const leaveCount = section.students.filter(
    (s) => lecture?.attendance[s.id] === "leave"
  ).length;

  const normQuery = normalizeArabic(query);
  const filtered = section.students.filter((s) => {
    if (absentsOnly) {
      const st = lecture?.attendance[s.id];
      if (st !== "absent" && st !== "leave") return false;
    }
    if (normQuery && !s.normName.includes(normQuery)) return false;
    return true;
  });

  const sortedLectureDates = [...section.lectures]
    .map((l) => l.date)
    .sort((a, b) => a.localeCompare(b));

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 pb-6">
      {/* Top bar */}
      <header className="safe-top sticky top-0 z-30 bg-gradient-to-b from-primary-800 to-primary-700 text-white shadow-md">
        <div className="mx-auto max-w-2xl px-3 pt-3 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 active:scale-95"
              aria-label="رجوع"
            >
              <ArrowRight className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-bold leading-tight">
                {section.subject}
              </h1>
              <p className="truncate text-[11px] text-primary-100">
                {section.stage} ·{" "}
                {section.studyType === "morning" ? "صباحي" : "مسائي"}
              </p>
            </div>
            <button
              onClick={toggleTheme}
              className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 active:scale-95 transition"
              aria-label="تبديل الوضع الليلي"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={handleShareReport}
              className="flex items-center gap-1 rounded-xl bg-white/15 px-2.5 py-2 text-xs font-bold active:scale-95"
              aria-label="مشاركة التقرير"
            >
              <Share2 className="h-4 w-4" />
              مشاركة
            </button>
            <button
              onClick={handleCopyReport}
              className="flex items-center gap-1 rounded-xl bg-white/15 px-2.5 py-2 text-xs font-bold active:scale-95"
              aria-label="نسخ التقرير"
            >
              <Copy className="h-4 w-4" />
              نسخ
            </button>
            <button
              onClick={() => exportSectionReport(section)}
              className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 active:scale-95"
              aria-label="تصدير Excel"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>

          {/* Stats */}
          <div className="mt-3 grid grid-cols-4 gap-2">
            <Stat label="الإجمالي" value={section.students.length} tone="neutral" />
            <Stat label="حاضر" value={presentCount} tone="present" />
            <Stat label="غائب" value={absentCount} tone="absent" />
            <Stat label="إجازة" value={leaveCount} tone="leave" />
          </div>

          {/* Date selector */}
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
            <CalendarDays className="h-4 w-4 text-primary-100" />
            <span className="text-xs text-primary-100">تاريخ المحاضرة:</span>
            <input
              type="date"
              value={lectureDate}
              onChange={(e) => setLectureDate(e.target.value)}
              className="flex-1 bg-transparent text-sm font-bold text-white outline-none [color-scheme:dark]"
            />
            <span className="hidden sm:inline text-[11px] text-primary-100">
              {formatDateAR(lectureDate)}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-3 py-3">
        {/* Save status indicator */}
        <div className="mb-2 flex items-center justify-center min-h-[20px]">
          {saving ? (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              جاري الحفظ…
            </span>
          ) : savedFlash ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 dark:bg-primary-900/30 px-3 py-1 text-[11px] font-bold text-primary-700 dark:text-primary-300 animate-fade-in">
              <CheckCircle2 className="h-3 w-3" />
              تم الحفظ تلقائياً ✓
            </span>
          ) : null}
        </div>

        {/* Search + filter + add */}
        <div className="sticky top-[148px] z-20 mb-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث باسم الطالب…"
              className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2.5 pr-9 pl-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-primary-500"
            />
          </div>
          <button
            onClick={() => setAbsentsOnly((v) => !v)}
            className={`flex items-center gap-1 rounded-2xl px-3 text-xs font-bold transition active:scale-95 ${
              absentsOnly
                ? "bg-red-500 text-white"
                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
            }`}
          >
            <Filter className="h-4 w-4" />
            الغياب
          </button>
          <button
            onClick={() => setShowAddStudent((v) => !v)}
            className="flex items-center gap-1 rounded-2xl bg-primary-600 px-3 text-xs font-bold text-white active:scale-95 transition"
          >
            <UserPlus className="h-4 w-4" />
            إضافة
          </button>
        </div>

        {/* Inline add-student form */}
        {showAddStudent && (
          <div className="mb-3 rounded-2xl bg-white dark:bg-slate-800 p-3 shadow-sm animate-slide-up">
            <div className="flex gap-2">
              <input
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddStudent()}
                placeholder="اسم الطالب الجديد…"
                className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-primary-500"
                autoFocus
              />
              <button
                onClick={handleAddStudent}
                className="rounded-xl bg-primary-700 px-4 py-2 text-sm font-bold text-white active:scale-95"
              >
                إضافة
              </button>
            </div>
          </div>
        )}

        {/* Student list */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-slate-800 px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
            لا يوجد طلاب مطابقون.
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((s) => {
              const pct = Math.round(absencePercentFor(s.id));
              const warned =
                section.totalLectures && pct >= WARNING_THRESHOLD;
              return (
                <StudentRow
                  key={s.id}
                  student={s}
                  status={lecture?.attendance[s.id] ?? "present"}
                  points={lecture?.participation[s.id] ?? 0}
                  warned={!!warned}
                  absencePct={pct}
                  onCycle={() => cycleAttendance(s.id)}
                  onCycleParticipation={() => cycleParticipation(s.id)}
                  onDelete={() => handleDeleteStudent(s.id)}
                />
              );
            })}
          </ul>
        )}

        {/* Lecture history */}
        {sortedLectureDates.length > 0 && (
          <section className="mt-6 rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
              <CalendarDays className="h-4 w-4 text-primary-700 dark:text-primary-400" />
              سجل المحاضرات ({sortedLectureDates.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              {sortedLectureDates.map((d) => {
                const lec = section.lectures.find((l) => l.date === d)!;
                const p = section.students.filter(
                  (s) => (lec.attendance[s.id] ?? "present") === "present"
                ).length;
                const a = section.students.filter(
                  (s) => lec.attendance[s.id] === "absent"
                ).length;
                return (
                  <button
                    key={d}
                    onClick={() => setLectureDate(d)}
                    className={`rounded-xl border px-3 py-2 text-xs transition ${
                      d === lectureDate
                        ? "border-primary-600 bg-primary-50 dark:bg-primary-900/30 font-bold text-primary-800 dark:text-primary-300"
                        : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {d}
                    <span className="mr-1.5 text-emerald-600 dark:text-emerald-400">✓{p}</span>
                    <span className="text-red-500 dark:text-red-400">✗{a}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 animate-fade-in">
          <div className="rounded-2xl bg-slate-900/95 dark:bg-slate-700/95 px-5 py-3 text-sm font-semibold text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "present" | "absent" | "leave";
}) {
  const toneClass = {
    neutral: "bg-white/15",
    present: "bg-emerald-500/90",
    absent: "bg-red-500/90",
    leave: "bg-amber-500/90",
  }[tone];
  return (
    <div
      className={`rounded-xl px-2 py-2 text-center ${toneClass} transition`}
    >
      <div className="text-lg font-bold leading-none">{value}</div>
      <div className="mt-1 text-[10px] opacity-90">{label}</div>
    </div>
  );
}

function StudentRow({
  student,
  status,
  points,
  warned,
  absencePct,
  onCycle,
  onCycleParticipation,
  onDelete,
}: {
  student: Student;
  status: AttendanceStatus;
  points: number;
  warned: boolean;
  absencePct: number;
  onCycle: () => void;
  onCycleParticipation: () => void;
  onDelete: () => void;
}) {
  const meta = STATUS_META[status];
  const locked = status !== "present";
  const maxed = points >= MAX_PARTICIPATION;
  const [popping, setPopping] = useState(false);

  const handlePartClick = () => {
    if (locked) return;
    onCycleParticipation();
    setPopping(true);
    navigator.vibrate?.(15);
    window.setTimeout(() => setPopping(false), 220);
  };

  return (
    <li className="flex items-center gap-1.5 rounded-2xl bg-white dark:bg-slate-800 p-2.5 shadow-sm animate-fade-in">
      {/* Participation (left in RTL = left side) */}
      <div className="w-[76px] shrink-0">
        <button
          onClick={handlePartClick}
          disabled={locked}
          className={`relative flex h-11 w-full flex-col items-center justify-center rounded-xl text-xs font-bold transition select-none ${
            locked
              ? "bg-slate-100 dark:bg-slate-700 text-slate-300 dark:text-slate-500"
              : maxed
                ? "bg-emerald-500 text-white shadow-sm"
                : "bg-primary-50 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300 active:scale-95"
          } ${popping ? "animate-pop" : ""}`}
          aria-label="مشاركة"
        >
          <span className="flex items-center gap-0.5 text-sm">
            {locked ? (
              <Clock className="h-3.5 w-3.5" />
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                مشاركة
              </>
            )}
          </span>
          <span className="text-[11px] font-extrabold">
            {locked ? "—" : `${points}/${MAX_PARTICIPATION}`}
          </span>
          {maxed && !locked && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[8px] text-white">
              ✓
            </span>
          )}
        </button>
      </div>

      {/* Name + warning */}
      <div className="min-w-0 flex-1 px-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100" dir="auto">
            {student.name}
          </p>
          {warned && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 text-[9px] font-bold text-red-700 dark:text-red-400">
              <AlertTriangle className="h-2.5 w-2.5" />
              إنذار {absencePct}%
            </span>
          )}
        </div>
        {maxed && !locked && (
          <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            اكتملت المشاركة
          </p>
        )}
        {locked && (
          <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
            المشاركة موقوفة
          </p>
        )}
      </div>

      {/* Delete student */}
      <button
        onClick={onDelete}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-300 dark:text-slate-600 active:scale-90 hover:text-red-500 dark:hover:text-red-400 transition"
        aria-label="حذف الطالب"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {/* Attendance toggle */}
      <button
        onClick={onCycle}
        className={`flex h-11 w-[68px] shrink-0 items-center justify-center gap-1 rounded-xl px-2 text-xs font-bold shadow-sm transition active:scale-95 ${meta.active}`}
      >
        {meta.icon}
        {meta.label}
      </button>
    </li>
  );
}
