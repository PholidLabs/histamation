/** UI strings for the demo shell. Campaign text comes from the file itself. */
export interface UIStrings {
  campaign: string; story: string; explore: string; load: string; chapter: string; of: string;
  scrollCue: string; contentNote: string; period: string; languages: string; licence: string;
  inThisFile: string; checked: string; errors: string; warnings: string; notes: string;
  chapters: string; events: string; places: string; forces: string; sources: string; note: string;
  eventsHere: string; notMapped: string; viewSource: string; imageNote: string; end: string; exploreFreely: string;
  exploreLede: string; play: string; pause: string; jump: string; now: string; happening: string;
  strongholds: string; engine: string; loadYours: string; loadHelp: string; loadFailed: string; dismiss: string;
  nothing: string; moving: string; men: string; sides: string; lines: string; routeDoc: string; routeConj: string;
  routeSea: string; uncertainty: string; basemap: string; terrain: string;
  day: string; week: string; month: string;
  exact: string; approximate: string; conjectural: string; legend: string; aboutPreview: string; aboutText: string;
  theme: string; themeAuto: string; themeLight: string; themeDark: string; dropHere: string;
  mountains: string; rivers: string; cities: string; forests: string; marchActive: string;
  helpGuide: string; tourNext: string; tourPrev: string; tourSkip: string; tourDone: string;
  tourStepModeTitle: string; tourStepModeDesc: string;
  tourStepCampaignTitle: string; tourStepCampaignDesc: string;
  tourStepPrefsTitle: string; tourStepPrefsDesc: string;
}

export const UI: Record<string, UIStrings> = {
  en: {
    campaign: 'Campaign', story: 'Story', explore: 'Explore', load: 'Load JSON…', chapter: 'Chapter', of: 'of',
    scrollCue: 'Scroll to begin ↓', contentNote: 'Content note', period: 'Period', languages: 'Languages', licence: 'Licence',
    inThisFile: 'In this file', checked: 'Reference loader', errors: 'errors', warnings: 'warnings', notes: 'notes',
    chapters: 'chapters', events: 'events', places: 'places', forces: 'forces', sources: 'Sources', note: 'Note',
    eventsHere: 'Events in this chapter', notMapped: 'not on the map', viewSource: 'View at source',
    imageNote: 'Image could not be loaded here', end: 'End of the campaign', exploreFreely: 'Explore freely →',
    exploreLede: 'Drag the timeline or press play. Pan, zoom and tilt the map, and click anything for its sources and uncertainty.',
    play: 'Play', pause: 'Pause', jump: 'Jump to chapter', now: 'On the map now', happening: 'Happening',
    strongholds: 'Strongholds', engine: 'Engine', loadYours: 'Load your own campaign',
    loadHelp: 'Drop a Histamation campaign JSON anywhere on this page. If it passes the loader it plays here with no code changes.',
    loadFailed: 'That file could not be loaded', dismiss: 'Dismiss', nothing: 'nothing', moving: 'on the move',
    men: 'men', sides: 'Sides', lines: 'Lines', routeDoc: 'documented route', routeConj: 'conjectural route',
    routeSea: 'by sea', uncertainty: 'location uncertainty', basemap: 'Basemap: Natural Earth, self-hosted.',
    terrain: '3D terrain', day: '1 day/s', week: '1 week/s', month: '1 month/s',
    exact: 'exact site', approximate: 'approximate', conjectural: 'conjectural', legend: 'Legend',
    aboutPreview: 'About this demo',
    aboutText: 'MapLibre GL renders the map; @pholidlabs/histamation-engine parses, validates and resolves every frame. Same code the Rust core must match, and the same JSON any other campaign would use.',
    theme: 'Theme', themeAuto: 'Auto', themeLight: 'Light', themeDark: 'Dark',
    dropHere: 'Drop to load campaign',
    mountains: 'Mountains & Volcanoes', forests: 'Historic Teak Groves & Forests', rivers: 'Rivers & Waterways', cities: 'Historic Settlements', marchActive: 'Troops on the march',
    helpGuide: 'Help & Tour', tourNext: 'Next →', tourPrev: '← Back', tourSkip: 'Skip', tourDone: 'Got it!',
    tourStepModeTitle: 'Mode: Story vs. Explore',
    tourStepModeDesc: 'Histamation starts in Story mode (scrollytelling) where scrolling drives the map. Switch to Explore to unlock the Play/Pause button, speed controls, timeline scrubbing, and 3D navigation!',
    tourStepCampaignTitle: 'Campaign & Custom Data',
    tourStepCampaignDesc: 'Switch between campaigns (such as Java War 1825 or Napoleon 1812) or click "Load JSON" to drop in your own campaign file.',
    tourStepPrefsTitle: 'Language, Theme & Tour',
    tourStepPrefsDesc: 'Switch between English and Indonesian, toggle parchment themes (Auto, Light, Dark), or click this "?" button anytime to view this guide again.',
  },
  id: {
    campaign: 'Kampanye', story: 'Cerita', explore: 'Jelajah', load: 'Muat JSON…', chapter: 'Bab', of: 'dari',
    scrollCue: 'Gulir untuk mulai ↓', contentNote: 'Catatan isi', period: 'Periode', languages: 'Bahasa', licence: 'Lisensi',
    inThisFile: 'Isi berkas ini', checked: 'Pemeriksa acuan', errors: 'galat', warnings: 'peringatan', notes: 'catatan',
    chapters: 'bab', events: 'peristiwa', places: 'tempat', forces: 'pasukan', sources: 'Sumber', note: 'Catatan',
    eventsHere: 'Peristiwa dalam bab ini', notMapped: 'tidak dipetakan', viewSource: 'Lihat di sumber',
    imageNote: 'Gambar tidak dapat dimuat di sini', end: 'Akhir kampanye', exploreFreely: 'Jelajah bebas →',
    exploreLede: 'Geser garis waktu atau tekan putar. Geser, perbesar, dan miringkan peta, lalu klik objek untuk melihat sumber dan tingkat kepastiannya.',
    play: 'Putar', pause: 'Jeda', jump: 'Lompat ke bab', now: 'Di peta saat ini', happening: 'Sedang terjadi',
    strongholds: 'Benteng', engine: 'Mesin', loadYours: 'Muat kampanye Anda',
    loadHelp: 'Jatuhkan berkas JSON kampanye Histamation ke halaman ini. Jika lolos pemeriksaan, berkas langsung dimainkan tanpa ubah kode.',
    loadFailed: 'Berkas itu tidak dapat dimuat', dismiss: 'Tutup', nothing: 'tidak ada', moving: 'sedang bergerak',
    men: 'orang', sides: 'Pihak', lines: 'Garis', routeDoc: 'rute terdokumentasi', routeConj: 'rute dugaan',
    routeSea: 'lewat laut', uncertainty: 'ketidakpastian lokasi', basemap: 'Peta dasar: Natural Earth, dihosting sendiri.',
    terrain: 'Relief 3D', day: '1 hari/dtk', week: '1 minggu/dtk', month: '1 bulan/dtk',
    exact: 'lokasi pasti', approximate: 'perkiraan', conjectural: 'dugaan', legend: 'Legenda',
    aboutPreview: 'Tentang demo ini',
    aboutText: 'MapLibre GL menggambar peta; @pholidlabs/histamation-engine mengurai, memvalidasi, dan menghitung setiap frame. Kode yang sama yang harus disamai inti Rust, dan JSON yang sama untuk kampanye mana pun.',
    theme: 'Tema', themeAuto: 'Otomatis', themeLight: 'Terang', themeDark: 'Gelap',
    dropHere: 'Jatuhkan berkas untuk memuat kampanye',
    mountains: 'Gunung & Gunung Api', forests: 'Alas Jati & Hutan Sejarah', rivers: 'Sungai & Saluran Air', cities: 'Permukiman Sejarah', marchActive: 'Pergerakan pasukan',
    helpGuide: 'Panduan & Bantuan', tourNext: 'Lanjut →', tourPrev: '← Kembali', tourSkip: 'Lewati', tourDone: 'Mengerti!',
    tourStepModeTitle: 'Mode: Cerita vs Jelajah',
    tourStepModeDesc: 'Histamation dimulai dalam mode Cerita (scrollytelling) di mana guliran teks menggerakkan peta. Beralih ke Jelajah untuk membuka tombol Putar/Jeda, atur kecepatan, geser linimasa, dan navigasi 3D!',
    tourStepCampaignTitle: 'Pilihan Kampanye & Data',
    tourStepCampaignDesc: 'Beralih antara kampanye (Perang Jawa 1825 atau Napoleon 1812) atau klik "Muat JSON" untuk memuat berkas kampanye Anda sendiri.',
    tourStepPrefsTitle: 'Bahasa, Tema & Panduan',
    tourStepPrefsDesc: 'Ganti bahasa (ID/EN), pilih tema perkamen (Otomatis, Terang, Gelap), atau klik tombol "?" kapan saja untuk membuka kembali panduan ini.',
  },
};

