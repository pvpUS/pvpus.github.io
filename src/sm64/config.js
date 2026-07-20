const SHEET_ID = '1J20aivGnvLlAuyRIMMclIFUmrkHXUzgcDmYa31gdtCI';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;

// The sheet itself is only ever hourly (that's the refresh cadence the
// original 100cSum server polled it at), so a cached result is still
// current for this long — no point re-fetching every time the overlay reopens.
const CACHE_MAX_AGE_MS = 60 * 60 * 1000;

// Header row (row 1) holds player names starting at column G (index 6, 0-based).
const PLAYER_COL_START = 6;

// Column D holds each split's "Ideal Run" time, used to normalize JP vs US
// region times (see computeLeaderboard in lib.js).
const IDEAL_RUN_COL = 3;

// Every 100-coin star is entered twice per named route: once for the JP
// version of the game, once for US. The two versions run at a slightly
// different pace, so raw times aren't directly comparable — a JP row and a
// US row for the *same route* are matched up and normalized using column D
// (see lib.js). Rows are found dynamically at refresh time by matching
// these phrases (case-insensitive substrings) against column A, rather than
// hardcoded row numbers, so the leaderboard keeps working even if rows get
// inserted/deleted/reordered in the sheet.
//
// Some stages have multiple named 100-coin routes (e.g. CCM's normal race
// vs. the "atmpas special route") — each string in `routes` is one such
// route, and is expected to match exactly one JP row and one US row.
export const STAGES = [
  { code: 'BOB', name: "Bob-omb Battlefield", routes: ['Find the 8 Red Coins + 100c'] },
  { code: 'WF', name: "Whomp's Fortress", routes: ['Red Coins on the Floating Isle + 100c', '8 coin ring first, ~41c wooden platform'] },
  { code: 'JRB', name: "Jolly Roger Bay", routes: ['Red Coins on the Ship Afloat + 100c', 'w/o cannon cutscene'] },
  { code: 'CCM', name: "Cool, Cool Mountain", routes: ['Big Penguin Race + 100c', 'Race + 100c atmpas special route'] },
  { code: 'BBH', name: "Big Boo's Haunt", routes: ['Seek the 8 Red Coins + 100c'] },
  { code: 'HMC', name: "Hazy Maze Cave", routes: ['Elevate for 8 Red Coins + 100c'] },
  { code: 'LLL', name: "Lethal Lava Land", routes: ['Hot-Foot-It into the Volcano + 100c'] },
  { code: 'SSL', name: "Shifting Sand Land", routes: ['Pyramid Puzzle + 100c', 'Puzzle + 100c Maze pillar early route'] },
  { code: 'DDD', name: "Dire, Dire Docks", routes: ['Pole-Jumping for Red Coins + 100c'] },
  { code: 'SL', name: "Snowman's Land", routes: ["Shell Shreddin' for Red Coins + 100c"] },
  { code: 'WDW', name: "Wet-Dry World", routes: ['Go to Town for Red Coins + 100c'] },
  { code: 'TTM', name: "Tall, Tall Mountain", routes: ["Scary 'Shrooms, Red Coins + 100c"] },
  { code: 'THI', name: "Tiny-Huge Island", routes: ["Wiggler's Red Coins + 100c"] },
  { code: 'TTC', name: "Tick Tock Clock", routes: ['Stomp on the Thwomp + 100c', 'Thwomp + 100c w/ safety red'] },
  { code: 'RR', name: "Rainbow Ride", routes: ['The Big House in the Sky + 100c', 'Somewhere over the Rainbow + 100c', 'No pole skip + Donut Block ledgegrab'] },
];

export { CSV_URL, PLAYER_COL_START, IDEAL_RUN_COL, CACHE_MAX_AGE_MS };
