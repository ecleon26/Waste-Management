import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/supabase';

interface LoginProps {
  onProfileLoaded: (profile: Profile) => void;
}

type Mode = 'login' | 'signup';

interface FormErrors {
  email?: string;
  password?: string;
  general?: string;
}

/**
 * Combined login + signup page.
 * After auth, fetches the profile row (which carries the role)
 * and calls onProfileLoaded so App.tsx can route accordingly.
 */
export default function Login({ onProfileLoaded }: LoginProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [signupDone, setSignupDone] = useState(false);

  function validate(): boolean {
    const e: FormErrors = {};
    if (!email.trim()) e.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email.';
    if (!password) e.password = 'Password is required.';
    else if (password.length < 6) e.password = 'Password must be at least 6 characters.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setErrors({});

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) {
        setErrors({ general: error.message });
      } else {
        // Show "check email" message; profile is auto-created by DB trigger
        setSignupDone(true);
      }
      return;
    }

    // Login
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setErrors({ general: error.message });
      return;
    }

    // Fetch the profile row (has role)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    setLoading(false);

    if (profileError || !profile) {
      setErrors({ general: 'Profile not found. Please contact support.' });
      return;
    }

    onProfileLoaded(profile);
  }

  if (signupDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] px-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-sm w-full text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Check your email</h2>
          <p className="text-sm text-gray-500">
            We sent a confirmation link to <strong>{email}</strong>. After confirming,
            come back and sign in.
          </p>
          <button
            onClick={() => { setSignupDone(false); setMode('login'); }}
            className="mt-6 w-full py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white text-sm font-medium transition"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] px-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-sm w-full">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">
            🗑️ Waste Collection Planner
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            SDG 11 – Sustainable Cities &amp; Communities
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-xl overflow-hidden border border-gray-200 mb-6">
          {(['login', 'signup'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setErrors({}); }}
              className={`flex-1 py-2 text-sm font-medium transition ${
                mode === m
                  ? 'bg-accent text-white'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {m === 'login' ? 'Sign in' : 'Sign up'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={`w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition bg-gray-50
                ${errors.email ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-accent focus:bg-white'}`}
            />
            {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••"
              className={`w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition bg-gray-50
                ${errors.password ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-accent focus:bg-white'}`}
            />
            {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}
          </div>

          {/* General error */}
          {errors.general && (
            <p className="text-xs text-red-500 text-center">{errors.general}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white text-sm font-medium transition disabled:opacity-50"
          >
            {loading
              ? 'Please wait…'
              : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
