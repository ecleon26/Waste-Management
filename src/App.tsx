import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import type { Profile } from './lib/supabase';
import Login from './pages/Login';
import UserDashboard from './pages/UserDashboard';
import AdminDashboard from './pages/AdminDashboard';

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active session on first load
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for sign-in / sign-out events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          fetchProfile(session.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    setProfile(data ?? null);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
        <p className="text-gray-500 text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public login/signup page */}
        <Route
          path="/"
          element={
            profile
              ? <Navigate to={profile.role === 'admin' ? '/admin' : '/user'} replace />
              : <Login onProfileLoaded={setProfile} />
          }
        />

        {/* User module – only 'user' role allowed */}
        <Route
          path="/user"
          element={
            profile?.role === 'user'
              ? <UserDashboard profile={profile} onSignOut={() => setProfile(null)} />
              : <Navigate to="/" replace />
          }
        />

        {/* Admin module – only 'admin' role allowed */}
        <Route
          path="/admin"
          element={
            profile?.role === 'admin'
              ? <AdminDashboard profile={profile} onSignOut={() => setProfile(null)} />
              : <Navigate to="/" replace />
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
