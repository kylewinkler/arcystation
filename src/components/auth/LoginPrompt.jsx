import { useState } from 'react';
import BaseModal from '../modal/Modal';
import { useAuth } from '../../context/AuthContext';

export default function LoginPrompt({ isOpen, onClose, message = 'Sign in to continue.' }) {
  const { login } = useAuth();
  const [busy, setBusy] = useState(false);

  async function handleSignIn() {
    setBusy(true);
    try {
      await login();
      onClose?.();
    } catch (err) {
      console.error('Sign-in failed:', err);
      setBusy(false);
    }
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="Sign in" message={message}>
      <div className="flex flex-col gap-2">
        <button
          onClick={handleSignIn}
          disabled={busy}
          className="bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-2 transition-colors"
        >
          {busy ? 'Signing in…' : 'Continue with Google'}
        </button>
        <button
          onClick={onClose}
          className="text-sm text-gray-400 hover:text-white py-1"
        >
          Cancel
        </button>
      </div>
    </BaseModal>
  );
}
