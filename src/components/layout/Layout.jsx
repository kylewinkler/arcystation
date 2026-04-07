import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import FriendRequestBadge from '../friends/FriendRequestBadge';
import ArcyPop from '../../assets/images/arcy-poses/arcy-popcorn.png'

export default function Layout({ children }) {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <nav className="border-b border-gray-800 bg-gray-900">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-2 text-xl font-bold text-white hover:text-purple-400 transition-colors"
        >
          <img
          src={ArcyPop}
          alt="arcy logo popcorn"
          className="h-9 w-auto -translate-y-[1px]"
        />
          Arcy Station
        </Link>
          {user && (
            <div className="flex items-center gap-4">
              <Link to="/movies" className="text-sm text-gray-300 hover:text-white transition-colors">
                Movies
              </Link>
              <Link to="/friends" className="relative text-sm text-gray-300 hover:text-white transition-colors">
                Friends
                <FriendRequestBadge />
              </Link>
              <Link to={`/user/${user.uid}`} className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" className="w-7 h-7 rounded-full" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold">
                    {user.displayName?.[0] || '?'}
                  </div>
                )}
              </Link>
            </div>
          )}
        </div>
      </nav>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
