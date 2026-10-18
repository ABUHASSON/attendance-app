import type { Section, AttendanceStatus } from "@/types";

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "حاضر",
  absent: "غائب",
  leave: "إجازة",
};

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

/**
 * Build a neat Arabic text summary for the given lecture, suitable for
 * sharing to WhatsApp / Telegram. Lists only absent and leave students.
 */
export function buildLectureReportText(
  section: Section,
  date: string
): string {
  const lecture = section.lectures.find((l) => l.date === date);
  const attendance = lecture?.attendance ?? {};

  let present = 0;
  let absent = 0;
  let leave = 0;
  const absentNames: string[] = [];
  const leaveNames: string[] = [];

  for (const s of section.students) {
    const st = attendance[s.id] ?? "present";
    if (st === "present") present++;
    else if (st === "absent") {
      absent++;
      absentNames.push(s.name);
    } else if (st === "leave") {
      leave++;
      leaveNames.push(s.name);
    }
  }

  const studyLabel = section.studyType === "morning" ? "صباحي" : "مسائي";
  const lines: string[] = [];
  lines.push("📋 *تقرير الحضور*");
  lines.push("");
  lines.push(`📚 المادة: ${section.subject}`);
  lines.push(`🎓 المرحلة: ${section.stage} (${studyLabel})`);
  lines.push(`📅 التاريخ: ${formatDateAR(date)}`);
  lines.push("");
  lines.push("📊 *الملخص:*");
  lines.push(`الإجمالي: ${section.students.length}`);
  lines.push(`✅ الحضور: ${present}`);
  lines.push(`❌ الغياب: ${absent}`);
  lines.push(`🟡 الإجازة: ${leave}`);

  lines.push("");
  if (absentNames.length > 0) {
    lines.push(`*الطلاب الغائبون (${absent}):*`);
    absentNames.forEach((n, i) => lines.push(`${i + 1}. ${n}`));
  } else {
    lines.push("الطلاب الغائبون: لا يوجد 🎉");
  }

  lines.push("");
  if (leaveNames.length > 0) {
    lines.push(`*الطلاب المجازون (${leave}):*`);
    leaveNames.forEach((n, i) => lines.push(`${i + 1}. ${n}`));
  } else {
    lines.push("الطلاب المجازون: لا يوجد");
  }

  return lines.join("\n");
}

/**
 * Share text via the Web Share API. Falls back to copying to the clipboard
 * and returns a description of what happened so the caller can show feedback.
 */
export async function shareText(
  text: string,
  title = "تقرير الحضور"
): Promise<"shared" | "copied" | "failed"> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch {
      // user cancelled — treat as a no-op, not a failure
      return "shared";
    }
  }
  return copyText(text);
}

export async function copyText(text: string): Promise<"copied" | "failed"> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return "copied";
    }
    // Legacy fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return "copied";
  } catch {
    return "failed";
  }
}

/**
 * Share a file via the Web Share API. Falls back to a download trigger.
 */
export async function shareFile(
  file: File,
  text: string,
  title = "نسخة احتياطية"
): Promise<"shared" | "downloaded" | "failed"> {
  if (navigator.share && "canShare" in navigator) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const shareData: any = {
        title,
        text,
        files: [file],
      };
      if (navigator.canShare(shareData)) {
        await navigator.share(shareData);
        return "shared";
      }
    } catch {
      // fall through to download
    }
  }
  // Fallback: trigger a browser download
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
