/**
 * Empty state copy — themed around Arcy the celestial bear,
 * guardian of the film archives on a station orbiting Arcturus.
 * See ARCY.md for full lore reference.
 *
 * Scene keys: theater, window, lost, projector, archives, comms
 */

// Home page — no lists at all
export const HOME_NO_LISTS = {
  title: 'The station is quiet.',
  subtitle: 'Arcy waits by the archive, but there are no lists to tend. Create one, or join a friend\'s.',
  scene: 'archives',
};

// Home page — search/filter returns nothing
export const HOME_NO_RESULTS = {
  title: 'Arcy remembers... something used to be here.',
  subtitle: 'But what?',
  scene: 'window',
};

// Discover page — no movies found
export const DISCOVER_NO_RESULTS = {
  title: 'The projector hums. Arcy stares at the screen.',
  subtitle: 'Nothing.',
  scene: 'projector',
};

// Profile — no watched movies
export const PROFILE_NO_WATCHED = {
  title: 'No signals received yet.',
  subtitle: 'Arcy listens, but the frequencies are silent.',
  scene: 'projector',
};

// Profile — no lists
export const PROFILE_NO_LISTS = {
  title: 'Empty shelves in the archive.',
  subtitle: 'No lists have reached this station.',
  scene: 'archives',
};

// Friends page — no friends
export const FRIENDS_NONE = {
  title: 'Arcy is alone on the station.',
  subtitle: 'Search by name to find someone out there.',
  scene: 'theater',
};

// Friends page — search returns nothing
export const FRIENDS_NO_RESULTS = {
  title: 'No signal matches that frequency.',
  scene: 'comms',
};

// List detail — list not found
export const LIST_NOT_FOUND = {
  title: 'This archive entry has been lost.',
  subtitle: 'The record may have been erased, or perhaps it never existed.',
  scene: 'archives',
};

// Movie detail — movie not found
export const MOVIE_NOT_FOUND = {
  title: 'A missing reel.',
  subtitle: 'Arcy searches the archive, but this film is nowhere to be found.',
  scene: 'projector',
};

// Progress view — not found
export const PROGRESS_NOT_FOUND = {
  title: 'No transmission log found.',
  subtitle: 'This viewing record seems to have drifted into the void.',
  scene: 'window',
};

// Watched by year — no matches
export const WATCHED_NO_MATCHES = {
  title: 'The archive is empty for this frequency.',
  subtitle: 'Try adjusting your filters.',
  scene: 'archives',
};

// Watched by year — nothing watched at all
export const WATCHED_NONE = {
  title: 'No transmissions received.',
  subtitle: 'Arcy waits patiently by the receiver.',
  scene: 'comms',
};

// User not found
export const USER_NOT_FOUND = {
  title: 'Signal lost.',
  subtitle: 'Arcy can\'t locate this traveler.',
  scene: 'comms',
};

// Public share — expired/disabled
export const SHARE_NOT_FOUND = {
  title: 'This broadcast has ended.',
  subtitle: 'The signal may have expired or been switched off.',
  scene: 'comms',
};

// Access denied
export const ACCESS_DENIED = {
  title: 'Restricted sector.',
  subtitle: 'Arcy guards this part of the station.',
  scene: 'window',
};

// Admin — no users found
export const ADMIN_NO_USERS = {
  title: 'No crew detected.',
  scene: 'comms',
};

// Admin — user has no lists
export const ADMIN_NO_LISTS = {
  title: 'No archives assigned to this crew member.',
  scene: 'archives',
};
