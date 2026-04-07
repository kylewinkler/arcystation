import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';

export default function FriendRequestBadge() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'friendships'),
      where('status', '==', 'pending'),
      where('uid2', '==', user.uid)
    );
    return onSnapshot(q, (snap) => {
      const pending = snap.docs.filter(
        (d) => d.data().requestedBy !== user.uid
      );
      setCount(pending.length);
    });
  }, [user]);

  if (count === 0) return null;

  return (
    <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
      {count}
    </span>
  );
}
