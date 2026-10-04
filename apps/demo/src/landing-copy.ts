/** Prose and UI copy for the redesigned ChronoMap landing page.
 *  Supports English ('en') and Indonesian ('id'). */

export interface PipelineStageCopy {
  title: string;
  desc: string;
  meta: string;
  metric: string;
}

export interface SectionStepCopy {
  num: string;
  title: string;
  body: string;
  note: string;
}

export interface LandingStrings {
  docTitle: string;
  docDesc: string;
  brandTitle: string;
  brandSub: string;
  navHome: string;
  navStudio: string;
  navDocs: string;
  navPipeline: string;
  navSchema: string;
  engineStatus: string;
  startBtn: string;

  codexOverline: string;
  deterministicClock: string;
  heroTitle: string;
  heroLede: string;
  heroPill1: string;
  heroPill2: string;
  heroPill3: string;
  heroLiveLabel: string;
  heroLiveRoute: string;
  heroLiveTroop: string;
  heroLiveToastTitle: string;
  heroLiveToastBody: string;
  ctaOpenMap: string;
  ctaLoadDemo: string;
  ctaLoadDemoFile: string;
  zeroDeps: string;

  statusLedgerTitle: string;
  activeRecordBadge: string;
  focalPointLabel: string;
  focalPointVal: string;
  routeLengthLabel: string;
  routeLengthVal: string;
  routeLengthSub: string;
  fortsLabel: string;
  fortsVal: string;
  fortsSub: string;
  chroniclesLabel: string;
  chroniclesVal: string;
  interpolationLabel: string;
  interpolationVal: string;

  pipelineTitle: string;
  pipelineLede: string;
  pipelineStages: PipelineStageCopy[];
  pipelineQuote: string;
  pipelineFlow: string;
  pipelineSimBtn: string;
  pipelineSimRunning: string;

  sectionSteps: SectionStepCopy[];

  simTitle: string;
  simDesc: string;
  simCamera: string;
  simArmy1: string;
  simArmy2: string;
  simSiege: string;
  simEventBadge: string;
  simEventBody: string;
  simEventSource: string;
  simEventConfidence: string;
  simDateFormatted: string;
  simM1: string;
  simM2: string;
  simM3: string;
  chapter1: string;
  chapter2: string;
  chapter3: string;

  diagTitle: string;
  diagDesc: string;
  diagRunBtn: string;
  diagScanning: string;
  diagPassed: string;
  specTitle: string;
  specDesc: string;
  specCopyBtn: string;
  specCopied: string;

  ctaBannerTitle: string;
  ctaBannerDesc: string;
  ctaBannerDoc: string;
  ctaBannerStudio: string;

  footerTitle: string;
  footerSub: string;
  footerLicence: string;
}

