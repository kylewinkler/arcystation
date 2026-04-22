import { setReviewReaction } from '../lib/firestore';

export default function ReviewReactions({
  reviewerUid,
  tmdbId,
  reactions = {},
  currentUserUid,
  movieTitle,
  posterPath,
  onReactionChange,
}) {
  const upCount = Object.values(reactions).filter((r) => r === 'up').length;
  const downCount = Object.values(reactions).filter((r) => r === 'down').length;

  if (!currentUserUid || currentUserUid === reviewerUid) {
    if (upCount === 0 && downCount === 0) return null;
    return (
      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
        {upCount > 0 && <span>👍 {upCount}</span>}
        {downCount > 0 && <span>👎 {downCount}</span>}
      </div>
    );
  }

  const myReaction = reactions[currentUserUid];

  async function react(type) {
    const next = myReaction === type ? null : type;
    const optimistic = { ...reactions };
    if (next === null) delete optimistic[currentUserUid];
    else optimistic[currentUserUid] = next;
    onReactionChange?.(optimistic);
    try {
      await setReviewReaction(reviewerUid, tmdbId, currentUserUid, next, { movieTitle, posterPath });
    } catch {
      onReactionChange?.(reactions);
    }
  }

  const btnBase = 'flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors';
  const active = 'bg-purple-600/20 border-purple-500/50 text-purple-300';
  const inactive = 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-600';

  return (
    <div className="flex items-center gap-2 mt-3">
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); react('up'); }}
        className={`${btnBase} ${myReaction === 'up' ? active : inactive}`}
        aria-pressed={myReaction === 'up'}
      >
        <span>👍</span>
        {upCount > 0 && <span>{upCount}</span>}
      </button>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); react('down'); }}
        className={`${btnBase} ${myReaction === 'down' ? active : inactive}`}
        aria-pressed={myReaction === 'down'}
      >
        <span>👎</span>
        {downCount > 0 && <span>{downCount}</span>}
      </button>
    </div>
  );
}
