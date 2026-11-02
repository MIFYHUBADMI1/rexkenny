import type {
  ArtistProfileData,
  Beat,
  BlogPost,
  MusicVideo,
  Release,
  Track,
} from "@/lib/types";

export const DEMO_NOTE =
  "Demo content — replace through the admin CMS or Supabase. These are structural placeholders, not published works.";

export const demoArtist: ArtistProfileData = {
  name: "REX KENNY",
  legalName: null,
  slug: "rex-kenny",
  bioShort:
    "REX KENNY is an African Dancehall artist, singer, songwriter and producer from Kasese, Uganda.",
  bioMedium:
    "Working out of Kasese in western Uganda, REX KENNY builds African Dancehall records as an independent artist — writing, singing, rapping and producing. This paragraph is an editable placeholder; replace it with the artist's own account of his start, his first recordings and what he is releasing now.",
  bioLong:
    "Full-length press biography placeholder. Write the artist's real story here: origins in Kasese, the first songs, influences, the studio process, and current projects. Nothing here should claim awards, chart positions, collaborations or streaming figures that have not actually happened.",
  city: "Kasese",
  country: "Uganda",
  genres: ["African Dancehall", "Afrobeat", "Afropop", "Hip-hop"],
  instruments: ["Vocals", "Production", "Beatmaking"],
  influences: [],
  mission: "From Kasese, Uganda to the World.",
  photoUrl: "/images/rex-kenny-press-1-1600.jpg",
  photoAlt: "REX KENNY, African Dancehall artist from Kasese, Uganda — press photograph",
  socials: [],
  streaming: [],
  bookingEmail: null,
  pressEmail: null,
};

const emptySeo = {
  title: null,
  description: null,
  canonical: null,
  ogImage: null,
  noindex: false,
};

export const demoReleases: Release[] = [
  {
    id: "demo-1",
    slug: "sample-single",
    title: "Sample Single",
    releaseType: "single",
    status: "draft",
    releaseDate: null,
    genre: "African Dancehall",
    subgenre: null,
    language: "English",
    description:
      "Placeholder release used to show the layout of a music page. Replace it with a real release in the admin before launch.",
    artworkUrl: null,
    artworkAlt: "Sample Single artwork placeholder",
    featuredArtists: [],
    label: null,
    isrc: null,
    upc: null,
    copyright: null,
    publishing: null,
    territories: [],
    videoUrl: null,
    readinessScore: null,
    readinessEvaluatedAt: null,
    artistName: "REX KENNY",
    streaming: [],
    tracks: [
      {
        id: "demo-1-t1",
        title: "Sample Single",
        slug: "sample-single",
        durationSeconds: null,
        trackNumber: 1,
        isrc: null,
        explicit: false,
        previewUrl: null,
        lyrics: null,
        lyricsCleared: false,
        credits: { songwriter: ["REX KENNY"], composer: [], producer: [] },
      },
    ],
    seo: emptySeo,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const demoVideos: MusicVideo[] = [];
export const demoPosts: BlogPost[] = [];

/**
 * Deliberately empty. A beat catalogue implies licensable works and prices,
 * so nothing is shown until the artist publishes real ones in the admin.
 */
export const demoBeats: Beat[] = [];

export function tracksOf(release: Release): Track[] {
  return [...release.tracks].sort((a, b) => a.trackNumber - b.trackNumber);
}
