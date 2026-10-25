import { useState } from 'react';

interface RejectModalProps {
  requestId: string;
  building: string;
  onConfirm: (reason: string) => Promise<void>;
  onCancel: () => void;
}

const QUICK_REASONS = [
  'Wrong waste type for this area',
  'Outside service area',
  'Unclear / incomplete details',
  'Duplicate request',
  'Slot already processed for the day',
];

/**
 * Inline modal for rejecting a pending request.
 * Requires a non-empty reason (min 3 chars).
 * Offers quick-pick reasons and a free-text field.
 */
export default function RejectModal({ requestId: _requestId, building, onConfirm, onCancel }: RejectModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError]   = useState('');
  const [busy, setBusy]     = useState(false);

  async function handleConfirm() {
    if (reason.trim().length < 3) {
      setError('Please provide a reason (at least 3 characters).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onConfirm(reason.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rejection failed.');
      setBusy(false);
    }
  }

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-lg w-full max-w-sm p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Reject Request</h3>
        <p className="text-xs text-gray-400 mb-4">
          <span className="font-medium text-gray-600">{building}</span> — the resident will see this reason.
        </p>

        {/* Quick picks */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {QUICK_REASONS.map(r => (
            <button key={r} type="button"
              onClick={() => setReason(r)}
              className={`text-xs px-2.5 py-1 rounded-full border transition
                ${reason === r
                  ? 'bg-red-50 border-red-300 text-red-600'
                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'}`}>
              {r}
            </button>
          ))}
        </div>

        {/* Free text */}
        <textarea
          value={reason}
          onChange={e => { setReason(e.target.value); setError(''); }}
          rows={3}
          placeholder="Or type a custom reason…"
          className={`w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none transition
            ${error ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50 focus:border-accent focus:bg-white'}`}
        />
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

        {/* Actions */}
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCancel} disabled={busy}
            className="flex-1 py-2 rounded-full border border-gray-200 text-sm text-gray-600 hover:border-gray-300 transition disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={handleConfirm} disabled={busy}
            className="flex-1 py-2 rounded-full bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition disabled:opacity-50">
            {busy ? 'Rejecting…' : 'Confirm Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}
