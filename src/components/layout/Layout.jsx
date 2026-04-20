import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import NotificationBadge from '../notifications/NotificationBadge';
import ArcyPop from '../../assets/images/arcy-poses/arcy-popcorn.png';
import UserSearchDropdown from './UserSearchDropdown';

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
              <Link to="/movies" className="text-gray-300 hover:text-white transition-colors" aria-label="Movies">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                </svg>
              </Link>
              <Link to="/lists" className="text-gray-300 hover:text-white transition-colors" aria-label="Lists">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </Link>
              <UserSearchDropdown />
              <Link to="/notifications" className="relative text-gray-300 hover:text-white transition-colors" aria-label="Notifications">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <NotificationBadge />
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
