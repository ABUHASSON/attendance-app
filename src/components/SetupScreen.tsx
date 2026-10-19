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
  Edit2,
  MoveVertical,
  X,
  Minus,
} from "lucide-react";
import type { AttendanceStatus, LectureRecord, Section, Student } from "@/types";
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

const STATUS_ORDER: AttendanceStatus[] = ["present", "absent", "leave"];
const STATUS_META: Record<AttendanceStatus, { label: string; icon: React.ReactNode; active: string }> = {
  present: { label: "حاضر", icon: <CheckCircle2 className="h-4 w-4" />, active: "bg-emerald-500 text-white shadow-sm" },
  absent: { label: "غائب", icon: <XCircle className="h-4 w-4" />, active: "bg-red-500 text-white shadow-sm" },
  leave: { label: "إجازة", icon: <Clock className="h-4 w-4" />, active: "bg-amber-500 text-white shadow-sm" },
};

function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export default function ClassroomScreen({ sectionId, onBack }: Props) {
  const [theme, toggleTheme] = useTheme();
  const [section, setSection] = useState<Section | null>(null);
  const [loading, setLoading] = useState(true);
  const [lectureDate, setLectureDate] = useState<string>(todayISO());
  const [query, setQuery] = useState("");
  const [absentsOnly, setAbsentsOnly] = useState(false);

  // حالة خيارات الطالب عند الضغط المطول
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [editName, setEditName] = useState("");
  const [movePosition, setMovePosition] = useState<number>(1);
  const [modalMode, setModalMode] = useState<"menu" | "edit" | "move">("menu");

  const loadData = async () => {
    setLoading(true);
    const s = await getSection(sectionId);
    setSection(s ?? null);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [sectionId]);

  const lecture: LectureRecord | null = useMemo(() => {
    if (!section) return null;
    return section.lectures.find((l) => l.date === lectureDate) || { date: lectureDate, attendance: {}, participation: {} };
  }, [section, lectureDate]);

  const scheduleSave = async (updated: Section) => {
    setSection(updated);
    await saveSection(updated);
  };

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    if (!section) return;
    const lectures = [...section.lectures];
    let idx = lectures.findIndex((l) => l.date === lectureDate);
    let currentLec: LectureRecord = idx >= 0 ? { ...lectures[idx], attendance: { ...lectures[idx].attendance } } : { date: lectureDate, attendance: {}, participation: {} };

    currentLec.attendance[studentId] = status;
    if (idx >= 0) lectures[idx] = currentLec;
    else lectures.push(currentLec);

    scheduleSave({ ...section, lectures });
  };

  const setParticipation = (studentId: string, delta: number) => {
    if (!section) return;
    const lectures = [...section.lectures];
    let idx = lectures.findIndex((l) => l.date === lectureDate);
    let currentLec: LectureRecord = idx >= 0 ? { ...lectures[idx], participation: { ...lectures[idx].participation } } : { date: lectureDate, attendance: {}, participation: {} };

    const currentVal = currentLec.participation[studentId] || 0;
    const newVal = Math.max(0, Math.min(MAX_PARTICIPATION, currentVal + delta));
    currentLec.participation[studentId] = newVal;

    if (idx >= 0) lectures[idx] = currentLec;
    else lectures.push(currentLec);

    scheduleSave({ ...section, lectures });
  };

  // 1. تعديل اسم الطالب
  const handleRenameStudent = () => {
    if (!selectedStudent || !section || !editName.trim()) return;
    const updatedStudents = section.students.map((s) =>
      s.id === selectedStudent.id
        ? { ...s, name: editName.trim(), normName: normalizeArabic(editName.trim()) }
        : s
    );
    scheduleSave({ ...section, students: updatedStudents });
    setSelectedStudent(null);
  };

  // 2. تحريك ترتيب الطالب
  const handleMoveStudent = () => {
    if (!selectedStudent || !section) return;
    const currentIndex = section.students.findIndex((s) => s.id === selectedStudent.id);
    if (currentIndex === -1) return;

    const newIndex = Math.max(0, Math.min(section.students.length - 1, movePosition - 1));
    const updated = [...section.students];
    const [movedStudent] = updated.splice(currentIndex, 1);
    updated.splice(newIndex, 0, movedStudent);

    const reordered = updated.map((s, idx) => ({ ...s, order: idx }));
    scheduleSave({ ...section, students: reordered });
    setSelectedStudent(null);
  };

  const stats = useMemo(() => {
    if (!section || !lecture) return { present: 0, absent: 0, leave: 0, total: section?.students.length || 0 };
    let present = 0, absent = 0, leave = 0;
    section.students.forEach((s) => {
      const st = lecture.attendance[s.id] ?? "present";
      if (st === "present") present++;
      else if (st === "absent") absent++;
      else if (st === "leave") leave++;
    });
    return { present, absent, leave, total: section.students.length };
  }, [section, lecture]);

  const filteredStudents = useMemo(() => {
    if (!section) return [];
    let list = section.students;
    if (query.trim()) {
      const q = normalizeArabic(query);
      list = list.filter((s) => s.normName.includes(q));
    }
    if (absentsOnly && lecture) {
      list = list.filter((s) => (lecture.attendance[s.id] ?? "present") === "absent");
    }
    return list;
  }, [section, query, absentsOnly, lecture]);

  if (loading || !section) return <div className="p-5 text-center text-slate-500">جاري التحميل…</div>;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 pb-28">
      {/* رأس الصفحة */}
      <header className="bg-primary-800 text-white p-4 shadow-md">
        <div className="mx-auto max-w-2xl flex justify-between items-center mb-3">
          <button onClick={onBack} className="flex items-center gap-1 font-bold text-sm bg-white/10 px-3 py-1.5 rounded-xl">
            <ArrowRight className="h-4 w-4" /> رجوع
          </button>
          <div className="text-left">
            <h1 className="font-bold text-base">{section.subject}</h1>
            <p className="text-[11px] text-primary-200">المرحلة {section.stage} • {section.studyType === "morning" ? "صباحي" : "مسائي"}</p>
          </div>
        </div>

        {/* إحصائيات الحضور في الأعلى */}
        <div className="mx-auto max-w-2xl grid grid-cols-4 gap-2 pt-2 border-t border-primary-700">
          <div className="bg-slate-900/30 rounded-xl p-2 text-center">
            <span className="block text-xs text-primary-200">الكل</span>
            <span className="font-bold text-sm">{stats.total}</span>
          </div>
          <div className="bg-emerald-600/30 rounded-xl p-2 text-center">
            <span className="block text-xs text-emerald-200">حاضر</span>
            <span className="font-bold text-sm text-emerald-300">{stats.present}</span>
          </div>
          <div className="bg-red-600/30 rounded-xl p-2 text-center">
            <span className="block text-xs text-red-200">غائب</span>
            <span className="font-bold text-sm text-red-300">{stats.absent}</span>
          </div>
          <div className="bg-amber-600/30 rounded-xl p-2 text-center">
            <span className="block text-xs text-amber-200">إجازة</span>
            <span className="font-bold text-sm text-amber-300">{stats.leave}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4 space-y-4">
        {/* شريط تاريخ المحاضرة والبحث */}
        <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary-700" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">تاريخ المحاضرة:</span>
            </div>
            <input
              type="date"
              value={lectureDate}
              onChange={(e) => setLectureDate(e.target.value)}
              className="bg-slate-100 dark:bg-slate-700 text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="بحث عن اسم الطالب..."
                className="w-full pl-3 pr-9 py-2 bg-slate-100 dark:bg-slate-700 text-xs rounded-xl border-none text-slate-800 dark:text-slate-100"
              />
            </div>
            <button
              onClick={() => setAbsentsOnly(!absentsOnly)}
              className={`px-3 py-2 text-xs font-bold rounded-xl border transition ${
                absentsOnly ? "bg-red-500 text-red-100 border-red-500" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600"
              }`}
            >
              الغائبون
            </button>
          </div>
        </div>

        {/* قائمة الطلاب */}
        <div className="space-y-2.5">
          {filteredStudents.length === 0 ? (
            <p className="text-center text-xs text-slate-500 py-6">لا توجد نتائج مطابقة للبحث.</p>
          ) : (
            filteredStudents.map((s, index) => {
              const currentStatus = lecture?.attendance[s.id] ?? "present";
              const points = lecture?.participation[s.id] ?? 0;

              return (
                <StudentRow
                  key={s.id}
                  index={section.students.findIndex(st => st.id === s.id) + 1}
                  student={s}
                  status={currentStatus}
                  points={points}
                  onStatusChange={(st) => setStatus(s.id, st)}
                  onParticipationChange={(delta) => setParticipation(s.id, delta)}
                  onLongPress={() => {
                    setSelectedStudent(s);
                    setEditName(s.name);
                    setMovePosition(section.students.findIndex(st => st.id === s.id) + 1);
                    setModalMode("menu");
                  }}
                />
              );
            })
          )}
        </div>

        {/* سجل المحاضرات السابقة */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm space-y-2">
          <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-primary-700" /> سجل المحاضرات ({section.lectures.length})
          </h3>
          <div className="flex flex-wrap gap-2 pt-1">
            {section.lectures.map((l) => (
              <button
                key={l.date}
                onClick={() => setLectureDate(l.date)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                  l.date === lectureDate
                    ? "bg-primary-700 text-white border-primary-700"
                    : "bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600"
                }`}
              >
                {l.date}
              </button>
            ))}
          </div>
        </div>
      </main>

      {/* نافذة خيارات التعديل والتحريك عند الضغط المطول */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-800 p-5 shadow-xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3 border-slate-100 dark:border-slate-700">
              <div>
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">{selectedStudent.name}</h3>
                <span className="text-[11px] text-slate-400">خيارات الطالب</span>
              </div>
              <button onClick={() => setSelectedStudent(null)} className="p-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500">
                <X className="h-4 w-4" />
              </button>
            </div>

            {modalMode === "menu" && (
              <div className="space-y-2">
                <button
                  onClick={() => setModalMode("edit")}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 font-bold text-xs text-slate-800 dark:text-slate-100 transition"
                >
                  <Edit2 className="h-4 w-4 text-primary-600" /> تعديل اسم الطالب
                </button>
                <button
                  onClick={() => setModalMode("move")}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 font-bold text-xs text-slate-800 dark:text-slate-100 transition"
                >
                  <MoveVertical className="h-4 w-4 text-amber-600" /> تحريك الترتيب (الموقع الحالي: {section.students.findIndex(s => s.id === selectedStudent.id) + 1})
                </button>
              </div>
            )}

            {modalMode === "edit" && (
              <div className="space-y-3">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none"
                  placeholder="ادخل الاسم الجديد..."
                />
                <button
                  onClick={handleRenameStudent}
                  className="w-full py-3 bg-primary-700 text-white font-bold text-xs rounded-2xl shadow-md active:scale-95 transition"
                >
                  حفظ الاسم المعدل
                </button>
              </div>
            )}

            {modalMode === "move" && (
              <div className="space-y-3">
                <label className="block text-[11px] font-bold text-slate-500">ادخل الموقع الجديد للطالب (من 1 إلى {section.students.length}):</label>
                <input
                  type="number"
                  min={1}
                  max={section.students.length}
                  value={movePosition}
                  onChange={(e) => setMovePosition(Number(e.target.value))}
                  className="w-full p-3 rounded-2xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none"
                />
                <button
                  onClick={handleMoveStudent}
                  className="w-full py-3 bg-amber-600 text-white font-bold text-xs rounded-2xl shadow-md active:scale-95 transition"
                >
                  تأكيد النقل والترتيب
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// عنصر الطالب مع أزرار الحضور والمشاركة ودعم الضغط المطول
function StudentRow({
  index,
  student,
  status,
  points,
  onStatusChange,
  onParticipationChange,
  onLongPress,
}: {
  index: number;
  student: Student;
  status: AttendanceStatus;
  points: number;
  onStatusChange: (s: AttendanceStatus) => void;
  onParticipationChange: (delta: number) => void;
  onLongPress: () => void;
}) {
  const timerRef = useRef<number | null>(null);

  const startPress = () => {
    timerRef.current = window.setTimeout(() => {
      onLongPress();
      navigator.vibrate?.(50);
    }, 600);
  };

  const cancelPress = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  return (
    <div
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      className="flex items-center justify-between p-3 rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200/50 dark:border-slate-700/60 select-none"
    >
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <span className="text-[11px] font-bold text-slate-400 w-5 text-center">{index}</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">{student.name}</p>
          {/* عداد المشاركات */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-primary-700 dark:text-primary-300 font-semibold">مشاركة: {points}/{MAX_PARTICIPATION}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); onParticipationChange(-1); }}
                disabled={points <= 0}
                className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-600 dark:text-slate-300 disabled:opacity-40"
              >
                -
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onParticipationChange(1); }}
                disabled={points >= MAX_PARTICIPATION}
                className="w-5 h-5 rounded-md bg-primary-50 dark:bg-primary-900/40 flex items-center justify-center text-[10px] font-bold text-primary-700 dark:text-primary-300 disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* أزرار حالات الحضور */}
      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700/60 p-1 rounded-xl">
        {STATUS_ORDER.map((st) => {
          const active = status === st;
          const meta = STATUS_META[st];
          return (
            <button
              key={st}
              onClick={(e) => { e.stopPropagation(); onStatusChange(st); }}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1 ${
                active ? meta.active : "text-slate-500 dark:text-slate-400 hover:text-slate-800"
              }`}
            >
              {meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}