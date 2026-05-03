import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/layout/Layout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import Login from './pages/Login';
import Home from './pages/Home';
import CreateList from './pages/CreateList';
import ListDetail from './pages/ListDetail';
import EditList from './pages/EditList';
import ProgressRedirect from './pages/ProgressRedirect';
import UserProfile from './pages/UserProfile';
import PublicShare from './pages/PublicShare';
import Admin from './pages/Admin';
import Movies from './pages/Movies';
import MovieDetail from './pages/MovieDetail';
import WatchedByYear from './pages/WatchedByYear';
import Lists from './pages/Lists';
import Friends from './pages/Friends';
import NotFoundPage from './pages/NotFoundPage';
import ConstructionModal from './components/modal/ConstructionModal';

export default function App() {
  return (
    <BrowserRouter>
      <ConstructionModal />
      <AuthProvider>
        <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/s/:slug" element={<PublicShare />} />
          <Route
            path="*"
            element={
              <Layout>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/movies" element={<Movies />} />
                  <Route path="/movie/:tmdbId" element={<MovieDetail />} />
                  <Route path="/user/:uid" element={<UserProfile />} />
                  <Route path="/watched/:uid/:year?" element={<WatchedByYear />} />
                  <Route path="/lists" element={<ProtectedRoute><Lists /></ProtectedRoute>} />
                  <Route path="/lists/new" element={<ProtectedRoute><CreateList /></ProtectedRoute>} />
                  <Route path="/lists/:id" element={<ProtectedRoute><ListDetail /></ProtectedRoute>} />
                  <Route path="/lists/:id/edit" element={<ProtectedRoute><EditList /></ProtectedRoute>} />
                  <Route path="/progress/:uid/:listId" element={<ProtectedRoute><ProgressRedirect /></ProtectedRoute>} />
                  <Route path="/friends" element={<ProtectedRoute><Friends /></ProtectedRoute>} />
                  <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Layout>
            }
          />
        </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
