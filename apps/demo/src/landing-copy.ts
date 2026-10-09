/** Copy for the landing page, in English ('en') and Indonesian ('id').
 *  Plain text only: every string reaches the DOM through textContent. */

export interface LandingStrings {
  docTitle: string;
  docDesc: string;
  navDocs: string;
  openMap: string;

  heroKicker: string;
  heroTitle: string;
  heroTitleAccent: string;
  heroLede: string;
  readDocs: string;

  plateCaption: string;
  plateOpen: string;
  plateLoading: string;
  plateFailed: string;
  play: string;
  pause: string;
  scrub: string;

  howTitle: string;
  steps: { title: string; body: string }[];

  principles: { title: string; body: string }[];

  footerLicence: string;
}

export const LANDING: Record<string, LandingStrings> = {
  en: {
    docTitle: 'Histamation — Historical maps from one JSON file',
    docDesc: 'An open-source engine for scrollytelling historical maps. Describe a campaign in JSON; Histamation plays it, sources and uncertainty included.',
    navDocs: 'Docs',
    openMap: 'Open the map',

    heroKicker: 'Open-source engine for historical maps',
    heroTitle: 'Write the campaign once.',
    heroTitleAccent: 'Watch it march.',
    heroLede: 'Armies, routes, forts and sources in one JSON file. Histamation turns it into a map you scroll through, with every uncertainty drawn and every claim cited.',
    readDocs: 'Read the docs',

    plateCaption: 'Live, not a video: the engine resolving waterloo-1815.json in this tab.',
    plateOpen: 'Open in the map',
    plateLoading: 'Loading the campaign…',
    plateFailed: 'The preview could not be loaded.',
    play: 'Play',
    pause: 'Pause',
    scrub: 'Campaign time',

    howTitle: 'One file in, one map out',
    steps: [
      { title: 'Describe', body: 'Factions, places, troop tracks, events, chapters and the sources behind them.' },
      { title: 'Check', body: 'The checker catches malformed dates, out-of-order tracks and broken references before a reader does.' },
      { title: 'Play', body: 'Scroll the story chapter by chapter, or scrub freely through time.' },
    ],

    principles: [
      { title: 'Uncertainty is drawn', body: 'A conjectural position is a circle on the ground, not a confident dot.' },
      { title: 'Every claim cites', body: 'Tracks, events and chapters point to the sources behind them.' },
      { title: 'Many languages', body: 'Any text can carry several translations; readers switch in place.' },
      { title: 'No backend', body: 'Static files only: no server code, no account. The basemap is self-hosted.' },
    ],

    footerLicence: 'Code MIT · Data CC BY 4.0 · Basemap Natural Earth (public domain)',
  },
  id: {
    docTitle: 'Histamation — Peta sejarah interaktif dari satu berkas JSON',
    docDesc: 'Mesin sumber terbuka untuk membuat peta sejarah interaktif. Tulis kampanye dalam satu berkas JSON, dan Histamation menampilkannya lengkap dengan sumber dan tingkat kepastiannya.',
    navDocs: 'Dokumentasi',
    openMap: 'Buka peta',

    heroKicker: 'Mesin sumber terbuka untuk peta sejarah',
    heroTitle: 'Tulis kampanyenya sekali.',
    heroTitleAccent: 'Saksikan ia bergerak.',
    heroLede: 'Pasukan, rute, benteng, dan sumber dalam satu berkas JSON. Histamation mengubahnya menjadi peta yang Anda gulir, dengan setiap ketidakpastian digambar dan setiap klaim bersumber.',
    readDocs: 'Baca dokumentasi',

    plateCaption: 'Langsung, bukan video: mesin menghitung waterloo-1815.json di tab ini.',
    plateOpen: 'Buka di peta',
    plateLoading: 'Memuat kampanye…',
    plateFailed: 'Pratinjau gagal dimuat.',
    play: 'Putar',
    pause: 'Jeda',
    scrub: 'Waktu kampanye',

    howTitle: 'Satu berkas masuk, satu peta keluar',
    steps: [
      { title: 'Tulis', body: 'Faksi, tempat, jejak pasukan, peristiwa, bab, dan sumber di baliknya.' },
      { title: 'Periksa', body: 'Pemeriksa menangkap tanggal cacat, jejak yang tak berurutan, dan rujukan yang putus sebelum pembaca melihatnya.' },
      { title: 'Putar', body: 'Gulir ceritanya bab demi bab, atau geser waktu dengan bebas.' },
    ],

    principles: [
      { title: 'Ketidakpastian digambar', body: 'Posisi dugaan tampil sebagai lingkaran di tanah, bukan titik yang yakin.' },
      { title: 'Setiap klaim bersumber', body: 'Jejak, peristiwa, dan bab menunjuk sumber di baliknya.' },
      { title: 'Banyak bahasa', body: 'Setiap teks dapat memuat beberapa terjemahan; pembaca beralih di tempat.' },
      { title: 'Tanpa backend', body: 'Hanya berkas statis: tanpa kode server, tanpa akun. Peta dasarnya dihosting sendiri.' },
    ],

    footerLicence: 'Kode MIT · Data CC BY 4.0 · Peta dasar Natural Earth (domain publik)',
  },
};
