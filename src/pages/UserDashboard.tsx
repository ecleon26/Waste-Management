import { useState, useEffect, useCallback } from 'react';
import { supabase, SLOT_LABELS, MAX_PER_SLOT } from '../lib/supabase';
import type { Profile, PickupRequest, TimeSlot } from '../lib/supabase';
import { Queue } from '../lib/queue';
import Navbar from '../components/Navbar';
import RequestForm from '../components/RequestForm';
import RequestList from '../components/RequestList';

interface UserDashboardProps {
  profile: Profile;
  onSignOut: () => void;
}

/**
 * Resident dashboard.
 * – Submit detailed requests (via RequestForm)
 * – View pending requests loaded into a Queue (FIFO, with slot position)
 * – View processed + rejected history
 * – "Submit again" on rejected requests pre-fills the form
 */
export default function UserDashboard({ profile, onSignOut }: UserDashboardProps) {
  const [pendingQueue, setPendingQueue] = useState<Queue<PickupRequest>>(new Queue());
  const [processed, setProcessed]       = useState<PickupRequest[]>([]);
  const [rejected, setRejected]         = useState<PickupRequest[]>([]);
  const [loadError, setLoadError]       = useState<string | null>(null);
  // Pre-fill for "Submit again"
  const [prefill, setPrefill]           = useState<Partial<PickupRequest> | undefined>();
  const [formKey, setFormKey]           = useState(0); // force remount to reset form

  const loadRequests = useCallback(async () => {
    setLoadError(null);
    const { data, error } = await supabase
      .from('pickup_requests')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: true });

    if (error) { setLoadError(error.message); return; }

    const rows = (data ?? []) as PickupRequest[];
    const q = new Queue<PickupRequest>();
    const proc: PickupRequest[] = [];
    const rej: PickupRequest[]  = [];

    for (const row of rows) {
      if (row.status === 'pending')   q.enqueue(row);  // O(1) — FIFO preserved
      else if (row.status === 'processed') proc.push(row);
      else if (row.status === 'rejected')  rej.push(row);
    }

    setPendingQueue(q);
    setProcessed([...proc].reverse());
    setRejected([...rej].reverse());
  }, [profile.id]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const pendingItems = pendingQueue.toArray();

  // Build per-slot positions (grouped by scheduled_date + time_slot)
  // position = index within that slot's subqueue
  const slotPositions: Record<string, number> = {};
  const slotCounters: Record<string, number> = {};
  for (const req of pendingItems) {
    if (!req.scheduled_date || !req.time_slot) continue;
    const key = `${req.scheduled_date}|${req.time_slot}`;
    slotCounters[key] = (slotCounters[key] ?? 0) + 1;
    slotPositions[req.id] = slotCounters[key];
  }

  function handleSubmitAgain(req: PickupRequest) {
    setPrefill(req);
    setFormKey(k => k + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <Navbar profile={profile} onSignOut={onSignOut} />

      <main className="max-w-2xl mx-auto px-4 py-10 space-y-8">
        <div>
          <h2 className="text-3xl font-semibold text-gray-900">Hello 👋</h2>
          <p className="text-gray-400 mt-1 text-sm">
            Submit a waste pickup request and track its progress below.
          </p>
        </div>

        {/* Submission form — key forces remount when pre-filling */}
        <RequestForm key={formKey} userId={profile.id} onSubmitted={() => { setPrefill(undefined); loadRequests(); }} prefill={prefill} />

        {loadError && <p className="text-sm text-red-500">{loadError}</p>}

        {/* Pending queue */}
        <section>
          <h3 className="text-base font-semibold text-gray-700 mb-3">
            Pending Requests
            {pendingQueue.size() > 0 && (
              <span className="ml-2 text-xs font-normal text-gray-400">
                ({pendingQueue.size()} in queue)
              </span>
            )}
          </h3>
          {/* Slot position label appears in each row for requests that have a date+slot */}
          <RequestList
            requests={pendingItems}
            showPosition={true}
            slotPositions={slotPositions}
            emptyMessage="No pending requests. Submit one above!"
          />
        </section>

        {/* Processed history */}
        {processed.length > 0 && (
          <section>
            <h3 className="text-base font-semibold text-gray-700 mb-3">Processed History</h3>
            <RequestList requests={processed} />
          </section>
        )}

        {/* Rejected section */}
        {rejected.length > 0 && (
          <section>
            <h3 className="text-base font-semibold text-gray-700 mb-3">Rejected Requests</h3>
            <RequestList
              requests={rejected}
              renderActions={req => (
                <button
                  onClick={() => handleSubmitAgain(req)}
                  className="text-xs px-4 py-1.5 rounded-full border border-accent text-accent hover:bg-accent hover:text-white transition"
                >
                  Submit again ↗
                </button>
              )}
            />
            <p className="text-xs text-gray-400 mt-2">
              "Submit again" pre-fills the form so you can correct and resubmit.
            </p>
          </section>
        )}

        {/* Slot legend */}
        {pendingItems.some(r => r.time_slot) && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Time Slots</p>
            <ul className="space-y-1">
              {(Object.entries(SLOT_LABELS) as [TimeSlot, string][]).map(([k, v]) => (
                <li key={k} className="text-xs text-gray-500 flex justify-between">
                  <span>{v}</span>
                  <span className="text-gray-300">max {MAX_PER_SLOT} requests</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
