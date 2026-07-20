import { PLAYER_COL_START, IDEAL_RUN_COL, STAGES } from './config';

// Minimal RFC4180-ish CSV parser: handles quoted fields with embedded
// commas, newlines, and doubled "" escapes, which Google's CSV export uses
// for split names like "[1] BoB RTA (RTA strat | Fadeout | ...)".
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      // skip, \n handles the row break
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// SM64 IGT runs at 30fps, so the true fractional part of any split is a
// multiple of 1/30 second (0, 1/30, 2/30, ...), which the sheet displays as
// a truncated 2-digit "hundredths" value (frame 10/30 = .3333... shows as
// ".33", frame 20/30 = .6666... shows as ".66"). Treating that hundredths
// digit as a literal decimal loses precision — .33 + .66 sums to .99
// instead of the true 1.00 — and the error compounds across 15 stages.
// This recovers the exact frame the hundredths value was truncated from and
// returns its precise fraction, so downstream sums land on the real total.
function hundredthsToFraction(hh) {
  let frames = Math.round((hh * 30) / 100);
  let carrySeconds = 0;
  if (frames >= 30) {
    frames -= 30;
    carrySeconds = 1;
  }
  return { carrySeconds, fraction: frames / 30 };
}

// Parses a spreadsheet time cell into total seconds, or null if the cell
// isn't a usable time. The sheet mixes several delimiter styles for the
// same M:SS.hh shape (colon, period, apostrophe), tacks notes onto some
// entries ("1:45.13^ DSS"), and uses "xx" as a placeholder for an unknown
// hundredths digit ("2:27.xx") which we treat as not a real recorded time.
export function parseTime(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/x/i.test(s)) return null;

  let token = '';
  for (const ch of s) {
    if (/[0-9:.']/.test(ch)) token += ch;
    else break;
  }
  token = token.replace(/[:.']+$/, '');
  if (!token) return null;

  const pieces = token.split(/([:.'])/);
  const nums = [];
  const delims = [];
  for (let i = 0; i < pieces.length; i++) {
    if (i % 2 === 0) {
      if (!/^\d+$/.test(pieces[i])) return null;
      nums.push(Number(pieces[i]));
    } else {
      delims.push(pieces[i]);
    }
  }
  if (nums.length === 0) return null;

  let seconds;
  if (nums.length === 1) {
    // Bare number, no delimiter: treat as whole seconds.
    seconds = nums[0];
  } else if (nums.length === 2) {
    // "MM:SS" (whole seconds) vs "SS.hh" / "SS'hh" (fractional seconds)
    // depend on which delimiter was used.
    if (delims[0] === ':') {
      seconds = nums[0] * 60 + nums[1];
    } else {
      const { carrySeconds, fraction } = hundredthsToFraction(nums[1]);
      seconds = nums[0] + carrySeconds + fraction;
    }
  } else if (nums.length === 3) {
    const { carrySeconds, fraction } = hundredthsToFraction(nums[2]);
    seconds = nums[0] * 60 + nums[1] + carrySeconds + fraction;
  } else if (nums.length === 4) {
    const { carrySeconds, fraction } = hundredthsToFraction(nums[3]);
    seconds = nums[0] * 3600 + nums[1] * 60 + nums[2] + carrySeconds + fraction;
  } else {
    return null;
  }

  if (!isFinite(seconds) || seconds <= 0) return null;
  return seconds;
}

export function formatSeconds(totalSeconds) {
  // The sheet's own IGT convention truncates hundredths rather than
  // rounding them (that truncation is why .33/.66-style values exist at
  // all — see hundredthsToFraction above). Match that convention here so a
  // displayed total lines up with what the community expects, rather than
  // rounding .0667 up to .07. The tiny epsilon guards against a value like
  // an exact 1:40.00 landing on 99.999999... in floating point and getting
  // truncated down a whole hundredth.
  let s = Math.floor(Math.abs(totalSeconds) * 100 + 1e-9) / 100;
  const hours = Math.floor(s / 3600);
  s -= hours * 3600;
  const minutes = Math.floor(s / 60);
  s -= minutes * 60;
  const secStr = s.toFixed(2).padStart(5, '0');

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${secStr}`;
  }
  if (minutes > 0) {
    return `${minutes}:${secStr}`;
  }
  return s.toFixed(2);
}

// Finds the JP row and US row for one named route by matching the phrase
// against column A, rather than trusting fixed row numbers. Each route is
// entered once per game region, tagged "(JP)" / "(US)" in the label.
function findRouteRows(csvRows, phrase) {
  const needle = phrase.toLowerCase();
  let jp = null;
  let us = null;
  for (const row of csvRows) {
    const label = (row[0] || '').toLowerCase();
    if (!label.includes(needle)) continue;
    if (label.includes('(jp)')) jp = row;
    else if (label.includes('(us)')) us = row;
  }
  return { jp, us };
}

// JP and US run at a slightly different pace, so a raw JP time and a raw US
// time for the same route aren't directly comparable. Column D ("Ideal
// Run") gives the perfect-play time for each region on that route; the gap
// between them is the region's inherent offset. Resolves one route per
// stage.route entry, with its JP/US rows and that offset (idealJP -
// idealUS). Routes missing an ideal time on either side get null here and
// are patched up in computeLeaderboard using a sibling route's offset.
function resolveRoutes(csvRows, stage) {
  return stage.routes.map((phrase) => {
    const { jp, us } = findRouteRows(csvRows, phrase);
    const idealJP = jp ? parseTime(jp[IDEAL_RUN_COL]) : null;
    const idealUS = us ? parseTime(us[IDEAL_RUN_COL]) : null;
    const offset = idealJP !== null && idealUS !== null ? idealJP - idealUS : null;
    return { jp, us, offset };
  });
}

// Builds the sum-of-best leaderboard from the parsed CSV grid.
// Only players with a valid best time on all 15 stages are included.
// All stage times are normalized to JP pace: a US time is shifted by the
// route's JP/US offset before being compared or summed, so runs from either
// region are weighed fairly against each other.
export function computeLeaderboard(csvRows) {
  const header = csvRows[0] || [];
  const playerCols = [];
  for (let i = PLAYER_COL_START; i < header.length; i++) {
    const name = (header[i] || '').trim();
    if (name) playerCols.push({ name, index: i });
  }

  const stageTimesByPlayer = new Map(playerCols.map((pc) => [pc.name, {}]));

  for (const stage of STAGES) {
    const routes = resolveRoutes(csvRows, stage);
    const fallbackOffset = routes.find((r) => r.offset !== null)?.offset ?? 0;
    for (const r of routes) {
      if (r.offset === null) r.offset = fallbackOffset;
    }

    for (const pc of playerCols) {
      let best = null;
      for (const r of routes) {
        if (r.jp) {
          const t = parseTime(r.jp[pc.index]);
          if (t !== null && (best === null || t < best)) best = t;
        }
        if (r.us) {
          const t = parseTime(r.us[pc.index]);
          if (t !== null) {
            const adjusted = t + r.offset;
            if (best === null || adjusted < best) best = adjusted;
          }
        }
      }
      if (best !== null) stageTimesByPlayer.get(pc.name)[stage.code] = best;
    }
  }

  const codes = STAGES.map((s) => s.code);
  const leaderboard = [];
  for (const [name, stageTimes] of stageTimesByPlayer) {
    if (!codes.every((c) => stageTimes[c] !== undefined)) continue;
    const sum = codes.reduce((acc, c) => acc + stageTimes[c], 0);
    leaderboard.push({ name, sum, stageTimes });
  }
  leaderboard.sort((a, b) => a.sum - b.sum);

  return { leaderboard, playerCount: playerCols.length };
}
