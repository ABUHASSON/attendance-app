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
  present: { label: "حاضر", icon: <CheckCircle2 className="h-4 w-4" />, active: "bg-emerald-500 text-white" },
  absent: { label: "غائب", icon: <XCircle className="h-4 w-4" />, active: "bg-red-500 text-white" },
  leave: { label: "إجازة", icon: <Clock className="h-4 w-4" />, active: "bg-amber-500 text-white" },
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

  useEffect(() => {
    (async () => {
      setLoading(true);
      const s = await getSection(sectionId);
      setSection(s ?? null);
      setLoading(false);
    })();
  }, [sectionId]);

  const lecture: LectureRecord | null = useMemo(() => {
    if (!section) return null;
    return section.lectures.find((l) => l.date === lectureDate) || { date: lectureDate, attendance: {}, participation: {} };
  }, [section, lectureDate]);

  const scheduleSave = async (updated: Section) => {
    setSection(updated);
    await saveSection(updated);
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

  if (loading || !section) return <div className="p-5 text-center">جاري التحميل…</div>;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 pb-10">
      <header className="bg-primary-800 text-white p-4 flex justify-between items-center">
        <button onClick={onBack} className="flex items-center gap-1 font-bold">
          <ArrowRight className="h-5 w-5" /> رجوع
        </button>
        <h1 className="font-bold">{section.subject}</h1>
      </header>

      <main className="p-4 space-y-3 max-w-2xl mx-auto">
        {section.students.map((s, index) => (
          <StudentItem
            key={s.id}
            index={index + 1}
            student={s}
            status={lecture?.attendance[s.id] ?? "present"}
            points={lecture?.participation[s.id] ?? 0}
            onLongPress={() => {
              setSelectedStudent(s);
              setEditName(s.name);
              setMovePosition(index + 1);
              setModalMode("menu");
            }}
          />
        ))}
      </main>

      {/* النافذة المنبثقة للتعديل والتحريك عند الضغط المطول */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">{selectedStudent.name}</h3>
              <button onClick={() => setSelectedStudent(null)}><X className="h-5 w-5" /></button>
            </div>

            {modalMode === "menu" && (
              <div className="space-y-3">
                <button
                  onClick={() => setModalMode("edit")}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-100 dark:bg-slate-700 font-bold text-slate-800 dark:text-slate-100"
                >
                  <Edit2 className="h-5 w-5 text-primary-600" /> تعديل اسم الطالب
                </button>
                <button
                  onClick={() => setModalMode("move")}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-100 dark:bg-slate-700 font-bold text-slate-800 dark:text-slate-100"
                >
                  <MoveVertical className="h-5 w-5 text-amber-600" /> تحريك الترتيب (الموقع الحالي: {section.students.findIndex(s => s.id === selectedStudent.id) + 1})
                </button>
              </div>
            )}

            {modalMode === "edit" && (
              <div className="space-y-3">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent text-slate-800 dark:text-slate-100"
                />
                <button
                  onClick={handleRenameStudent}
                  className="w-full py-3 bg-primary-700 text-white font-bold rounded-xl"
                >
                  حفظ الاسم المعدل
                </button>
              </div>
            )}

            {modalMode === "move" && (
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-500">ادخل الموقع الجديد للطالب (من 1 إلى {section.students.length}):</label>
                <input
                  type="number"
                  min={1}
                  max={section.students.length}
                  value={movePosition}
                  onChange={(e) => setMovePosition(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent text-slate-800 dark:text-slate-100"
                />
                <button
                  onClick={handleMoveStudent}
                  className="w-full py-3 bg-amber-600 text-white font-bold rounded-xl"
                >
                  تأكيد النقل
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// عنصر الطالب مع دعم الضغط المطول (Long Press)
function StudentItem({
  index,
  student,
  status,
  points,
  onLongPress,
}: {
  index: number;
  student: Student;
  status: AttendanceStatus;
  points: number;
  onLongPress: () => void;
}) {
  const timerRef = useRef<number | null>(null);

  const startPress = () => {
    timerRef.current = window.setTimeout(() => {
      onLongPress();
      navigator.vibrate?.(40);
    }, 600); // الضغط المطول بعد 600 ملي ثانية
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
      className="flex items-center justify-between p-3 rounded-2xl bg-white dark:bg-slate-800 shadow-sm cursor-pointer select-none"
    >
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold text-slate-400">{index}</span>
        <p className="font-bold text-slate-800 dark:text-slate-100">{student.name}</p>
      </div>
      <span className="text-xs font-bold text-primary-600">اضغط مطولاً للتعديل</span>
    </div>
  );
}