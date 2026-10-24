// Merge a new provider reading with the previous one. If an update fails but the
// provider had a good reading before, keep the last windows/note and mark it stale so
// the card does not go blank on a transient network error.
function mergeReading(prev, next) {
  if (!next) return next;
  if (!next.ok) {
    if (prev && prev.ok) {
      const merged = {
        ...next,
        windows: prev.windows,
        stale: true,
        lastSuccessAt: prev.lastSuccessAt || prev.fetchedAt,
      };
      if (merged.plan == null && prev.plan != null) merged.plan = prev.plan;
      if (merged.note == null && prev.note != null) merged.note = prev.note;
      if (merged.noteParams == null && prev.noteParams != null) merged.noteParams = prev.noteParams;
      if (merged.noteText == null && prev.noteText != null) merged.noteText = prev.noteText;
      return merged;
    }
    return next;
  }
  return { ...next, lastSuccessAt: next.fetchedAt };
}

module.exports = { mergeReading };
