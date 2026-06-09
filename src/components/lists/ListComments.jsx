import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  subscribeToListComments,
  addListComment,
  deleteListComment,
  getUserProfile,
  notifyListCommentRecipients,
} from '../../lib/firestore';
import { timeAgo } from '../notifications/NotificationItem';

export default function ListComments({ listId, listTitle, user, isOwner }) {
  const [comments, setComments] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    const unsub = subscribeToListComments(listId, setComments);
    return () => unsub();
  }, [listId]);

  useEffect(() => {
    const missing = [...new Set(comments.map((c) => c.uid))].filter((uid) => !profiles[uid]);
    if (missing.length === 0) return;
    Promise.all(missing.map((uid) => getUserProfile(uid))).then((results) => {
      setProfiles((prev) => {
        const next = { ...prev };
        results.forEach((p, i) => { if (p) next[missing[i]] = p; });
        return next;
      });
    });
  }, [comments]);

  const handlePost = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    try {
      await addListComment(user.uid, listId, trimmed);
      setText('');
      notifyListCommentRecipients(user.uid, listId, listTitle, trimmed).catch((err) => {
        console.error('Failed to notify list members of comment:', err);
      });
    } catch (err) {
      console.error('Failed to post comment:', err);
    }
    setPosting(false);
  };

  const handleDelete = async (commentId) => {
    setDeletingId(commentId);
    try {
      await deleteListComment(commentId);
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
    setDeletingId(null);
  };

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-white">Comments</h2>
      {comments.length === 0 ? (
        <p className="text-sm text-gray-500">No comments yet. Start the conversation.</p>
      ) : (
        <div className="space-y-2">
          {comments.map((c) => {
            const profile = profiles[c.uid];
            const canDelete = c.uid === user.uid || isOwner;
            return (
              <div key={c.id} className="flex gap-3 bg-gray-900 border border-gray-800 rounded-lg p-3">
                {profile?.photoURL ? (
                  <img src={profile.photoURL} alt="" className="w-8 h-8 rounded-full shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold shrink-0">
                    {profile?.displayName?.[0] || '?'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    {profile ? (
                      <Link
                        to={`/user/${profile.uid}`}
                        className="font-medium text-white hover:text-purple-400 transition-colors"
                      >
                        {profile.displayName}
                      </Link>
                    ) : (
                      <span className="font-medium text-gray-500">…</span>
                    )}
                    <span className="text-gray-500">{timeAgo(c.createdAt?.seconds)}</span>
                  </div>
                  <p className="text-sm text-gray-200 mt-1 whitespace-pre-wrap break-words">{c.text}</p>
                </div>
                {canDelete && (
                  <button
                    onClick={() => handleDelete(c.id)}
                    disabled={deletingId === c.id}
                    className="text-xs text-gray-500 hover:text-red-400 transition-colors shrink-0 self-start"
                  >
                    {deletingId === c.id ? '…' : 'Delete'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <form onSubmit={handlePost} className="flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Leave a comment…"
          rows={2}
          maxLength={1000}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!text.trim() || posting}
            className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            {posting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </form>
    </div>
  );
}
