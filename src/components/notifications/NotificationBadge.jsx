import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { subscribeToUnreadNotificationCount } from '../../lib/firestore';

export default function NotificationBadge() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    return subscribeToUnreadNotificationCount(user.uid, setCount);
  }, [user]);

  if (count === 0) return null;

  return (
    <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
      {count > 9 ? '9+' : count}
    </span>
  );
}
