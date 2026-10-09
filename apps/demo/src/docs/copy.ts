/** Docs chrome strings. Read by the build plugin (page shell) and the browser (search, tools). */
export const DOC_LANGS = ['en', 'id'] as const;
export type DocLang = (typeof DOC_LANGS)[number];
export type DocGroup = 'start' | 'authoring' | 'reference' | 'api' | 'tools';
export const GROUP_ORDER: DocGroup[] = ['start', 'authoring', 'reference', 'api', 'tools'];

export interface DocsCopy {
  docs: string; siteTitle: string; skip: string; menu: string; closeMenu: string; mapApp: string; home: string;
  language: string; onThisPage: string; prev: string; next: string; edit: string; sectionLink: string;
  groups: Record<DocGroup, string>;
  contractTitle: string; contractDesc: string; contractNote: string;
  diagnosticsLevels: { schema: string; error: string; warning: string; info: string };
  levelName: { error: string; warning: string; info: string };
  trigger: string; fix: string; bad: string; good: string;
  note: string; tip: string; warning: string;
  copy: string; copied: string;
  search: string; searchPlaceholder: string; searchEmpty: string; searchHint: string; searchLoading: string; searchFailed: string;
  theme: string; themeAuto: string; themeLight: string; themeDark: string;
  redirecting: string;
  validator: ValidatorCopy; when: WhenCopy;
}

export interface ValidatorCopy {
  input: string; placeholder: string; validate: string; clear: string; chooseFile: string; examples: string;
  dropHere: string; loading: string; loadFailed: string;
  notJson: string; ok: string; rejected: string;
  counts: (e: number, w: number, i: number) => string;
  contents: string; factions: string; places: string; entities: string; events: string; chapters: string;
  diagnostics: string; none: string; path: string; howToFix: string;
  schemaSkipped: string;
  playback: string; playbackNote: string; at: string; activeEvents: string; movingUnits: string; nothing: string;
}

export interface WhenCopy {
  input: string; placeholder: string; examples: string; invalid: string;
  kind: string; instant: string; interval: string; reads: string; start: string; end: string; open: string;
  precision: string; qualifier: string; noQualifier: string; duration: string; ticks: string; from: string; to: string;
  days: (n: number) => string; seconds: (n: number) => string;
  precisions: Record<string, string>; qualifiers: Record<string, string>;
}

