import * as XLSX from "xlsx";
import type { Section, AttendanceStatus } from "@/types";
import { matchNameColumn } from "./normalize";

export interface ImportResult {
  names: string[];
  detectedIndex: number;
  headers: string[];
  rowCount: number;
}

export async function parseStudentFile(file: File): Promise<ImportResult> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  }) as unknown[][];

  if (rows.length === 0) {
    return { names: [], detectedIndex: -1, headers: [], rowCount: 0 };
  }

  // Scan up to first 10 rows for header containing a name keyword.
  let headerRowIdx = 0;
  let detectedIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = (rows[i] || []).map((c) => String(c ?? "").trim());
    const idx = matchNameColumn(row);
    if (idx >= 0) {
      headerRowIdx = i;
      detectedIndex = idx;
      break;
    }
  }

  const headers = (rows[headerRowIdx] || []).map((c) => String(c ?? "").trim());
  const dataStart = headerRowIdx + 1;
  const allRows = rows.slice(dataStart).filter((r) =>
    (r || []).some((c) => String(c ?? "").trim() !== "")
  );

  let names: string[];
  if (detectedIndex >= 0) {
    names = allRows
      .map((r) => String(r[detectedIndex] ?? "").trim())
      .filter((n) => n !== "");
  } else {
    names = allRows
      .map((r) => String(r[0] ?? "").trim())
      .filter((n) => n !== "");
  }

  return {
    names,
    detectedIndex,
    headers,
    rowCount: allRows.length,
  };
}

export function namesFromColumn(
  rows: unknown[][],
  headerRowIndex: number,
  columnIndex: number
): string[] {
  const data = rows.slice(headerRowIndex + 1).filter((r) =>
    (r || []).some((c) => String(c ?? "").trim() !== "")
  );
  return data
    .map((r) => String(r[columnIndex] ?? "").trim())
    .filter((n) => n !== "");
}

export function exportSectionReport(section: Section): void {
  const statusLabel: Record<AttendanceStatus, string> = {
    present: "حاضر",
    absent: "غائب",
    leave: "إجازة",
  };

  const sortedLectures = [...section.lectures].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const header = [
    "ت",
    "اسم الطالب",
    ...sortedLectures.map((l) => l.date),
    "مجموع الغياب",
    "مجموع الإجازات",
    "مجموع المشاركات",
  ];

  const body = section.students.map((s, i) => {
    let absences = 0;
    let leaves = 0;
    let participation = 0;
    const cells: (string | number)[] = [i + 1, s.name];
    for (const lec of sortedLectures) {
      const st = lec.attendance[s.id];
      const pts = lec.participation[s.id] || 0;
      cells.push(st ? statusLabel[st] : "-");
      if (st === "absent") absences++;
      else if (st === "leave") leaves++;
      participation += pts;
    }
    cells.push(absences, leaves, participation);
    return cells;
  });

  const aoa = [header, ...body];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths
  ws["!cols"] = [
    { wch: 5 },
    { wch: 28 },
    ...sortedLectures.map(() => ({ wch: 12 })),
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "التقرير");

  const safeName = section.subject.replace(/[\\/:*?"<>|]/g, "_");
  const fileName = `تقرير_${safeName}_${section.stage}_${section.studyType}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

export async function parseRawRows(file: File): Promise<unknown[][]> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  }) as unknown[][];
}

/**
 * Build a consolidated Excel workbook containing a report sheet for every
 * section, used for full-database backups.
 */
export function buildBackupWorkbook(sections: Section[]): Blob {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryHeader = [
    "ت",
    "المادة",
    "المرحلة",
    "نوع الدراسة",
    "عدد الطلاب",
    "عدد المحاضرات",
  ];
  const summaryBody = sections.map((s, i) => [
    i + 1,
    s.subject,
    s.stage,
    s.studyType === "morning" ? "صباحي" : "مسائي",
    s.students.length,
    s.lectures.length,
  ]);
  const summaryWs = XLSX.utils.aoa_to_sheet([summaryHeader, ...summaryBody]);
  summaryWs["!cols"] = [
    { wch: 5 },
    { wch: 24 },
    { wch: 18 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, summaryWs, "الملخص");

  // One detailed sheet per section
  const statusLabel: Record<AttendanceStatus, string> = {
    present: "حاضر",
    absent: "غائب",
    leave: "إجازة",
  };
  for (const section of sections) {
    const sortedLectures = [...section.lectures].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    const header = [
      "ت",
      "اسم الطالب",
      ...sortedLectures.map((l) => l.date),
      "مجموع الغياب",
      "مجموع الإجازات",
      "مجموع المشاركات",
    ];
    const body = section.students.map((s, i) => {
      let absences = 0;
      let leaves = 0;
      let participation = 0;
      const cells: (string | number)[] = [i + 1, s.name];
      for (const lec of sortedLectures) {
        const st = lec.attendance[s.id];
        const pts = lec.participation[s.id] || 0;
        cells.push(st ? statusLabel[st] : "-");
        if (st === "absent") absences++;
        else if (st === "leave") leaves++;
        participation += pts;
      }
      cells.push(absences, leaves, participation);
      return cells;
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    ws["!cols"] = [
      { wch: 5 },
      { wch: 28 },
      ...sortedLectures.map(() => ({ wch: 12 })),
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
    ];
    const sheetName = (section.subject || "شعبة")
      .replace(/[\\/:*?"<>|[\]]/g, "_")
      .slice(0, 28);
    XLSX.utils.book_append_sheet(wb, ws, sheetName || "شعبة");
  }

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * Build a JSON backup File of the entire database, ready for sharing.
 */
export function buildJsonBackup(sections: Section[]): File {
  const payload = {
    app: "student-attendance",
    version: 1,
    exportedAt: new Date().toISOString(),
    sections,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const stamp = new Date().toISOString().slice(0, 10);
  return new File([blob], `نسخة_احتياطية_${stamp}.json`, {
    type: "application/json",
  });
}

/**
 * Build a consolidated Excel backup File of the entire database.
 */
export function buildExcelBackup(sections: Section[]): File {
  const blob = buildBackupWorkbook(sections);
  const stamp = new Date().toISOString().slice(0, 10);
  return new File([blob], `نسخة_احتياطية_${stamp}.xlsx`, { type: blob.type });
}

