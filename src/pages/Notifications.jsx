import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getNotifications, markAllNotificationsRead, getUserProfile } from '../lib/firestore';
import { posterUrl } from '../lib/tmdb';
import LoadingScreen from '../components/loading/Loading';

function timeAgo(seconds) {
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

function NotificationItem({ notification, profile }) {
  const { type, data } = notification;

  let icon, text, link;

  switch (type) {
    case 'watched_movie':
      icon = '👁';
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
    default:
      return null;
  }

  const content = (
    <div className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
      notification.read ? 'bg-gray-900' : 'bg-gray-900 border border-purple-500/20'
    }`}>
      {profile?.photoURL ? (
        <img src={profile.photoURL} alt="" className="w-9 h-9 rounded-full shrink-0 mt-0.5" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center text-sm font-bold shrink-0 mt-0.5">
          {profile?.displayName?.[0]}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-300 leading-snug">{text}</p>
        <p className="text-xs text-gray-600 mt-1">{timeAgo(notification.createdAt?.seconds)}</p>
      </div>
      {data.posterPath && (
        <img
          src={posterUrl(data.posterPath, 'w92')}
          alt=""
          className="w-8 h-12 rounded object-cover shrink-0"
        />
      )}
      <span className="text-lg shrink-0">{icon}</span>
    </div>
  );

  return link ? (
    <Link to={link} className="block hover:opacity-80 transition-opacity">
      {content}
    </Link>
  ) : content;
}

export default function Notifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadNotifications();
  }, [user]);

  async function loadNotifications() {
    setLoading(true);
    const notifs = await getNotifications(user.uid);
    setNotifications(notifs);

    // Load unique sender profiles
    const uniqueUids = [...new Set(notifs.map((n) => n.fromUid))];
    const profileMap = {};
    await Promise.all(
      uniqueUids.map(async (uid) => {
        const p = await getUserProfile(uid);
        if (p) profileMap[uid] = p;
      })
    );
    setProfiles(profileMap);

    // Mark all as read
    await markAllNotificationsRead(user.uid);

    setLoading(false);
  }

  if (loading) return <LoadingScreen />;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-white">Notifications</h1>

      {notifications.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center">
          <p className="text-gray-400">No notifications yet.</p>
          <p className="text-gray-600 text-sm mt-1">
            You'll see updates here when your friends watch movies, create lists, or finish a list.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              profile={profiles[n.fromUid]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
