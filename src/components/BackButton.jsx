import { Link, useNavigate } from 'react-router-dom';

export default function BackButton({ to, label = 'Back' }) {
  const navigate = useNavigate();

  if (to) {
    return (
      <Link to={to} className="text-sm text-gray-400 hover:text-white transition-colors block">
        ← {label}
      </Link>
    );
  }

  return (
    <button
      onClick={() => navigate(-1)}
      className="text-sm text-gray-400 hover:text-white transition-colors display-block"
    >
      ← {label}
    </button>
  );
}
