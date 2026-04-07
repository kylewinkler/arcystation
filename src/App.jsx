import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/layout/Layout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import Login from './pages/Login';
import Home from './pages/Home';
import CreateList from './pages/CreateList';
import ListDetail from './pages/ListDetail';
import EditList from './pages/EditList';
import ProgressRedirect from './pages/ProgressRedirect';
import UserProfile from './pages/UserProfile';
import Friends from './pages/Friends';
import PublicShare from './pages/PublicShare';
import Admin from './pages/Admin';
import Movies from './pages/Movies';
import MovieDetail from './pages/MovieDetail';
import WatchedByYear from './pages/WatchedByYear';
import ConstructionModal from './components/modal/ConstructionModal';

export default function App() {
  return (
    <BrowserRouter>
      <ConstructionModal />
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/s/:slug" element={<PublicShare />} />
          <Route
            path="*"
            element={
              <ProtectedRoute>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/lists/new" element={<CreateList />} />
                    <Route path="/lists/:id" element={<ListDetail />} />
                    <Route path="/lists/:id/edit" element={<EditList />} />
                    <Route path="/progress/:uid/:listId" element={<ProgressRedirect />} />
                    <Route path="/user/:uid" element={<UserProfile />} />
                    <Route path="/friends" element={<Friends />} />
                    <Route path="/movies" element={<Movies />} />
                    <Route path="/movie/:tmdbId" element={<MovieDetail />} />
                    <Route path="/watched/:uid/:year" element={<WatchedByYear />} />
                    <Route path="/admin" element={<Admin />} />
                  </Routes>
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