export const DOCS_COPY: Record<DocLang, DocsCopy> = {
  en: {
    docs: 'Docs', siteTitle: 'Histamation documentation', skip: 'Skip to content', menu: 'Open navigation', closeMenu: 'Close navigation',
    mapApp: 'Map app', home: 'Histamation home', language: 'Language', onThisPage: 'On this page', prev: 'Previous', next: 'Next',
    edit: 'Edit this page on GitHub', sectionLink: 'Link to this section',
    groups: { start: 'Getting started', authoring: 'Writing a campaign', reference: 'Reference', api: 'API', tools: 'Tools' },
    contractTitle: 'Data contract',
    contractDesc: 'The normative specification: how a campaign file is written, loaded, checked and played.',
    contractNote: 'This page is docs/DATA-CONTRACT.md, the normative text. Where another page and this one disagree, this one is right.',
    diagnosticsLevels: { schema: 'Schema', error: 'Errors', warning: 'Warnings', info: 'Info' },
    levelName: { error: 'error', warning: 'warning', info: 'info' },
    trigger: 'Triggered when', fix: 'How to fix', bad: 'Rejected', good: 'Accepted',
    note: 'Note', tip: 'Tip', warning: 'Warning',
    copy: 'Copy', copied: 'Copied',
    search: 'Search docs', searchPlaceholder: 'Search the documentation', searchEmpty: 'Nothing matches that. Try a field name or a diagnostic code.',
    searchHint: 'Type to search pages, sections and diagnostic codes.', searchLoading: 'Loading the index…', searchFailed: 'The search index could not be loaded.',
    theme: 'Theme', themeAuto: 'Auto', themeLight: 'Light', themeDark: 'Dark',
    redirecting: 'Opening the documentation…',
    validator: {
      input: 'Campaign JSON', placeholder: 'Paste a campaign file here, drop one on this box, or load an example.',
      validate: 'Validate', clear: 'Clear', chooseFile: 'Open a file…', examples: 'Examples',
      dropHere: 'Drop the file to validate it', loading: 'Loading…', loadFailed: 'That example could not be loaded.',
      notJson: 'This is not valid JSON', ok: 'The file passes. It would load and play.', rejected: 'The file is rejected. Fix the errors below.',
      counts: (e, w, i) => `${e} error${e === 1 ? '' : 's'}, ${w} warning${w === 1 ? '' : 's'}, ${i} info`,
      contents: 'In this file', factions: 'factions', places: 'places', entities: 'entities', events: 'events', chapters: 'chapters',
      diagnostics: 'Diagnostics', none: 'No diagnostics.', path: 'Path', howToFix: 'How to fix',
      schemaSkipped: 'JSON Schema checks (S001) could not run in this browser; the semantic checks did.',
      playback: 'Playback dry run', playbackNote: 'Where things are at the start, middle and end of each chapter — the same view as histamation-check --frames.',
      at: 'at', activeEvents: 'Happening', movingUnits: 'Moving', nothing: 'nothing',
    },
    when: {
      input: 'When string', placeholder: 'e.g. 1825-07-20 or 1825-07/1830-03', examples: 'Try', invalid: 'Not a valid When',
      kind: 'Kind', instant: 'Single date', interval: 'Interval', reads: 'Reads as', start: 'Starts', end: 'Ends (exclusive)', open: 'open — takes the timeline extent',
      precision: 'Precision', qualifier: 'Qualifier', noQualifier: 'none', duration: 'Covers', ticks: 'Ticks', from: 'From', to: 'To',
      days: (n) => `${n.toLocaleString('en')} day${n === 1 ? '' : 's'}`, seconds: (n) => `${n.toLocaleString('en')} seconds`,
      precisions: { year: 'year', month: 'month', day: 'day', minute: 'minute', second: 'second' },
      qualifiers: { uncertain: 'uncertain (?)', approximate: 'approximate (~)', 'uncertain-approximate': 'uncertain and approximate (%)' },
    },
  },
  id: {
    docs: 'Dokumentasi', siteTitle: 'Dokumentasi Histamation', skip: 'Langsung ke isi', menu: 'Buka navigasi', closeMenu: 'Tutup navigasi',
    mapApp: 'Aplikasi peta', home: 'Beranda Histamation', language: 'Bahasa', onThisPage: 'Di halaman ini', prev: 'Sebelumnya', next: 'Berikutnya',
    edit: 'Sunting halaman ini di GitHub', sectionLink: 'Tautan ke bagian ini',
    groups: { start: 'Mulai', authoring: 'Menulis kampanye', reference: 'Referensi', api: 'API', tools: 'Alat' },
    contractTitle: 'Kontrak data',
    contractDesc: 'Spesifikasi normatif: cara berkas kampanye ditulis, dimuat, diperiksa, dan dimainkan.',
    contractNote: 'Halaman ini adalah terjemahan informatif. Teks normatifnya adalah docs/DATA-CONTRACT.md dalam bahasa Inggris.',
    diagnosticsLevels: { schema: 'Skema', error: 'Galat', warning: 'Peringatan', info: 'Info' },
    levelName: { error: 'galat', warning: 'peringatan', info: 'info' },
    trigger: 'Muncul ketika', fix: 'Cara memperbaiki', bad: 'Ditolak', good: 'Diterima',
    note: 'Catatan', tip: 'Tips', warning: 'Perhatian',
    copy: 'Salin', copied: 'Tersalin',
    search: 'Cari dokumentasi', searchPlaceholder: 'Cari di dokumentasi', searchEmpty: 'Tidak ada yang cocok. Coba nama kolom atau kode diagnostik.',
    searchHint: 'Ketik untuk mencari halaman, bagian, dan kode diagnostik.', searchLoading: 'Memuat indeks…', searchFailed: 'Indeks pencarian tidak dapat dimuat.',
    theme: 'Tema', themeAuto: 'Otomatis', themeLight: 'Terang', themeDark: 'Gelap',
    redirecting: 'Membuka dokumentasi…',
    validator: {
      input: 'JSON kampanye', placeholder: 'Tempel berkas kampanye di sini, jatuhkan berkas ke kotak ini, atau muat contoh.',
      validate: 'Periksa', clear: 'Kosongkan', chooseFile: 'Buka berkas…', examples: 'Contoh',
      dropHere: 'Jatuhkan berkas untuk memeriksanya', loading: 'Memuat…', loadFailed: 'Contoh itu tidak dapat dimuat.',
      notJson: 'Ini bukan JSON yang sah', ok: 'Berkas lolos. Berkas ini dapat dimuat dan dimainkan.', rejected: 'Berkas ditolak. Perbaiki galat di bawah.',
      counts: (e, w, i) => `${e} galat, ${w} peringatan, ${i} info`,
      contents: 'Isi berkas', factions: 'faksi', places: 'tempat', entities: 'entitas', events: 'peristiwa', chapters: 'bab',
      diagnostics: 'Diagnostik', none: 'Tidak ada diagnostik.', path: 'Jalur', howToFix: 'Cara memperbaiki',
      schemaSkipped: 'Pemeriksaan JSON Schema (S001) tidak dapat berjalan di peramban ini; pemeriksaan semantik tetap berjalan.',
      playback: 'Uji putar', playbackNote: 'Posisi setiap objek di awal, tengah, dan akhir tiap bab — sama seperti histamation-check --frames.',
      at: 'di', activeEvents: 'Sedang terjadi', movingUnits: 'Bergerak', nothing: 'tidak ada',
    },
    when: {
      input: 'String When', placeholder: 'mis. 1825-07-20 atau 1825-07/1830-03', examples: 'Coba', invalid: 'Bukan When yang sah',
      kind: 'Jenis', instant: 'Tanggal tunggal', interval: 'Interval', reads: 'Dibaca', start: 'Mulai', end: 'Berakhir (eksklusif)', open: 'terbuka — memakai rentang linimasa',
      precision: 'Presisi', qualifier: 'Kualifikasi', noQualifier: 'tidak ada', duration: 'Mencakup', ticks: 'Tick', from: 'Dari', to: 'Sampai',
      days: (n) => `${n.toLocaleString('id')} hari`, seconds: (n) => `${n.toLocaleString('id')} detik`,
      precisions: { year: 'tahun', month: 'bulan', day: 'hari', minute: 'menit', second: 'detik' },
      qualifiers: { uncertain: 'tidak pasti (?)', approximate: 'perkiraan (~)', 'uncertain-approximate': 'tidak pasti dan perkiraan (%)' },
    },
  },
};
