import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getNotifications, markAllNotificationsRead, getUserProfile, acceptFriendRequest, removeFriend, deleteNotification } from '../lib/firestore';
import LoadingScreen from '../components/loading/Loading';
import NotificationItem, { groupActivity } from '../components/notifications/NotificationItem';

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

    const uniqueUids = [...new Set(notifs.map((n) => n.fromUid))];
    const profileMap = {};
    await Promise.all(
      uniqueUids.map(async (uid) => {
        const p = await getUserProfile(uid);
        if (p) profileMap[uid] = p;
      })
    );
    setProfiles(profileMap);

    await markAllNotificationsRead(user.uid);

    setLoading(false);
  }

  const handleFriendAction = async (notification, action) => {
    if (action === 'accepted') {
      await acceptFriendRequest(notification.fromUid, user.uid);
    } else {
      await removeFriend(notification.fromUid, user.uid);
      await deleteNotification(notification.id);
    }
    setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
  };

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
          {groupActivity(notifications).map((g) => (
            <NotificationItem
              key={g.items[0].id}
              notification={g.items[0]}
              profile={profiles[g.fromUid]}
              onFriendAction={handleFriendAction}
              extraCount={g.items.length - 1}
              items={g.items}
            />
          ))}
        </div>
      )}
    </div>
  );
}
