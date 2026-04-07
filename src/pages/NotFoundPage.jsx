import { Link } from 'react-router-dom';
import NotFound from '../components/not-found/NotFound';

export default function NotFoundPage() {
  return (
    <NotFound
      scene="lost"
      title="Arcy has wandered off the path."
      subtitle="He is not worried. He has time."
    >
      <Link
        to="/"
        className="inline-block text-sm text-purple-400 hover:text-purple-300 border border-gray-700 hover:border-purple-500 px-4 py-2 rounded-lg transition-colors"
      >
        Back to the station
      </Link>
    </NotFound>
  );
}
