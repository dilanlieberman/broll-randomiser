'use strict';

// Catalog helpers — resume/dedup and stable per-tag clip ids. Pure functions.

// Resume logic: a source file is already ingested if any catalog record points
// at it. Re-running ingest skips these, so adding footage only processes new files.
function isAlreadyIngested(catalog, srcFile) {
  return catalog.some((rec) => rec.src_file === srcFile);
}

// Build the next id for a tag: `<tag>-NNNN`, zero-padded to 4 digits, counted
// per-tag (so each tag has its own 0001.. sequence) from the ids already used.
function makeClipId(tag, usedIds) {
  const prefix = `${tag}-`;
  let max = 0;
  for (const id of usedIds) {
    if (!id.startsWith(prefix)) continue;
    const n = parseInt(id.slice(prefix.length), 10);
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

module.exports = { isAlreadyIngested, makeClipId };
