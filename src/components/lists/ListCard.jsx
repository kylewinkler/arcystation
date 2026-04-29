import { Link } from 'react-router-dom';
import { posterUrl } from '../../lib/tmdb';
import ProgressBar from './ProgressBar';
import ArcyPop from '../../assets/images/arcy-poses/arcy-read-transmission.png';

export default function ListCard({
  listId,
  title,
  total = 0,
  watched,
  creatorName,
  isOwner,
  isPrebuilt,
  to,
  pinned,
  onTogglePin,
  featuredPoster,
}) {
  const href = to || `/lists/${listId}`;

  return (
    <Link
      to={href}
      className={`flex bg-gray-900 border rounded-lg overflow-hidden hover:border-purple-500 transition-colors ${
        pinned ? 'border-purple-500/40' : 'border-gray-800'
      }`}
    >
      {featuredPoster && (
        <img
          src={posterUrl(featuredPoster, 'w92')}
          alt=""
          className="w-14 h-full object-cover shrink-0"
        />
      )}
      <div className="flex-1 min-w-0 p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div>
            <h3 className="text-white font-medium line-clamp-2">{title}</h3>
            {total > 0 && <p className="text-xs text-gray-500 mt-0.5">{total} {total === 1 ? 'movie' : 'movies'}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isPrebuilt && <img src={ArcyPop} alt="" className="w-4 h-4" />}
            {!isPrebuilt && isOwner && <span className="text-xs text-purple-400">yours</span>}
            {!isPrebuilt && !isOwner && creatorName && (
              <span className="text-xs text-gray-500">by {creatorName}</span>
            )}
            {onTogglePin && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePin(listId); }}
                className={`shrink-0 transition-colors ${pinned ? 'text-purple-400 hover:text-purple-300' : 'text-gray-600 hover:text-gray-400'}`}
                title={pinned ? 'Unpin list' : 'Pin list'}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
                  <path d="M12 2L9.5 8.5L3 10l5 4.5L6.5 21L12 17.5L17.5 21L16 14.5L21 10l-6.5-1.5L12 2z" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {watched != null && <ProgressBar watched={watched} total={total} />}
      </div>
    </Link>
  );
}
