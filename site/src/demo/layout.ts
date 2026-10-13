// Geometry of the fake Mac screen, in "screen pixels" (the plane the camera films).

export const SCREEN = { w: 1440, h: 900 };
export const MENU_H = 28;
export const WIN = { x: 150, y: 74, w: 1140, h: 730 };
export const SIDEBAR_W = 220;
export const TOOLBAR_H = 56;
export const HEADER_H = 34;
export const ROW_H = 40;
export const LIST_TOP = WIN.y + TOOLBAR_H + HEADER_H;

/** Column x positions, window-relative. */
export const COL = {
  name: SIDEBAR_W + 24,
  date: 560,
  sizeRight: 860,
  kind: 890,
};

/** Search field, window-relative. */
export const SEARCH = { x: WIN.w - 20 - 220, y: 13, w: 220, h: 30 };

/** Real macOS file icons, exported to public/macos/file-<kind>.png. */
export type FileKind = "folder" | "mp4" | "png" | "txt" | "xlsx" | "pdf" | "mov" | "key" | "md" | "zip" | "m4a" | "heic";

export const FILES: { name: string; date: string; size: string; kind: string; icon: FileKind }[] = [
  { name: "Launch video.mp4", date: "Today at 09:41", size: "95,3 MB", kind: "MPEG-4 movie", icon: "mp4" },
  { name: "Assets", date: "Yesterday at 18:02", size: "--", kind: "Folder", icon: "folder" },
  { name: "Hero shot.png", date: "Yesterday at 17:45", size: "3,4 MB", kind: "PNG image", icon: "png" },
  { name: "Notes.txt", date: "12 Oct 2026 at 16:20", size: "4 KB", kind: "Plain Text", icon: "txt" },
  { name: "Budget 2026.xlsx", date: "11 Oct 2026 at 11:05", size: "88 KB", kind: "Spreadsheet", icon: "xlsx" },
  { name: "Logo.pdf", date: "9 Oct 2026 at 14:37", size: "12 KB", kind: "PDF document", icon: "pdf" },
  { name: "Interview.mov", date: "8 Oct 2026 at 10:12", size: "1,2 GB", kind: "QuickTime movie", icon: "mov" },
  { name: "Screenshots", date: "7 Oct 2026 at 19:58", size: "--", kind: "Folder", icon: "folder" },
  { name: "Pitch deck.key", date: "3 Oct 2026 at 08:30", size: "24 MB", kind: "Keynote Presentation", icon: "key" },
  { name: "Readme.md", date: "1 Oct 2026 at 21:14", size: "2 KB", kind: "Markdown", icon: "md" },
  { name: "Design", date: "28 Sep 2026 at 13:03", size: "--", kind: "Folder", icon: "folder" },
  { name: "Export.zip", date: "21 Sep 2026 at 17:49", size: "310 MB", kind: "ZIP archive", icon: "zip" },
  { name: "B-roll", date: "19 Sep 2026 at 12:26", size: "--", kind: "Folder", icon: "folder" },
  { name: "Voiceover take 3.m4a", date: "18 Sep 2026 at 22:41", size: "18,6 MB", kind: "Apple MPEG-4 audio", icon: "m4a" },
  { name: "Thumbnail.heic", date: "18 Sep 2026 at 09:15", size: "1,1 MB", kind: "HEIF image", icon: "heic" },
];

/** Center y of the n-th visible row, in screen pixels. */
export const rowY = (n: number) => LIST_TOP + n * ROW_H + ROW_H / 2;

/** x where the file names start, in screen pixels. */
export const nameX = WIN.x + COL.name;

/** Center of the search field, in screen pixels. */
export const searchCenter = { x: WIN.x + SEARCH.x + SEARCH.w / 2, y: WIN.y + SEARCH.y + SEARCH.h / 2 };
