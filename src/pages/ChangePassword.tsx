import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, getHomeRouteForUser } from '@/context/AuthContext';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { supabase } from '@/lib/supabase';
import { Lock, ShieldAlert, CheckCircle2, AlertCircle, LogOut } from 'lucide-react';
import { BrandLogo } from '@/components/common/BrandLogo';

export const ChangePassword: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout, refreshUser } = useAuth();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const FORBIDDEN_PASSWORDS = ['master-admin', 'admin123', 'password'];

  const validatePassword = (pass: string, confirm: string): string | null => {
    if (pass.length < 10) {
      return 'Password must be at least 10 characters long';
    }
    const lowerPass = pass.toLowerCase();
    if (user?.employee_id && lowerPass === user.employee_id.toLowerCase()) {
      return 'Password cannot be equal to your Employee ID';
    }
    if (user?.email && lowerPass === user.email.toLowerCase()) {
      return 'Password cannot be equal to your Email address';
    }
    if (FORBIDDEN_PASSWORDS.includes(lowerPass)) {
      return 'Please choose a stronger password. Commonly used passwords are not permitted.';
    }
    if (pass !== confirm) {
      return 'New password and confirmation password do not match';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationErr = validatePassword(newPassword, confirmPassword);
    if (validationErr) {
      setError(validationErr);
      return;
    }

    setIsLoading(true);
    try {
      // 1. Update password in Supabase Auth
      const { error: authErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (authErr) {
        throw new Error(authErr.message || 'Failed to update authentication credentials');
      }

      // 2. Call SECURITY DEFINER RPC to clear must_change_password flag from caller's profile
      const { error: rpcErr } = await supabase.rpc('complete_password_change');
      if (rpcErr) {
        console.warn('RPC complete_password_change notice:', rpcErr);
      }

      // 3. Refresh user state in AuthContext so must_change_password is cleared
      await refreshUser();

      // 4. Redirect to role-specific dashboard
      navigate(getHomeRouteForUser(user), { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Password update failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const hasMinLength = newPassword.length >= 10;
  const isNotForbidden = newPassword && !FORBIDDEN_PASSWORDS.includes(newPassword.toLowerCase());
  const doesNotMatchIdentifier =
    newPassword &&
    (!user?.employee_id || newPassword.toLowerCase() !== user.employee_id.toLowerCase()) &&
    (!user?.email || newPassword.toLowerCase() !== user.email.toLowerCase());
  const passwordsMatch = newPassword && newPassword === confirmPassword;

  return (
    <div className="min-h-screen bg-cream-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 selection:bg-brand-200">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <BrandLogo size="lg" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-charcoal-900 font-sans">
            Set Your New Password
          </h2>
          <p className="mt-1 text-xs text-charcoal-500 font-medium">
            First-time login credential setup for <b>{user?.full_name || 'Staff Member'}</b> ({user?.employee_id})
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white py-8 px-6 sm:px-10 border border-charcoal-200 rounded-lg shadow-xs space-y-6">
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3 text-xs text-amber-900">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-950">Password Change Required</p>
              <p className="mt-0.5 text-amber-800 leading-relaxed">
                Your account was initialized with a temporary password. Before accessing the pharmacy terminal, you must establish a personal, secure password.
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-800 font-medium">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="New Password"
              type="password"
              placeholder="Enter at least 10 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              leftIcon={<Lock className="w-4 h-4" />}
              required
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />

            <Input
              label="Confirm New Password"
              type="password"
              placeholder="Re-enter your new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              leftIcon={<Lock className="w-4 h-4" />}
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />

            {/* Checklist */}
            <div className="p-3 bg-cream-50 border border-charcoal-200 rounded text-xs space-y-1.5 text-charcoal-600">
              <p className="font-semibold text-charcoal-700 text-[11px] uppercase tracking-wider">
                Security Requirements:
              </p>
              <div className="flex items-center gap-2 text-[11px]">
                <CheckCircle2 className={`w-3.5 h-3.5 ${hasMinLength ? 'text-emerald-600' : 'text-charcoal-300'}`} />
                <span className={hasMinLength ? 'text-charcoal-900 font-medium' : ''}>At least 10 characters long</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <CheckCircle2 className={`w-3.5 h-3.5 ${doesNotMatchIdentifier ? 'text-emerald-600' : 'text-charcoal-300'}`} />
                <span className={doesNotMatchIdentifier ? 'text-charcoal-900 font-medium' : ''}>Cannot equal your Employee ID or Email</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <CheckCircle2 className={`w-3.5 h-3.5 ${isNotForbidden ? 'text-emerald-600' : 'text-charcoal-300'}`} />
                <span className={isNotForbidden ? 'text-charcoal-900 font-medium' : ''}>Cannot be a default or common password</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <CheckCircle2 className={`w-3.5 h-3.5 ${passwordsMatch ? 'text-emerald-600' : 'text-charcoal-300'}`} />
                <span className={passwordsMatch ? 'text-charcoal-900 font-medium' : ''}>Passwords must match</span>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2"
              isLoading={isLoading}
            >
              Update Password & Continue to Terminal
            </Button>
          </form>

          <div className="pt-3 border-t border-charcoal-100 flex items-center justify-between text-xs text-charcoal-500">
            <span>Wrong account?</span>
            <button
              type="button"
              onClick={() => logout()}
              className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700 hover:underline"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