export const LANDING: Record<string, LandingStrings> = {
  id: {
    docTitle: 'ChronoMap — Peta Sejarah Bergulir dari Satu Berkas JSON',
    docDesc: 'Mesin lokal-dulu untuk peta sejarah bergulir. Jelaskan sebuah kampanye dalam JSON; mesin memainkannya, lengkap dengan sumber dan ketidakpastian.',
    brandTitle: 'ChronoMap',
    brandSub: 'Machina Historica & Tabula Geographica',
    navHome: 'Beranda & Pengenalan',
    navStudio: 'Studio Peta Interaktif',
    navDocs: 'Dokumentasi',
    navPipeline: 'Arsitektur Pipeline',
    navSchema: 'Skema JSON & Spesifikasi',
    engineStatus: 'Engine: Siap (WASM/MapLibre)',
    startBtn: 'Mulai',

    codexOverline: 'Codex Cartographicus / Archivum Historico-Mechanicum',
    deterministicClock: 'Jam Deterministik: Sinkron',
    heroTitle: 'Satu berkas JSON.<br /><span class="italic text-on-surface">Peta yang menceritakan</span> kisahnya.',
    heroLede: 'Mesin lokal-dulu untuk peta sejarah bergulir. Pasukan bergerak di rutenya, benteng berpindah tangan, dan kamera mengikuti alur cerita saat Anda menggulir.',
    heroPill1: '⚡ WASM Lokal-Dulu',
    heroPill2: '📜 1 Berkas JSON Deklaratif',
    heroPill3: '🗺️ Animasi Scrollytelling Peta',
    heroLiveLabel: 'Simulasi Lintasan Langsung',
    heroLiveRoute: 'Rute Marching Perang Jawa (1825–1830)',
    heroLiveTroop: 'Divisi Berkuda Diponegoro',
    heroLiveToastTitle: 'Pos Selarong Ditegakkan',
    heroLiveToastBody: 'Pangeran Diponegoro memusatkan kekuatan di Gua Selarong; garis pertahanan gerilya berkoordinasi secara dinamis.',
    ctaOpenMap: 'Buka Peta Interaktif',
    ctaLoadDemo: 'Muat Berkas Contoh',
    ctaLoadDemoFile: '1825_perang_jawa.json',
    zeroDeps: 'Tanpa ketergantungan server eksternal',

    statusLedgerTitle: 'Status Ledger',
    activeRecordBadge: 'Catatan Aktif',
    focalPointLabel: 'Titik Fokus',
    focalPointVal: 'Perang Jawa (1825–1830) / Ekspedisi 1241',
    routeLengthLabel: 'Panjang Lintasan (Rute)',
    routeLengthVal: '14.820 km',
    routeLengthSub: '(4 segmen tervalidasi)',
    fortsLabel: 'Benteng & Pos Terpantau',
    fortsVal: '42 kubu',
    fortsSub: '(18 pengepungan tervalidasi)',
    chroniclesLabel: 'Kronik & Naskah Primer',
    chroniclesVal: '128 entri peristiwa beranotasi',
    interpolationLabel: 'Interpolasi Koordinat',
    interpolationVal: 'Haversine-Great-Circle Hermite',

    pipelineTitle: 'Cara kerjanya: Arsitektur Empat Tahap',
    pipelineLede: 'Empat tahap, dan hanya tahap terakhir yang tahu apa itu peta. Mesinnya sendiri tidak mengenal DOM maupun penggambar: beri ia sebuah kampanye dan satu titik waktu, ia mengembalikan satu frame.',
    pipelineStages: [
      { title: 'campaign.json', desc: 'Input kanonikal murni deklaratif; bebas atribut proyeksi peta.', meta: 'Parser: JSON-WASM', metric: '142 KB' },
      { title: 'loader + diagnostics', desc: 'Validasi semantik, deteksi jeda waktu mundur, linter rute tak wajar.', meta: 'Rules: 32 tests', metric: '0 Galat' },
      { title: 'resolveFrame', desc: 'Aritmetika murni fungsi f(t). Mengembalikan snapshot posisi & status.', meta: 'Latency: 0.18ms', metric: 'Deterministik' },
      { title: 'MapLibre GL', desc: 'Satu-satunya tahap yang tahu DOM, kanvas WebGL, serta proyeksi peta.', meta: 'GPU Shaders: 60fps', metric: 'Siap Gambar' },
    ],
    pipelineQuote: '"Hanya tahap terakhir yang tahu apa itu peta."',
    pipelineFlow: 'Alur: JSON → Buffer Vektor → Resolusi Tick → Tile WebGL GeoJSON',
    pipelineSimBtn: 'Jalankan Alur Data',
    pipelineSimRunning: 'Mentransfer Paket Data...',

    sectionSteps: [
      {
        num: 'I',
        title: 'Berkas kampanye',
        body: 'Satu dokumen JSON memuat semuanya: faksi, tempat, entitas beserta jejaknya, peristiwa, bab, dan sumber.',
        note: 'Skema: campaign.schema.json',
      },
      {
        num: 'II',
        title: 'Pemuat dan diagnostik',
        body: 'Pemuat memvalidasi dan menormalkan, lalu mengeluarkan diagnostik bernomor untuk mencegah galat visual.',
        note: 'Diagnostic code analyzer: 0 Kritis / 2 Peringatan Arsip',
      },
      {
        num: 'III',
        title: 'Penghitungan frame',
        body: 'Diberi satu tick, resolveFrame menginterpolasi posisi tiap pasukan di sepanjang jejaknya dengan deterministik.',
        note: 'Fungsi Murni: resolveFrame(campaign, t_epoch) => MapSnapshot',
      },
      {
        num: 'IV',
        title: 'Penggambar',
        body: 'MapLibre GL menggambar frame dengan geometri statis yang dipasang sekali per kampanye.',
        note: 'Resolusi oklusi spasial & tipografi non-tabrakan',
      },
    ],

    simTitle: 'Simulasi Real-Time Tabula Cartographica',
    simDesc: 'Pratinjau langsung interpolasi jejak militer dan evaluasi peristiwa per tick.',
    simCamera: 'Kamera: Proyeksi Mercator Vetus',
    simArmy1: 'Sayap Kanan Subutai (Tümen)',
    simArmy2: 'Pasukan Diraja Béla IV',
    simSiege: '⚔ Pertempuran Sungai Sajó (Mohi)',
    simEventBadge: 'PERISTIWA AKTIF #042',
    simEventBody: 'Batu Khan melancarkan serangan pengalihan di jembatan, sementara Subutai membangun jembatan darurat kayu di hilir untuk menjepit sayap tentara Hungaria.',
    simEventSource: 'Sumber: Kronika Rogerius',
    simEventConfidence: 'Tingkat Kepercayaan: 94%',
    simDateFormatted: '9 April 1241 — Jam 06:14 Pagi',
    simM1: '1241-03-12 (Celah Verecke ditembus)',
    simM2: '1241-04-09 (Pertempuran Mohi)',
    simM3: '1241-04-28 (Pengepungan Klis)',
    chapter1: '01. Celah Verecke',
    chapter2: '02. Sungai Sajó (Mohi)',
    chapter3: '03. Pengepungan Klis',

    diagTitle: 'Diagnostika & Uji Integritas Berkas',
    diagDesc: 'Semua diskontinuitas spasial ditangkap saat inisialisasi awal tanpa membebani GPU runtime.',
    diagRunBtn: 'Jalankan Uji Integritas',
    diagScanning: 'Memindai aturan GeoJSON...',
    diagPassed: 'Semua 32 Aturan Lolos!',
    specTitle: 'Spesifikasi Naskah (Schema Excerpt)',
    specDesc: 'Struktur data deklaratif memisahkan fakta historis dari animasi rendering.',
    specCopyBtn: 'Salin Skema',
    specCopied: 'Tersalin!',

    ctaBannerTitle: 'Mulai Menulis Peta Kronologis Anda Sendiri',
    ctaBannerDesc: 'Gunakan editor JSON berkas atau hubungkan pipeline ke arsip institusi universitas Anda. Tanpa pendaftaran, luring-pertama.',
    ctaBannerDoc: 'Dokumentasi Skema',
    ctaBannerStudio: 'Coba di Studio Peta',

    footerTitle: 'ChronoMap: Compilatio Cartographica Digitalis',
    footerSub: 'Officina Historica & Geographica • Local-first WASM Telemetry Architecture',
    footerLicence: 'Kode MIT • Data CC-BY-4.0 • Peta Dasar Natural Earth (Domain Publik)',
  },

  en: {
    docTitle: 'ChronoMap — Scrollytelling Historical Maps from One JSON File',
    docDesc: 'A local-first engine for scrollytelling historical maps. One JSON file describes a campaign; the engine plays it, sources and uncertainty included.',
    brandTitle: 'ChronoMap',
    brandSub: 'Machina Historica & Tabula Geographica',
    navHome: 'Home & Introduction',
    navStudio: 'Interactive Map Studio',
    navDocs: 'Documentation',
    navPipeline: 'Pipeline Architecture',
    navSchema: 'JSON Schema & Specification',
    engineStatus: 'Engine: Ready (WASM/MapLibre)',
    startBtn: 'Start',

    codexOverline: 'Codex Cartographicus / Archivum Historico-Mechanicum',
    deterministicClock: 'Deterministic Clock: Synced',
    heroTitle: 'One JSON file.<br /><span class="italic text-on-surface">A map that tells</span> its story.',
    heroLede: 'A local-first engine for scrollytelling historical maps. Troops march along their routes, forts change hands, and the camera follows the narrative as you scroll.',
    heroPill1: '⚡ Local-First WASM',
    heroPill2: '📜 1 Declarative JSON File',
    heroPill3: '🗺️ Scrollytelling Map Animation',
    heroLiveLabel: 'Live Route Simulation',
    heroLiveRoute: 'Java War March Route (1825–1830)',
    heroLiveTroop: 'Diponegoro Mounted Squadron',
    heroLiveToastTitle: 'Selarong Strongpoint Established',
    heroLiveToastBody: 'Prince Diponegoro gathers forces at Selarong Cave; guerrilla defense lines coordinate dynamically.',
    ctaOpenMap: 'Open Interactive Map',
    ctaLoadDemo: 'Load Example File',
    ctaLoadDemoFile: '1825_java_war.json',
    zeroDeps: 'Zero external server dependencies',

    statusLedgerTitle: 'Status Ledger',
    activeRecordBadge: 'Active Record',
    focalPointLabel: 'Focal Point',
    focalPointVal: 'Java War (1825–1830) / 1241 Expedition',
    routeLengthLabel: 'Route Length',
    routeLengthVal: '14,820 km',
    routeLengthSub: '(4 validated segments)',
    fortsLabel: 'Forts & Strongholds Tracked',
    fortsVal: '42 forts',
    fortsSub: '(18 validated sieges)',
    chroniclesLabel: 'Primary Chronicles',
    chroniclesVal: '128 annotated event entries',
    interpolationLabel: 'Coordinate Interpolation',
    interpolationVal: 'Haversine-Great-Circle Hermite',

    pipelineTitle: 'How it works: Four-Stage Architecture',
    pipelineLede: 'Four stages, and only the last one knows what a map is. The engine itself has no DOM and no renderer: give it a campaign and a moment in time, and it hands back a frame.',
    pipelineStages: [
      { title: 'campaign.json', desc: 'Purely declarative canonical input; free of map projection attributes.', meta: 'Parser: JSON-WASM', metric: '142 KB' },
      { title: 'loader + diagnostics', desc: 'Semantic validation, backward time jump detection, improbable route linter.', meta: 'Rules: 32 tests', metric: '0 Errors' },
      { title: 'resolveFrame', desc: 'Pure arithmetic function f(t). Returns snapshot of positions and status.', meta: 'Latency: 0.18ms', metric: 'Deterministic' },
      { title: 'MapLibre GL', desc: 'The only stage that knows DOM, WebGL canvas, and map projection.', meta: 'GPU Shaders: 60fps', metric: 'Render Ready' },
    ],
    pipelineQuote: '"Only the final stage knows what a map is."',
    pipelineFlow: 'Flow: JSON → Vector Buffer → Tick Resolution → WebGL GeoJSON Tile',
    pipelineSimBtn: 'Run Data Flow',
    pipelineSimRunning: 'Streaming Data Packets...',

    sectionSteps: [
      {
        num: 'I',
        title: 'The campaign file',
        body: 'One JSON document holds everything: factions, places, entities and their tracks, events, chapters and sources.',
        note: 'Schema: campaign.schema.json',
      },
      {
        num: 'II',
        title: 'Loader and diagnostics',
        body: 'The loader validates and normalises, emitting numbered diagnostics to prevent misleading visuals.',
        note: 'Diagnostic code analyzer: 0 Critical / 2 Archival Warnings',
      },
      {
        num: 'III',
        title: 'Frame resolution',
        body: 'Given a tick, resolveFrame interpolates every unit along its track deterministically.',
        note: 'Pure Function: resolveFrame(campaign, t_epoch) => MapSnapshot',
      },
      {
        num: 'IV',
        title: 'The renderer',
        body: 'MapLibre GL draws the frame with static geometry installed once per campaign.',
        note: 'Spatial occlusion resolution & non-colliding typography',
      },
    ],

    simTitle: 'Real-Time Simulation: Tabula Cartographica',
    simDesc: 'Live preview of military track interpolation and event evaluation per tick.',
    simCamera: 'Camera: Mercator Vetus Projection',
    simArmy1: 'Subutai Right Wing (Tümen)',
    simArmy2: 'Royal Host of Béla IV',
    simSiege: '⚔ Battle of the Sajó River (Mohi)',
    simEventBadge: 'ACTIVE EVENT #042',
    simEventBody: 'Batu Khan launches a diversionary attack at the bridge, while Subutai constructs a temporary wooden crossing downstream to encircle the Hungarian flank.',
    simEventSource: 'Source: Carmen Miserabile (Rogerius)',
    simEventConfidence: 'Confidence Level: 94%',
    simDateFormatted: '9 April 1241 — 06:14 AM',
    simM1: '1241-03-12 (Verecke Pass breached)',
    simM2: '1241-04-09 (Battle of Mohi)',
    simM3: '1241-04-28 (Siege of Klis)',
    chapter1: '01. Verecke Pass',
    chapter2: '02. Sajó River (Mohi)',
    chapter3: '03. Siege of Klis',

    diagTitle: 'Diagnostics & File Integrity Suite',
    diagDesc: 'All spatial discontinuities are caught during initialization without burdening the GPU runtime.',
    diagRunBtn: 'Run Integrity Scan',
    diagScanning: 'Scanning GeoJSON rules...',
    diagPassed: 'All 32 Rules Passed!',
    specTitle: 'Script Specification (Schema Excerpt)',
    specDesc: 'Declarative data structures separate historical facts from rendering animation.',
    specCopyBtn: 'Copy Schema',
    specCopied: 'Copied!',

    ctaBannerTitle: 'Start Authoring Your Own Chronological Map',
    ctaBannerDesc: 'Use any JSON editor or connect the pipeline to your university archives. Zero signup, local-first.',
    ctaBannerDoc: 'Schema Documentation',
    ctaBannerStudio: 'Try in Map Studio',

    footerTitle: 'ChronoMap: Compilatio Cartographica Digitalis',
    footerSub: 'Officina Historica & Geographica • Local-first WASM Telemetry Architecture',
    footerLicence: 'MIT Code • CC-BY-4.0 Data • Natural Earth Basemap (Public Domain)',
  },
};
