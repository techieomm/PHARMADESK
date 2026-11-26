import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Modal } from '@/components/common/Modal';
import { authService } from '@/services/api';
import { isSupabaseConfigured, getSupabaseProjectRef } from '@/lib/supabase';
import { IdCard, Mail, Lock, AlertCircle, ShieldCheck, Database, Eye, EyeOff } from 'lucide-react';
import { SupabaseSetupModal } from '@/components/layout/SupabaseSetupModal';
import { BrandLogo } from '@/components/common/BrandLogo';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { loginWithEmployeeId, loginWithEmail } = useAuth();

  const [loginMethod, setLoginMethod] = useState<'employeeId' | 'email'>('employeeId');
  const [employeeId, setEmployeeId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Forgot password modal
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [showDbModal, setShowDbModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [isResetLoading, setIsResetLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      let loggedProfile;
      if (loginMethod === 'employeeId') {
        const cleanInput = employeeId.trim();
        if (!cleanInput) throw new Error('Please enter your Employee ID');
        if (cleanInput.includes('@')) {
          throw new Error('That looks like an email. Use the Email Address tab.');
        }
        if (!password) throw new Error('Please enter your password');
        loggedProfile = await loginWithEmployeeId(employeeId, password);
      } else {
        if (!email.trim()) throw new Error('Please enter your email address');
        if (!password) throw new Error('Please enter your password');
        loggedProfile = await loginWithEmail(email, password);
      }

      if (loggedProfile?.role === 'prescription_employee') {
        navigate('/prescription-slips');
      } else if (loggedProfile?.role === 'billing_employee') {
        navigate('/pos');
      } else if (loggedProfile?.role === 'inventory_manager') {
        navigate('/inventory');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setError(err?.message || 'Login failed. Please check credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setIsResetLoading(true);
    setResetMsg(null);
    try {
      await authService.requestPasswordReset(resetEmail.trim());
      setResetMsg('If an account exists with this email, a reset link has been dispatched.');
    } catch (err: any) {
      setResetMsg(err?.message || 'Failed to request reset');
    } finally {
      setIsResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 selection:bg-brand-200">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-3">
          <BrandLogo size="lg" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-charcoal-900 font-sans">
          BAJRANG <span className="text-brand-500">PHARMACY</span>
        </h2>
        <p className="mt-1 text-xs text-charcoal-500 font-medium tracking-wide uppercase">
          Authorized Pharmacy Portal & Billing Login
        </p>
        {import.meta.env.DEV && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-cream-100 text-charcoal-600 border border-charcoal-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Connected to: <b>{getSupabaseProjectRef()}</b></span>
          </div>
        )}
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 sm:px-10 border border-charcoal-200 rounded-lg shadow-xs">
          {/* Login Mode Tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-cream-100 rounded-md mb-6 border border-charcoal-200">
            <button
              type="button"
              onClick={() => { setLoginMethod('employeeId'); setError(null); }}
              className={`flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded transition-colors ${
                loginMethod === 'employeeId'
                  ? 'bg-white text-charcoal-900 shadow-xs border border-charcoal-200'
                  : 'text-charcoal-600 hover:text-charcoal-900'
              }`}
            >
              <IdCard className="w-4 h-4 text-brand-500" />
              Employee ID
            </button>
            <button
              type="button"
              onClick={() => { setLoginMethod('email'); setError(null); }}
              className={`flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded transition-colors ${
                loginMethod === 'email'
                  ? 'bg-white text-charcoal-900 shadow-xs border border-charcoal-200'
                  : 'text-charcoal-600 hover:text-charcoal-900'
              }`}
            >
              <Mail className="w-4 h-4 text-brand-500" />
              Email Address
            </button>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-800 font-medium">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            {loginMethod === 'employeeId' ? (
              <Input
                label="Employee ID"
                type="text"
                placeholder="e.g. master-admin"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                leftIcon={<IdCard className="w-4 h-4" />}
                required
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            ) : (
              <Input
                label="Registered Work Email"
                type="email"
                placeholder="admin@bajrangpharmacy.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                leftIcon={<Mail className="w-4 h-4" />}
                required
                autoFocus
              />
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-charcoal-700 uppercase tracking-wider">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                leftIcon={<Lock className="w-4 h-4" />}
                rightIcon={
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-charcoal-400 hover:text-charcoal-700 focus:outline-none p-1"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
                required
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2"
              isLoading={isLoading}
            >
              Sign In to Terminal
            </Button>
          </form>

          {/* Setup / First-time hint (Rendered ONLY in Demo Mode) */}
          {import.meta.env.VITE_DEMO_MODE === 'true' && (
            <div className="mt-6 pt-5 border-t border-charcoal-100 text-xs text-charcoal-500 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-charcoal-700">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Demo Mode Credentials:</span>
                </div>
              </div>
              <p className="bg-cream-50 p-2 rounded border border-charcoal-200 font-mono text-[11px] text-charcoal-800">
                Employee ID: <b>EMP001</b> | Pass: <b>admin123</b>
              </p>
              <p className="text-[11px] text-charcoal-400">
                Local demo database active. In production mode, live Supabase credentials are used.
              </p>
            </div>
          )}

          {/* Database migrations link */}
          <div className="mt-4 pt-3 border-t border-charcoal-100 flex justify-end">
            <button
              type="button"
              onClick={() => setShowDbModal(true)}
              className="text-[11px] font-semibold text-charcoal-500 hover:text-brand-600 flex items-center gap-1 hover:underline"
            >
              <Database className="w-3 h-3" />
              <span>DB Migrations & Schema Check</span>
            </button>
          </div>
        </div>
      </div>

      {/* Supabase Setup Modal */}
      <SupabaseSetupModal
        isOpen={showDbModal}
        onClose={() => setShowDbModal(false)}
      />

      {/* Forgot Password Modal */}
      <Modal
        isOpen={showForgotModal}
        onClose={() => setShowForgotModal(false)}
        title="Reset Password"
        maxWidth="sm"
      >
        <form onSubmit={handlePasswordReset} className="space-y-4">
          <p className="text-xs text-charcoal-600">
            Enter your registered employee email. A password reset request will be generated.
          </p>
          <Input
            label="Email Address"
            type="email"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
            placeholder="you@bajrangpharmacy.in"
            required
            autoFocus
          />
          {resetMsg && (
            <p className="text-xs p-2 bg-cream-100 border border-charcoal-200 rounded text-charcoal-800 font-medium">
              {resetMsg}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setShowForgotModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isResetLoading}>
              Send Reset Link
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
