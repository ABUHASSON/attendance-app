import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  Database,
  Download,
  FileSpreadsheet,
  GraduationCap,
  Layers,
  Moon,
  Plus,
  Share2,
  Sun,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import type { Section, Student } from "@/types";
import { normalizeArabic } from "@/lib/normalize";
import { parseStudentFile, parseRawRows, namesFromColumn, buildJsonBackup, buildExcelBackup } from "@/lib/excel";
import { saveSection, deleteSection, getAllSections } from "@/lib/db";
import { shareFile } from "@/lib/share";
import { useTheme } from "@/lib/theme";

interface Props {
  onOpenSection: (id: string) => void;
}

const STAGES = ["الأولى", "الثانية", "الثالثة", "الرابعة"];

const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export default function SetupScreen({ onOpenSection }: Props) {
  const [theme, toggleTheme] = useTheme();
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  const [subject, setSubject] = useState("");
  const [stage, setStage] = useState<string>("");
  const [semester, setSemester] = useState<"1" | "2">("1");
  const [studyType, setStudyType] = useState<"morning" | "evening">("morning");
  const [totalLectures, setTotalLectures] = useState<string>("");

  const [file, setFile] = useState<File | null>(null);
  const [parsedNames, setParsedNames] = useState<string[]>([]);
  const [importError, setImportError] = useState<string>("");
  const [importing, setImporting] = useState(false);

  // Column-mapper modal state
  const [showMapper, setShowMapper] = useState(false);
  const [mapperHeaders, setMapperHeaders] = useState<string[]>([]);
  const [mapperRows, setMapperRows] = useState<unknown[][]>([]);
  const [mapperSelected, setMapperSelected] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Backup file input ref for import
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  const loadSections = useCallback(async () => {
    setLoading(true);
    try {
      setSections(await getAllSections());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSections();
  }, [loadSections]);

  const resetForm = () => {
    setSubject("");
    setStage("");
    setSemester("1");
    setStudyType("morning");
    setTotalLectures("");
    setFile(null);
    setParsedNames([]);
    setImportError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFile = async (f: File) => {
    setImporting(true);
    setImportError("");
    setParsedNames([]);
    setFile(f);
    try {
      const result = await parseStudentFile(f);
      if (result.detectedIndex >= 0 && result.names.length > 0) {
        setParsedNames(result.names);
      } else if (result.headers.length > 0) {
        const allRows = await parseRawRows(f);
        setMapperHeaders(
          (allRows[0] || []).map((c) => String(c ?? "").trim())
        );
        setMapperRows(allRows);
        setMapperSelected(0);
        setShowMapper(true);
      } else if (result.rowCount === 0) {
        setImportError("الملف فارغ.");
      } else {
        setImportError("تعذّر اكتشاف عمود الأسماء. استخدم المحدّد اليدوي.");
      }
    } catch {
      setImportError("حدث خطأ أثناء قراءة الملف. تأكد من صحة التنسيق.");
    } finally {
      setImporting(false);
    }
  };

  const confirmMapper = () => {
    const names = namesFromColumn(mapperRows, 0, mapperSelected);
    setParsedNames(names);
    setShowMapper(false);
    if (names.length === 0) setImportError("لا توجد أسماء في العمود المحدد.");
  };

  const handleSave = async () => {
    if (!subject.trim() || !stage) {
      setImportError("يرجى إدخال اسم المادة واختيار المرحلة.");
      return;
    }
    if (parsedNames.length === 0) {
      setImportError("يرجى استيراد ملف الطلاب أولاً.");
      return;
    }
    const students: Student[] = parsedNames
      .map((n, i) => ({
        id: uid(),
        name: n,
        normName: normalizeArabic(n),
        order: i,
      }))
      .filter(
        (s, _i, arr) => arr.findIndex((x) => x.normName === s.normName) === _i
      );

    const tl = totalLectures.trim()
      ? Math.max(1, Math.floor(Number(totalLectures)))
      : undefined;

    const section: Section = {
      id: uid(),
      subject: subject.trim(),
      stage,
      semester,
      studyType,
      createdAt: Date.now(),
      students,
      lectures: [],
      ...(tl ? { totalLectures: tl } : {}),
    };
    await saveSection(section);
    resetForm();
    await loadSections();
    onOpenSection(section.id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل تريد حذف هذا الشعبة وكل بياناته؟")) return;
    await deleteSection(id);
    await loadSections();
  };

  const handleBackup = async (format: "json" | "excel") => {
    if (sections.length === 0) {
      setImportError("لا توجد بيانات لتصديرها.");
      return;
    }
    const file =
      format === "json"
        ? buildJsonBackup(sections)
        : buildExcelBackup(sections);
    const text = `نسخة احتياطية لنظام الحضور — ${sections.length} شعبة`;
    await shareFile(file, text, "نسخة احتياطية");
  };

  const handleImportBackup = async (f: File) => {
    setLoading(true);
    try {
      const text = await f.text();
      const data = JSON.parse(text);

      if (Array.isArray(data)) {
        for (const sec of data) {
          if (sec.id && sec.subject && sec.students) {
            await saveSection(sec);
          }
        }
        await loadSections();
        alert("تم استيراد قاعدة البيانات بنجاح!");
      } else {
        alert("تنسيق ملف النسخة الاحتياطية غير صحيح.");
      }
    } catch {
      alert("حدث خطأ أثناء استيراد قاعدة البيانات. تأكد من صحة ملف JSON.");
    } finally {
      setLoading(false);
      if (backupFileInputRef.current) backupFileInputRef.current.value = "";
    }
  };

  const semesterLabel = (s: string) => (s === "1" ? "الأول" : "الثاني");
  const studyLabel = (s: string) => (s === "morning" ? "صباحي" : "مسائي");

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 pb-28">
      {/* Header */}
      <header className="safe-top bg-gradient-to-b from-primary-800 to-primary-700 text-white shadow-lg">
        <div className="mx-auto max-w-2xl px-4 py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h1 className="text-lg font-bold leading-tight">
                نظام الحضور والمشاركة
              </h1>
              <p className="text-xs text-primary-100">
                إدارة حضور الطلاب الجامعيين — يعمل بدون إنترنت
              </p>
            </div>
            <button
              onClick={toggleTheme}
              className="grid h-10 w-10 place-items-center rounded-2xl bg-white/15 active:scale-95 transition"
              aria-label="تبديل الوضع الليلي"
            >
              {theme === "dark" ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5 space-y-6">
        {/* Setup form card */}
        <section className="rounded-3xl bg-white dark:bg-slate-800 p-5 shadow-sm animate-slide-up">
          <div className="mb-4 flex items-center gap-2 text-primary-800 dark:text-primary-300">
            <Plus className="h-5 w-5" />
            <h2 className="text-base font-bold">إنشاء شعبة جديدة</h2>
          </div>

          <div className="space-y-4">
            <Field label="اسم المادة" icon={<BookOpen className="h-4 w-4" />}>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="مثال: تشكيل المعادن"
                className="input dark:input-dark"
              />
            </Field>

            <Field label="المرحلة / الدرجة" icon={<Layers className="h-4 w-4" />}>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className="input dark:input-dark"
              >
                <option value="" disabled>
                  اختر المرحلة…
                </option>
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    المرحلة {s}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="الفصل الدراسي" icon={<CalendarDays className="h-4 w-4" />}>
                <Segmented
                  options={[
                    { value: "1", label: "الأول" },
                    { value: "2", label: "الثاني" },
                  ]}
                  value={semester}
                  onChange={(v) => setSemester(v as "1" | "2")}
                />
              </Field>
              <Field label="نوع الدراسة" icon={<Sun className="h-4 w-4" />}>
                <Segmented
                  options={[
                    { value: "morning", label: "صباحي", icon: <Sun className="h-3.5 w-3.5" /> },
                    { value: "evening", label: "مسائي", icon: <Moon className="h-3.5 w-3.5" /> },
                  ]}
                  value={studyType}
                  onChange={(v) => setStudyType(v as "morning" | "evening")}
                />
              </Field>
            </div>

            <Field
              label="عدد المحاضرات الإجمالي (اختياري)"
              icon={<CalendarDays className="h-4 w-4" />}
            >
              <input
                type="number"
                min={1}
                value={totalLectures}
                onChange={(e) => setTotalLectures(e.target.value)}
                placeholder="مثال: 30"
                className="input dark:input-dark"
              />
              {totalLectures.trim() && Number(totalLectures) > 0 && (
                <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                  سيتم تفعيل نظام الإنذار عند غياب 10% أو أكثر.
                </p>
              )}
            </Field>

            {/* Import */}
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <FileSpreadsheet className="h-4 w-4 text-primary-700 dark:text-primary-400" />
                استيراد قائمة الطلاب
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary-300 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/30 py-4 text-sm font-semibold text-primary-800 dark:text-primary-300 active:scale-[0.99] transition"
              >
                {importing ? (
                  "جاري القراءة..."
                ) : (
                  <>
                    <Upload className="h-5 w-5" />
                    {file ? file.name : "اختر ملف Excel أو CSV"}
                  </>
                )}
              </button>

              {parsedNames.length > 0 && (
                <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-50 dark:bg-emerald-900/30 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300 animate-fade-in">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-4 w-4" />
                    تم العثور على {parsedNames.length} طالب
                  </span>
                  <button
                    onClick={() => {
                      setParsedNames([]);
                      setFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-emerald-700 dark:text-emerald-400 active:opacity-60"
                  >
                    إلغاء
                  </button>
                </div>
              )}

              {importError && (
                <p className="mt-2 rounded-xl bg-red-50 dark:bg-red-900/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                  {importError}
                </p>
              )}
            </div>

            <button
              onClick={handleSave}
              disabled={importing}
              className="w-full rounded-2xl bg-primary-700 py-3.5 text-sm font-bold text-white shadow-md active:scale-[0.99] transition disabled:opacity-50"
            >
              حفظ وفتح الشعبة
            </button>
          </div>
        </section>

        {/* Saved sections */}
        <section>
          <div className="mb-3 flex items-center gap-2 text-slate-700 dark:text-slate-200">
            <Layers className="h-5 w-5" />
            <h2 className="text-base font-bold">الشعب المحفوظة</h2>
            {!loading && (
              <span className="rounded-full bg-slate-200 dark:bg-slate-700 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                {sections.length}
              </span>
            )}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-24 rounded-2xl bg-white dark:bg-slate-800 animate-pulse"
                />
              ))}
            </div>
          ) : sections.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-10 text-center">
              <Users className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-400 dark:text-slate-500">
                لا توجد شعب محفوظة بعد. أنشئ شعبة جديدة بالأعلى.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sections.map((s) => {
                const lastLecture = s.lectures.length
                  ? [...s.lectures].sort((a, b) => b.date.localeCompare(a.date))[0]
                  : null;
                return (
                  <article
                    key={s.id}
                    className="group rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-sm active:scale-[0.99] transition animate-fade-in"
                  >
                    <button
                      onClick={() => onOpenSection(s.id)}
                      className="flex w-full items-center gap-3 text-right"
                    >
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-300">
                        <BookOpen className="h-6 w-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-bold text-slate-800 dark:text-slate-100">
                          {s.subject}
                        </h3>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {s.stage} · {studyLabel(s.studyType)} · فصل {semesterLabel(s.semester)}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <Chip icon={<Users className="h-3 w-3" />}>
                            {s.students.length} طالب
                          </Chip>
                          <Chip icon={<CalendarDays className="h-3 w-3" />}>
                            {s.lectures.length} محاضرة
                          </Chip>
                          {s.totalLectures && (
                            <Chip icon={<Layers className="h-3 w-3" />}>
                              المجموع: {s.totalLectures}
                            </Chip>
                          )}
                          {lastLecture && (
                            <Chip icon={<Download className="h-3 w-3" />}>
                              آخر: {lastLecture.date}
                            </Chip>
                          )}
                        </div>
                      </div>
                    </button>
                    <div className="mt-3 flex justify-end border-t border-slate-100 dark:border-slate-700 pt-2">
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 active:bg-red-50 dark:active:bg-red-900/30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        حذف
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Backup & Database Management (Import / Export) */}
          <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
            <div className="mb-2 flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <Database className="h-4 w-4" />
              <h3 className="text-sm font-bold">إدارة قاعدة البيانات</h3>
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              استيراد أو تصدير نسخة احتياطية كاملة من كل الشعب والمحاضرات لنقلها بين الأجهزة.
            </p>

            <input
              ref={backupFileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportBackup(f);
              }}
            />

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => backupFileInputRef.current?.click()}
                disabled={loading}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-primary-300 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/40 py-2.5 text-xs font-bold text-primary-800 dark:text-primary-300 active:scale-[0.98] transition disabled:opacity-40"
              >
                <Upload className="h-3.5 w-3.5" />
                استيراد JSON
              </button>
              <button
                onClick={() => handleBackup("json")}
                disabled={loading || sections.length === 0}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 active:scale-[0.98] transition disabled:opacity-40"
              >
                <Share2 className="h-3.5 w-3.5" />
                تصدير JSON
              </button>
              <button
                onClick={() => handleBackup("excel")}
                disabled={loading || sections.length === 0}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 active:scale-[0.98] transition disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                تصدير Excel
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Column mapper modal */}
      {showMapper && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 animate-fade-in">
          <div className="w-full max-w-2xl rounded-t-3xl bg-white dark:bg-slate-800 p-5 safe-bottom animate-slide-up">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">تحديد عمود الأسماء</h3>
              <button
                onClick={() => setShowMapper(false)}
                className="rounded-full p-1 text-slate-400 active:bg-slate-100 dark:active:bg-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              لم يتم اكتشاف عمود الأسماء تلقائياً. اختر العمود الصحيح من القائمة.
            </p>
            <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 scrollbar-hide">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="p-2 text-right">عمود الأسماء</th>
                    <th className="p-2 text-right">معاينة أول قيمة</th>
                  </tr>
                </thead>
                <tbody>
                  {mapperHeaders.map((h, i) => {
                    const preview = String(
                      (mapperRows[1] && mapperRows[1][i]) ?? ""
                    ).trim();
                    return (
                      <tr
                        key={i}
                        onClick={() => setMapperSelected(i)}
                        className={`border-t border-slate-100 dark:border-slate-700 cursor-pointer ${
                          mapperSelected === i ? "bg-primary-50 dark:bg-primary-900/30" : ""
                        }`}
                      >
                        <td className="p-2 font-semibold text-slate-700 dark:text-slate-200">
                          {h || `العمود ${i + 1}`}
                        </td>
                        <td className="p-2 text-slate-500 dark:text-slate-400">{preview || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button
              onClick={confirmMapper}
              className="mt-4 w-full rounded-2xl bg-primary-700 py-3 text-sm font-bold text-white active:scale-[0.99]"
            >
              تأكيد واستيراد
            </button>
          </div>
        </div>
      )}

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          padding: 0.6rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
          transition: border-color .15s, background .15s;
        }
        .input:focus {
          border-color: #0f766e;
          background: #fff;
        }
        .input-dark {
          border-color: #334155;
          background: #1e293b;
          color: #e2e8f0;
        }
        .input-dark:focus {
          border-color: #14b8a6;
          background: #334155;
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <span className="text-primary-700 dark:text-primary-400">{icon}</span>
        {label}
      </label>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-flow-col auto-cols-fr gap-1 rounded-xl bg-slate-100 dark:bg-slate-700 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold transition ${
            value === o.value
              ? "bg-white dark:bg-slate-600 text-primary-800 dark:text-primary-300 shadow-sm"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Chip({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
      {icon}
      {children}
    </span>
  );
}