export const RELEASE_TYPES = [
  "single",
  "ep",
  "album",
  "mixtape",
  "instrumental",
  "music-video",
] as const;

export const RELEASE_TYPE_LABEL: Record<string, string> = {
  single: "Single",
  ep: "EP",
  album: "Album",
  mixtape: "Mixtape",
  instrumental: "Instrumental",
  "music-video": "Music video",
};

export const STREAM_PLATFORMS = [
  "spotify",
  "apple-music",
  "youtube-music",
  "audiomack",
  "boomplay",
  "deezer",
  "amazon-music",
  "tidal",
  "youtube",
] as const;

export const PLATFORM_LABEL: Record<string, string> = {
  spotify: "Spotify",
  "apple-music": "Apple Music",
  "youtube-music": "YouTube Music",
  audiomack: "Audiomack",
  boomplay: "Boomplay",
  deezer: "Deezer",
  "amazon-music": "Amazon Music",
  tidal: "Tidal",
  youtube: "YouTube",
};

/**
 * Territory choices offered in the admin. "worldwide" plus the markets a
 * Ugandan independent release is realistically licensed into. This is a picker,
 * not a claim: the rights the artist grants are what they select.
 */
export const TERRITORY_CHOICES = [
  "worldwide",
  "UG",
  "KE",
  "TZ",
  "NG",
  "GH",
  "ZA",
  "ET",
  "RW",
  "SS",
  "CD",
  "GB",
  "US",
  "CA",
  "FR",
  "DE",
  "NL",
  "BE",
  "IT",
  "ES",
  "PT",
  "BR",
  "JM",
  "TT",
] as const;

export const LANGUAGE_CHOICES = [
  "Runyankole",
  "Luganda",
  "Swahili",
  "English",
  "Runyoro",
  "Tooro",
  "Aceph",
  "Luo",
  "Rwandese",
  "French",
  "Portuguese",
  "Patois",
] as const;

/** The nine submission states in 0004_distribution.sql, in workflow order. */
export const DISTRIBUTION_STATUSES = [
  "prepared",
  "uploaded",
  "in-review",
  "approved",
  "rejected",
  "scheduled",
  "live",
  "withdrawn",
  "delivered",
] as const;

/**
 * The sentence an admin must be able to truthfully tick before a record may
 * leave "prepared". Each one is a claim about the outside world, so the form
 * asks for the specific observation rather than a generic "done".
 */
export const STATUS_EVIDENCE_LABEL: Record<string, string> = {
  prepared: "",
  uploaded: "I can see the files in the distributor's account.",
  "in-review": "The distributor's dashboard shows this release in review.",
  approved: "The distributor's dashboard shows this release approved.",
  rejected: "The distributor rejected it and I have their reason.",
  scheduled: "The distributor shows a scheduled release date.",
  live: "I opened the release on that store and it plays.",
  withdrawn: "The distributor confirms the submission was withdrawn.",
  delivered: "The distributor confirms the delivery was received.",
};

export const DISTRIBUTION_STATUS_LABEL: Record<string, string> = {
  prepared: "Prepared",
  uploaded: "Uploaded",
  "in-review": "In review",
  approved: "Approved",
  rejected: "Rejected",
  scheduled: "Scheduled",
  live: "Live",
  withdrawn: "Withdrawn",
  delivered: "Delivered",
};
