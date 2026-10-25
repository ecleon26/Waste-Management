import { useState } from 'react';
import { supabase, TIME_SLOTS, SLOT_LABELS, MAX_PER_SLOT } from '../lib/supabase';
import type { TimeSlot } from '../lib/supabase';

interface RescheduleModalProps {
  requestId: string;
  building: string;
  currentDate: string | null;
  currentSlot: TimeSlot | null;
  onDone: () => void;
  onCancel: () => void;
}

const TODAY = new Date().toISOString().split('T')[0];
const MAX_DATE = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

/**
 * Modal for admin to reschedule a pending request to a new date + slot.
 * Checks slot capacity before confirming.
 */
export default function RescheduleModal({
  requestId, building, currentDate, currentSlot, onDone, onCancel,
}: RescheduleModalProps) {
  const [date, setDate]           = useState(currentDate ?? '');
  const [slot, setSlot]           = useState<TimeSlot | ''>(currentSlot ?? '');
  const [slotCounts, setSlotCounts] = useState<Record<string, number>>({});
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError]         = useState('');
  const [busy, setBusy]           = useState(false);

  async function handleDateChange(val: string) {
    setDate(val);
    setSlot('');
    if (!val) { setSlotCounts({}); return; }
    setLoadingSlots(true);
    const counts: Record<string, number> = {};
    for (const s of TIME_SLOTS) {
      const { data } = await supabase.rpc('get_slot_count', { p_date: val, p_slot: s });
      counts[s] = (data as number) ?? 0;
    }
    setSlotCounts(counts);
    setLoadingSlots(false);
  }

  async function handleConfirm() {
    if (!date || !slot) { setError('Choose a date and slot.'); return; }
    if ((slotCounts[slot] ?? 0) >= MAX_PER_SLOT) { setError('That slot is full.'); return; }
    setBusy(true);
    setError('');
    const { error: rpcErr } = await supabase.rpc('reschedule_request', {
      p_request_id: requestId,
      p_new_date: date,
      p_new_slot: slot,
    });
    setBusy(false);
    if (rpcErr) { setError(rpcErr.message); return; }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-lg w-full max-w-sm p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Reschedule Request</h3>
        <p className="text-xs text-gray-400 mb-4">
          <span className="font-medium text-gray-600">{building}</span>
        </p>

        <label className="block text-sm font-medium text-gray-700 mb-1">New Date</label>
        <input type="date" min={TODAY} max={MAX_DATE} value={date}
          onChange={e => handleDateChange(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-accent mb-3" />

        {date && (
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-2">New Slot</label>
            {loadingSlots ? (
              <p className="text-xs text-gray-400">Checking availability…</p>
            ) : (
              <div className="space-y-1.5">
                {TIME_SLOTS.map(s => {
                  const count = slotCounts[s] ?? 0;
                  const isFull = count >= MAX_PER_SLOT;
                  return (
                    <label key={s}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl border text-sm cursor-pointer
                        ${isFull ? 'opacity-40 cursor-not-allowed bg-gray-50 border-gray-200'
                          : slot === s ? 'bg-accent/10 border-accent'
                          : 'bg-gray-50 border-gray-200 hover:border-gray-300'}`}>
                      <span className="flex items-center gap-2">
                        <input type="radio" disabled={isFull} checked={slot === s}
                          onChange={() => !isFull && setSlot(s)} className="text-accent" />
                        <span className={slot === s ? 'font-medium text-accent' : ''}>{SLOT_LABELS[s]}</span>
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        isFull ? 'text-red-500 bg-red-50' : 'text-gray-400 bg-gray-100'
                      }`}>
                        {isFull ? 'Full' : `${count}/${MAX_PER_SLOT}`}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

        <div className="flex gap-2">
          <button onClick={onCancel} disabled={busy}
            className="flex-1 py-2 rounded-full border border-gray-200 text-sm text-gray-600 hover:border-gray-300 transition disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={busy}
            className="flex-1 py-2 rounded-full bg-accent hover:bg-accent-hover text-white text-sm font-medium transition disabled:opacity-50">
            {busy ? 'Saving…' : 'Reschedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
