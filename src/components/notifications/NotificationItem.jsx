import { Link } from 'react-router-dom';
import { posterUrl } from '../../lib/tmdb';

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

export default function NotificationItem({ notification, profile, onFriendAction }) {
  const { type, data } = notification;

  let icon, text, link;

  switch (type) {
    case 'watched_movie':
      icon = null;
      text = (
        <>
          <span className="text-white font-medium">{profile?.displayName}</span>
          {' watched '}
          <span className="text-white font-medium">{data.movieTitle}</span>
          {data.listTitle && (
            <span className="text-gray-500"> on {data.listTitle}</span>
          )}
        </>
      );
      link = data.tmdbId ? `/movie/${data.tmdbId}` : null;
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
      text = (
        <>
          <span className="text-white font-medium">{profile?.displayName}</span>
          {' started the collection '}
          <span className="text-white font-medium">{data.listTitle}</span>
        </>
      );
      link = data.listId ? `/lists/${data.listId}` : null;
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
    default:
      return null;
  }

  const content = (
    <div className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
      notification.read ? 'bg-gray-900' : 'bg-gray-900 border border-purple-500/20'
    }`}>
      <Link to={`/user/${notification.fromUid}`} onClick={(e) => e.stopPropagation()} className="shrink-0">
        {profile?.photoURL ? (
          <img src={profile.photoURL} alt="" className="w-9 h-9 rounded-full mt-0.5" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center text-sm font-bold mt-0.5">
            {profile?.displayName?.[0]}
          </div>
        )}
      </Link>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-300 leading-snug">{text}</p>
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

  return link ? (
    <Link to={link} className="block hover:opacity-80 transition-opacity">
      {content}
    </Link>
  ) : content;
}
