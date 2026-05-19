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

  const idx = window.history.state?.idx ?? 0;
  if (idx === 0) return null;

  return (
    <button
      onClick={() => navigate(-1)}
      className="text-sm text-gray-400 hover:text-white transition-colors display-block"
    >
      ← {label}
    </button>
  );
}
