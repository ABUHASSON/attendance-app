export type AttendanceStatus = "present" | "absent" | "leave";

export interface Student {
  id: string;
  name: string;
  normName: string;
  order: number;
}

export interface LectureRecord {
  date: string; // ISO yyyy-mm-dd
  attendance: Record<string, AttendanceStatus>; // studentId -> status
  participation: Record<string, number>; // studentId -> points (max 2)
}

export interface Section {
  id: string;
  subject: string;
  stage: string;
  semester: "1" | "2";
  studyType: "morning" | "evening";
  createdAt: number;
  students: Student[];
  lectures: LectureRecord[];
  totalLectures?: number;
}
