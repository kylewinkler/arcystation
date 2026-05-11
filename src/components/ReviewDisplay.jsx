import { Link } from 'react-router-dom';
import StarRating from './StarRating';
import ReviewReactions from './ReviewReactions';
import { posterUrl } from '../lib/tmdb';

export default function ReviewDisplay({
  movie,
  reviewerProfile,
  currentUserUid,
  onEditClick,
  onReactionChange,
}) {
  const { tmdbId, title, year, posterPath, rating, note, reactions, uid: reviewerUid } = movie;
  const isOwnReview = currentUserUid === reviewerUid;
  const displayName = reviewerProfile?.displayName;
  const photoURL = reviewerProfile?.photoURL;
  const clickable = isOwnReview && !!onEditClick;

  const avatar = photoURL ? (
    <img src={photoURL} alt="" className="w-10 h-10 rounded-full" />
  ) : (
    <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-sm font-bold text-white">
      {(displayName || '?')[0]}
    </div>
  );
  const headerLabel = (
    <h3 className="text-white font-semibold text-base">
      {isOwnReview ? 'Your review' : <>{displayName || 'Their'}'s review</>}
    </h3>
  );

  const header = (
    <div className="flex items-center gap-3 pb-3 border-b border-gray-800 -mt-2">
      {isOwnReview || !reviewerUid ? (
        <>
          {avatar}
          {headerLabel}
        </>
      ) : (
        <Link
          to={`/user/${reviewerUid}`}
          className="flex items-center gap-3 group min-w-0 hover:text-purple-300 transition-colors"
        >
          {avatar}
          <h3 className="text-white font-semibold text-base group-hover:text-purple-300 transition-colors">
            {displayName || 'Their'}'s review
          </h3>
        </Link>
      )}
      {clickable && <span className="ml-auto text-xs text-gray-500">tap to edit</span>}
    </div>
  );

  const body = (
    <div className={`flex gap-4 items-start ${clickable ? 'group' : ''}`}>
      {posterPath ? (
        <img
          src={posterUrl(posterPath, 'w185')}
          alt={title}
          className="w-24 aspect-[2/3] rounded-lg object-cover shrink-0"
        />
      ) : (
        <div className="w-24 aspect-[2/3] rounded-lg bg-gray-800 shrink-0" />
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <h4 className="text-white font-medium break-words leading-tight group-hover:text-purple-300 transition-colors">{title}</h4>
          {year && <p className="text-xs text-gray-500 mt-0.5">{year}</p>}
        </div>
        {rating > 0 && <StarRating value={rating} size="sm" />}
        {note ? (
          <p className="text-gray-300 text-sm italic whitespace-pre-wrap">"{note}"</p>
        ) : (
          <p className="text-gray-500 text-sm">No written review.</p>
        )}
      </div>
    </div>
  );

  return (
    <>
      {clickable ? (
        <div
          onClick={onEditClick}
          className="cursor-pointer flex flex-col gap-4"
        >
          {header}
          {body}
        </div>
      ) : (
        <>
          {header}
          {body}
        </>
      )}

      {!isOwnReview && (
        <ReviewReactions
          reviewerUid={reviewerUid}
          tmdbId={tmdbId}
          reactions={reactions || {}}
          currentUserUid={currentUserUid}
          movieTitle={title}
          posterPath={posterPath}
          onReactionChange={onReactionChange}
        />
      )}
    </>
  );
}
