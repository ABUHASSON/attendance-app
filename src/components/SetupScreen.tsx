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
  Upload,
  Users,
} from "lucide-react";
import type { Section, Student } from "@/types";
import { normalizeArabic } from "@/lib/normalize";
import { parseStudentFile, parseRawRows, namesFromColumn, buildJsonBackup, buildExcelBackup } from "@/lib/excel";
import { saveSection, deleteSection, getAllSections } from "@/lib/db";
import { shareFile } from "@/lib/share";
import { useTheme } from "@/lib/theme";
import * as XLSX from "xlsx";

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

  const [showMapper, setShowMapper] = useState(false);
  const [mapperHeaders, setMapperHeaders] = useState<string[]>([]);
  const [mapperRows, setMapperRows] = useState<unknown[][]>([]);
  const [mapperSelected, setMapperSelected] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const backupFileInputRef = useRef<HTMLInputElement>(null);

  const loadSections = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllSections();
      setSections(data || []);
    } catch (err) {
      console.error("Error loading sections:", err);
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

  // استيراد قاعدة البيانات المحدث بدقة فائقة
  const handleImportBackup = async (f: File) => {
    setLoading(true);
    try {
      if (f.name.endsWith(".json")) {
        const text = await f.text();
        const data = JSON.parse(text);
        const sectionsArray = Array.isArray(data) ? data : data.sections;

        if (Array.isArray(sectionsArray)) {
          for (const sec of sectionsArray) {
            if (sec.id && sec.subject && Array.isArray(sec.students)) {
              await saveSection(sec);
            }
          }
          // تحديث الحالة فوراً بعد الحفظ
          const updatedSections = await getAllSections();
          setSections(updatedSections || []);
          alert(`تم استيراد ${sectionsArray.length} شعبة بنجاح وظهرت في القائمة!`);
        } else {
          alert("تنسيق ملف JSON غير صحيح.");
        }
      } else if (f.name.endsWith(".xlsx") || f.name.endsWith(".xls")) {
        const arrayBuffer = await f.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        
        let importedCount = 0;
        for (const sheetName of workbook.SheetNames) {
          if (sheetName === "الملخص") continue;
          
          const worksheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
          
          if (rows.length > 0) {
            const studentNames = rows
              .map((r) => String(r["اسم الطالب"] || r["الاسم"] || r["Name"] || Object.values(r)[1] || Object.values(r)[0] || "").trim())
              .filter((n) => n && n !== "ت" && isNaN(Number(n)) && n.length > 2);

            if (studentNames.length > 0) {
              const students: Student[] = studentNames.map((n, i) => ({
                id: uid(),
                name: n,
                normName: normalizeArabic(n),
                order: i,
              }));

              const section: Section = {
                id: uid(),
                subject: sheetName,
                stage: "الأولى",
                semester: "1",
                studyType: "morning",
                createdAt: Date.now(),
                students,
                lectures: [],
              };
              await saveSection(section);
              importedCount++;
            }
          }
        }
        const updatedSections = await getAllSections();
        setSections(updatedSections || []);
        alert(`تم استيراد ${importedCount} شعبة من ملف Excel بنجاح!`);
      }
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء استيراد البيانات.");
    } finally {
      setLoading(false);
      if (backupFileInputRef.current) backupFileInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 pb-28">
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
            </Field>

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
                {importing ? "جاري القراءة..." : <><Upload className="h-5 w-5" /> {file ? file.name : "اختر ملف Excel أو CSV"}</>}
              </button>

              {parsedNames.length > 0 && (
                <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-50 dark:bg-emerald-900/30 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-4 w-4" /> تم العثور على {parsedNames.length} طالب
                  </span>
                  <button onClick={() => { setParsedNames([]); setFile(null); }}>إلغاء</button>
                </div>
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

        {/* عرض الشعب المحفوظة */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary-700" /> الشعب المحفوظة ({sections.length})
            </h3>
          </div>

          {loading ? (
            <p className="text-center text-xs text-slate-500 py-4">جاري تحميل الشعب…</p>
          ) : sections.length === 0 ? (
            <p className="text-center text-xs text-slate-500 py-4">لا توجد شعب محفوظة حالياً. قم باستيراد قاعدة بيانات أو إنشاء شعبة جديدة.</p>
          ) : (
            sections.map((sec) => (
              <div
                key={sec.id}
                onClick={() => onOpenSection(sec.id)}
                className="flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200/60 dark:border-slate-700 cursor-pointer active:scale-[0.99] transition"
              >
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-100 text-base">{sec.subject}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    المرحلة {sec.stage} • {sec.studyType === "morning" ? "صباحي" : "مسائي"} • {sec.students.length} طالب
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`هل تريد حذف الشعبة "${sec.subject}" نهائياً؟`)) {
                      deleteSection(sec.id).then(loadSections);
                    }
                  }}
                  className="text-red-500 hover:text-red-700 p-2 text-xs font-bold"
                >
                  حذف
                </button>
              </div>
            ))
          )}
        </section>

        {/* إدارة واستيراد قاعدة البيانات */}
        <section>
          <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
            <div className="mb-2 flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <Database className="h-4 w-4" />
              <h3 className="text-sm font-bold">إدارة واستيراد قاعدة البيانات</h3>
            </div>
            <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
              يمكنك استيراد قاعدة البيانات الكاملة مباشرة من ملف JSON أو ملف Excel الاحتياطي.
            </p>

            <input
              ref={backupFileInputRef}
              type="file"
              accept=".json,.xlsx,.xls"
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
                className="flex items-center justify-center gap-1.5 rounded-xl border border-primary-300 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/40 py-2.5 text-xs font-bold text-primary-800 dark:text-primary-300 active:scale-[0.98]"
              >
                <Upload className="h-3.5 w-3.5" />
                استيراد (JSON/Excel)
              </button>
              <button
                onClick={() => handleBackup("json")}
                disabled={loading || sections.length === 0}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 active:scale-[0.98]"
              >
                <Share2 className="h-3.5 w-3.5" />
                تصدير JSON
              </button>
              <button
                onClick={() => handleBackup("excel")}
                disabled={loading || sections.length === 0}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 active:scale-[0.98]"
              >
                <Download className="h-3.5 w-3.5" />
                تصدير Excel
              </button>
            </div>
          </div>
        </section>
      </main>

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          padding: 0.6rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
        }
        .input-dark {
          border-color: #334155;
          background: #1e293b;
          color: #e2e8f0;
        }
      `}</style>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
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

function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string; icon?: React.ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-flow-col auto-cols-fr gap-1 rounded-xl bg-slate-100 dark:bg-slate-700 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold transition ${
            value === o.value ? "bg-white dark:bg-slate-600 text-primary-800 dark:text-primary-300 shadow-sm" : "text-slate-500 dark:text-slate-400"
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}