export const STATUS: Record<string, Record<string, string>> = {
  en: { planned: 'planned', active: 'held', besieged: 'under siege', captured: 'captured', destroyed: 'destroyed', abandoned: 'abandoned', encamped: 'encamped', captive: 'captive', surrendered: 'surrendered', disbanded: 'disbanded', exiled: 'in exile', dead: 'dead' },
  id: { planned: 'direncanakan', active: 'dikuasai', besieged: 'dikepung', captured: 'direbut', destroyed: 'dihancurkan', abandoned: 'ditinggalkan', encamped: 'berkemah', captive: 'ditawan', surrendered: 'menyerah', disbanded: 'dibubarkan', exiled: 'diasingkan', dead: 'meninggal' },
};
export const KINDS: Record<string, Record<string, string>> = {
  en: { battle: 'Battle', siege: 'Siege', skirmish: 'Skirmish', raid: 'Raid', massacre: 'Massacre', capture: 'Capture', surrender: 'Surrender', negotiation: 'Negotiation', treaty: 'Treaty', proclamation: 'Proclamation', decree: 'Decree', uprising: 'Uprising', appointment: 'Appointment', arrest: 'Arrest', exile: 'Exile', birth: 'Birth', death: 'Death', political: 'Political event', other: 'Event' },
  id: { battle: 'Pertempuran', siege: 'Pengepungan', skirmish: 'Pertempuran kecil', raid: 'Serangan', massacre: 'Pembantaian', capture: 'Penangkapan', surrender: 'Penyerahan diri', negotiation: 'Perundingan', treaty: 'Perjanjian', proclamation: 'Proklamasi', decree: 'Dekret', uprising: 'Perlawanan', appointment: 'Pengangkatan', arrest: 'Penangkapan', exile: 'Pengasingan', birth: 'Kelahiran', death: 'Kematian', political: 'Peristiwa politik', other: 'Peristiwa' },
};
export const ROLES: Record<string, Record<string, string>> = {
  en: { attacker: 'attacking', defender: 'defending', belligerent: 'fighting', negotiator: 'negotiating', mediator: 'mediating', perpetrator: 'perpetrators', victim: 'victims', party: 'involved' },
  id: { attacker: 'menyerang', defender: 'bertahan', belligerent: 'bertempur', negotiator: 'berunding', mediator: 'menengahi', perpetrator: 'pelaku', victim: 'korban', party: 'terlibat' },
};
