import type { Profile } from '../lib/supabase';
import { supabase } from '../lib/supabase';

interface NavbarProps {
  profile: Profile;
  onSignOut: () => void;
}

export default function Navbar({ profile, onSignOut }: NavbarProps) {
  async function handleSignOut() {
    await supabase.auth.signOut();
    onSignOut();
  }

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* App name */}
        <div>
          <h1 className="text-base font-semibold text-gray-900 leading-tight">
            Waste Collection Planner
          </h1>
          <p className="text-xs text-gray-400">
            {profile.role === 'admin' ? 'Admin Console' : 'Resident Portal'} · {profile.email}
          </p>
        </div>

        {/* Sign-out button */}
        <button
          onClick={handleSignOut}
          className="text-sm text-gray-500 hover:text-gray-900 transition-colors px-4 py-1.5 rounded-full border border-gray-200 hover:border-gray-300"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
