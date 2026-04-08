import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Arcy from '../assets/images/arcy-scenes/empty-archives.png';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = async () => {
    try {
      await login();
      navigate('/');
    } catch (err) {
      console.error('Login failed:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="max-w-6xl w-full grid md:grid-cols-2 gap-12 items-center">

        {/* LEFT — IMAGE */}
        <div className="flex justify-center">
          <img
            src={Arcy}
            alt=""
            className="max-h-[500px] w-auto object-contain opacity-90"
          />
        </div>

        {/* RIGHT — TEXT + LOGIN */}
        <div className="text-center md:text-left">
          <h1 className="text-4xl font-bold text-white mb-4">
            Arcy Station
          </h1>

          <div className="text-gray-400 space-y-4 mb-8 leading-relaxed max-w-md">
            <p>Arcy, a celestial bear, tends the universe's movie archive.</p>

            <p>
              Every film ever made rests within the station.
              <br/>
              But the projector no longer works.
            </p>

            <p>So Arcy listens to ours transmissions.</p>

            <p>
              Signals arrive from far away—records of films as they were seen.
            </p>

            <p>
              He reads each one carefully. And preserves it.
            </p>
          </div>

          <button
            onClick={handleLogin}
            className="inline-flex items-center gap-3 bg-white text-gray-900 px-6 py-3 rounded-lg font-medium hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}