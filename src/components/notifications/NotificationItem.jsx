import { useState } from 'react';
import { Link } from 'react-router-dom';
import { posterUrl } from '../../lib/tmdb';
import StarRating from '../StarRating';
import ReviewReactions from '../ReviewReactions';

export function timeAgo(seconds) {
  if (!seconds) return '';
  const ms = Date.now() - seconds * 1000;
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

const CONSOLIDATABLE_TYPES = new Set(['watched_movie', 'joined_collection']);

export function groupActivity(notifications) {
  const groups = [];
  for (const n of notifications) {
    const last = groups[groups.length - 1];
    if (
      last &&
      CONSOLIDATABLE_TYPES.has(n.type) &&
      last.type === n.type &&
      last.fromUid === n.fromUid
    ) {
      last.items.push(n);
    } else {
      groups.push({ type: n.type, fromUid: n.fromUid, items: [n] });
    }
  }
  return groups;
}

function WatchedMovieEntry({ item, currentUserUid, reactions, onReactionChange }) {
  const { data, fromUid } = item;
  const inner = (
    <div className="flex gap-3">
      {data.posterPath ? (
        <img
          src={posterUrl(data.posterPath, 'w92')}
          alt=""
          className="w-10 h-14 rounded object-cover shrink-0"
        />
      ) : (
        <div className="w-10 h-14 rounded bg-gray-800 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-medium truncate">{data.movieTitle}</p>
        {data.rating && (
          <div className="mt-0.5">
            <StarRating value={data.rating} size="sm" />
          </div>
        )}
        {data.note && (
          <p className="text-xs text-gray-400 italic line-clamp-2 border-l-2 border-gray-700 pl-2 mt-1">
            "{data.note}"
          </p>
        )}
        <p className="text-xs text-gray-600 mt-1">{timeAgo(item.createdAt?.seconds)}</p>
        {data.tmdbId && currentUserUid && (
          <ReviewReactions
            reviewerUid={fromUid}
            tmdbId={String(data.tmdbId)}
            reactions={reactions || {}}
            currentUserUid={currentUserUid}
            movieTitle={data.movieTitle}
            posterPath={data.posterPath}
            onReactionChange={(newReactions) => onReactionChange?.(fromUid, String(data.tmdbId), newReactions)}
          />
        )}
      </div>
    </div>
  );
  return data.tmdbId ? (
    <Link to={`/movie/${data.tmdbId}`} className="block hover:opacity-80 transition-opacity">
      {inner}
    </Link>
  ) : inner;
}

export default function NotificationItem({ notification, profile, onFriendAction, extraCount = 0, items = null, currentUserUid, reactionsByReview = {}, onReactionChange }) {
  const { type, data } = notification;
  const reviewKey = data?.tmdbId ? `${notification.fromUid}__${data.tmdbId}` : null;
  const reactions = reviewKey ? reactionsByReview[reviewKey] : null;
  const isConsolidated = extraCount > 0;
  const [expanded, setExpanded] = useState(false);
  const expandable = isConsolidated && type === 'watched_movie' && items && items.length > 1;

  let icon, text, link;

  switch (type) {
    case 'watched_movie':
      icon = null;
      text = isConsolidated ? (
        <>
          <span className="text-white font-medium">{profile?.displayName}</span>
          {' watched '}
          <span className="text-white font-medium">{data.movieTitle}</span>
          <span className="text-gray-500"> and {extraCount} more</span>
        </>
      ) : (
        <>
          <span className="text-white font-medium">{profile?.displayName}</span>
          {' watched '}
          <span className="text-white font-medium">{data.movieTitle}</span>
          {data.listTitle && (
            <span className="text-gray-500"> on {data.listTitle}</span>
          )}
        </>
      );
      // Single → friend's profile; consolidated → expand inline (no link, handled below)
      link = isConsolidated ? null : `/user/${notification.fromUid}`;
      break;
    case 'created_list':
      icon = '📋';
      text = (
        <>
          <span className="text-white font-medium">{profile?.displayName}</span>
          {' created a new list: '}
          <span className="text-white font-medium">{data.listTitle}</span>
        </>
      );
      link = data.listId ? `/lists/${data.listId}` : null;
      break;
    case 'finished_list':
      icon = '🎉';
      text = (
        <>
          <span className="text-white font-medium">{profile?.displayName}</span>
          {' finished '}
          <span className="text-white font-medium">{data.listTitle}</span>
        </>
      );
      link = data.listId ? `/lists/${data.listId}` : null;
      break;
    case 'joined_collection':
      icon = '🎬';
      text = isConsolidated ? (
        <>
          <span className="text-white font-medium">{profile?.displayName}</span>
          {' started the collection '}
          <span className="text-white font-medium">{data.listTitle}</span>
          <span className="text-gray-500"> and {extraCount} more</span>
        </>
      ) : (
        <>
          <span className="text-white font-medium">{profile?.displayName}</span>
          {' started the collection '}
          <span className="text-white font-medium">{data.listTitle}</span>
        </>
      );
      link = isConsolidated
        ? `/user/${notification.fromUid}`
        : (data.listId ? `/lists/${data.listId}` : null);
      break;
    case 'list_invite':
      icon = '✉️';
      text = (
        <>
          <span className="text-white font-medium">{profile?.displayName}</span>
          {' invited you to their list '}
          <span className="text-white font-medium">{data.listTitle}</span>
        </>
      );
      link = data.listId ? `/lists/${data.listId}` : null;
      break;
    case 'collection_invite':
      icon = '🎬';
      text = (
        <>
          <span className="text-white font-medium">{profile?.displayName}</span>
          {' wants you to join the collection '}
          <span className="text-white font-medium">{data.listTitle}</span>
        </>
      );
      link = data.listId ? `/lists/${data.listId}` : null;
      break;
    case 'joined_list':
      icon = '➕';
      text = (
        <>
          <span className="text-white font-medium">{profile?.displayName}</span>
          {' joined your list '}
          <span className="text-white font-medium">{data.listTitle}</span>
        </>
      );
      link = data.listId ? `/lists/${data.listId}` : null;
      break;
    case 'friend_request':
      icon = '👋';
      text = (
        <>
          <span className="text-white font-medium">{profile?.displayName}</span>
          {' sent you a friend request'}
        </>
      );
      link = null;
      break;
    case 'friend_accepted':
      icon = '🤝';
      text = (
        <>
          <span className="text-white font-medium">{profile?.displayName}</span>
          {' accepted your friend request'}
        </>
      );
      link = notification.fromUid ? `/user/${notification.fromUid}` : null;
      break;
    case 'review_reaction':
      icon = data.reaction === 'up' ? '👍' : '👎';
      text = (
        <>
          <span className="text-white font-medium">{profile?.displayName}</span>
          {data.reaction === 'up' ? ' gave a thumbs up to your review of ' : ' gave a thumbs down to your review of '}
          <span className="text-white font-medium">{data.movieTitle}</span>
        </>
      );
      link = data.tmdbId ? `/movie/${data.tmdbId}` : null;
      break;
    default:
      return null;
  }

  const header = (
    <div className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
      notification.read ? 'bg-gray-900' : 'bg-gray-900 border border-purple-500/20'
    } ${expandable ? 'hover:bg-gray-800' : ''}`}>
      <Link to={`/user/${notification.fromUid}`} onClick={(e) => e.stopPropagation()} className="shrink-0">
        {profile?.photoURL ? (
          <img src={profile.photoURL} alt="" className="w-9 h-9 rounded-full mt-0.5" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center text-sm font-bold mt-0.5">
            {profile?.displayName?.[0]}
          </div>
        )}
      </Link>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm text-gray-300 leading-snug">{text}</p>
        {type === 'watched_movie' && (data.rating || (!isConsolidated && data.note)) && (
          <div className="mt-1.5 space-y-1">
            {data.rating && <StarRating value={data.rating} size="sm" />}
            {!isConsolidated && data.note && (
              <p className="text-xs text-gray-400 italic line-clamp-2 border-l-2 border-gray-700 pl-2">
                "{data.note}"
              </p>
            )}
          </div>
        )}
        {type === 'watched_movie' && !isConsolidated && data.tmdbId && currentUserUid && (
          <ReviewReactions
            reviewerUid={notification.fromUid}
            tmdbId={String(data.tmdbId)}
            reactions={reactions || {}}
            currentUserUid={currentUserUid}
            movieTitle={data.movieTitle}
            posterPath={data.posterPath}
            onReactionChange={(newReactions) => onReactionChange?.(notification.fromUid, String(data.tmdbId), newReactions)}
          />
        )}
        <p className="text-xs text-gray-600 mt-1">{timeAgo(notification.createdAt?.seconds)}</p>
        {type === 'friend_request' && onFriendAction && (
          <div className="flex gap-2 mt-2">
            <button
              onClick={(e) => { e.preventDefault(); onFriendAction(notification, 'accepted'); }}
              className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded-lg text-xs font-medium transition-colors"
            >
              Accept
            </button>
            <button
              onClick={(e) => { e.preventDefault(); onFriendAction(notification, 'declined'); }}
              className="text-gray-400 hover:text-red-400 border border-gray-700 px-3 py-1 rounded-lg text-xs transition-colors"
            >
              Decline
            </button>
          </div>
        )}
      </div>
      {data.posterPath && (
        <img
          src={posterUrl(data.posterPath, 'w92')}
          alt=""
          className="w-8 h-12 rounded object-cover shrink-0"
        />
      )}
      {icon && <span className="text-lg shrink-0">{icon}</span>}
    </div>
  );

  if (expandable) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="block w-full text-left"
        >
          {header}
        </button>
        {expanded && (
          <div className="border-t border-gray-800 p-3 space-y-3">
            {items.map((it) => {
              const k = it.data?.tmdbId ? `${it.fromUid}__${it.data.tmdbId}` : null;
              return (
                <WatchedMovieEntry
                  key={it.id}
                  item={it}
                  currentUserUid={currentUserUid}
                  reactions={k ? reactionsByReview[k] : null}
                  onReactionChange={onReactionChange}
                />
              );
            })}
            <Link
              to={`/user/${notification.fromUid}`}
              className="block text-center text-xs text-purple-400 hover:text-purple-300 pt-2 border-t border-gray-800"
            >
              Visit {profile?.displayName || 'profile'} →
            </Link>
          </div>
        )}
      </div>
    );
  }

  return link ? (
    <Link to={link} className="block hover:opacity-80 transition-opacity">
      {header}
    </Link>
  ) : header;
}
