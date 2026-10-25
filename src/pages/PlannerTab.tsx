import { useState, useCallback, useRef } from 'react';
import { supabase, TIME_SLOTS, SLOT_LABELS, MAX_PER_SLOT } from '../lib/supabase';
import type { PickupRequest, TimeSlot } from '../lib/supabase';
import { Queue } from '../lib/queue';
import RejectModal from '../components/RejectModal';
import RescheduleModal from '../components/RescheduleModal';
import ImageLightbox from '../components/ImageLightbox';

interface PlannerTabProps {
  onDataChanged: () => void; // tell parent to refresh stats
}

interface SimLogEntry {
  text: string;
  type: 'info' | 'ok' | 'warn';
}

const SLOT_ICONS: Record<TimeSlot, string> = {
  morning: '🌅',
  afternoon: '🌤️',
  evening: '🌆',
};

/**
 * Planner Tab – Admin scheduled pickup view.
 *
 * For the selected date, ONE Queue<PickupRequest> is built PER time slot
 * (morning, afternoon, evening). Requests are loaded from DB ordered by
 * created_at ASC and enqueued in that order, so FIFO is preserved inside
 * each slot.
 *
 * Actions per slot:
 *   • Process next  – dequeues the front (calls process_request RPC)
 *   • Reject        – opens RejectModal
 *   • Reschedule    – opens RescheduleModal
 *
 * "Run Day Simulation" – iterates Morning → Afternoon → Evening,
 *   calls Queue.dequeue() one-by-one with ~600 ms delay so the demo is
 *   visually clear. Uses process_request() RPC for each DB update.
 */
export default function PlannerTab({ onDataChanged }: PlannerTabProps) {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  // One queue per slot
  const [slotQueues, setSlotQueues] = useState<Record<TimeSlot, Queue<PickupRequest>>>({
    morning:   new Queue(),
    afternoon: new Queue(),
    evening:   new Queue(),
  });
  const [loading, setLoading]           = useState(false);
  const [loadError, setLoadError]       = useState<string | null>(null);
  const [actionMsg, setActionMsg]       = useState<string | null>(null);

  // Reject / Reschedule modal state
  const [rejectTarget, setRejectTarget]   = useState<PickupRequest | null>(null);
  const [reschedTarget, setReschedTarget] = useState<PickupRequest | null>(null);

  // Image lightbox
  const [lightboxSrc, setLightboxSrc]   = useState<string | null>(null);

  // Simulation state
  const [simRunning, setSimRunning]     = useState(false);
  const [simLog, setSimLog]             = useState<SimLogEntry[]>([]);
  const [simSummary, setSimSummary]     = useState<string | null>(null);
  const stopRef = useRef(false); // signal simulation to stop

  // ── Load requests for the selected date ─────────────────────────────────
  const loadDay = useCallback(async (date: string) => {
    setLoading(true);
    setLoadError(null);
    setActionMsg(null);
    setSimLog([]);
    setSimSummary(null);

    const { data, error } = await supabase
      .from('pickup_requests')
      .select('*')
      .eq('scheduled_date', date)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    setLoading(false);
    if (error) { setLoadError(error.message); return; }

    // Build one Queue per slot – FIFO order maintained by created_at ASC sort above
    const qs: Record<TimeSlot, Queue<PickupRequest>> = {
      morning:   new Queue(),
      afternoon: new Queue(),
      evening:   new Queue(),
    };
    for (const row of (data ?? []) as PickupRequest[]) {
      const slot = row.time_slot as TimeSlot | null;
      if (slot && slot in qs) {
        qs[slot].enqueue(row);   // O(1) per item
      }
    }
    setSlotQueues(qs);
  }, []);

  function handleDateChange(val: string) {
    setSelectedDate(val);
    loadDay(val);
  }

  // ── Process next in a specific slot ─────────────────────────────────────
  async function processNext(slot: TimeSlot) {
    const q = slotQueues[slot];
    if (q.isEmpty()) {
      setActionMsg(`No pending requests in the ${slot} slot.`);
      return;
    }
    const front = q.peek()!;
    const { error } = await supabase.rpc('process_request', { p_request_id: front.id });
    if (error) { setActionMsg(`Error: ${error.message}`); return; }

    // Local dequeue so UI updates immediately without a full reload
    q.dequeue();
    setSlotQueues({ ...slotQueues, [slot]: q });
    setActionMsg(`✅ Processed: ${front.building} (${slot})`);
    onDataChanged();
  }

  // ── Reject ───────────────────────────────────────────────────────────────
  async function handleReject(req: PickupRequest, reason: string) {
    const { error } = await supabase.rpc('reject_request', {
      p_request_id: req.id,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    // Remove from the slot's queue
    const q = slotQueues[req.time_slot as TimeSlot];
    const remaining = q.toArray().filter(r => r.id !== req.id);
    const newQ = new Queue<PickupRequest>();
    remaining.forEach(r => newQ.enqueue(r));
    setSlotQueues({ ...slotQueues, [req.time_slot as TimeSlot]: newQ });
    setRejectTarget(null);
    setActionMsg(`🚫 Rejected: ${req.building}`);
    onDataChanged();
  }

  // ── Reschedule ───────────────────────────────────────────────────────────
  function handleRescheduleDone() {
    setReschedTarget(null);
    loadDay(selectedDate); // reload the day
    onDataChanged();
  }

  // ── Day Simulation ───────────────────────────────────────────────────────
  async function runSimulation() {
    setSimRunning(true);
    setSimLog([]);
    setSimSummary(null);
    stopRef.current = false;

    const log = (text: string, type: SimLogEntry['type'] = 'info') => {
      setSimLog(prev => [...prev, { text, type }]);
    };

    // Make a fresh snapshot of queues to simulate from
    const snapQueues: Record<TimeSlot, Queue<PickupRequest>> = {
      morning:   new Queue(),
      afternoon: new Queue(),
      evening:   new Queue(),
    };
    for (const slot of TIME_SLOTS) {
      slotQueues[slot].toArray().forEach(r => snapQueues[slot].enqueue(r));
    }

    let totalProcessed = 0;
    const dryCount: Record<string, number> = { dry: 0, wet: 0 };
    const slotCount: Record<string, number> = { morning: 0, afternoon: 0, evening: 0 };

    log(`🗓️  Starting simulation for ${selectedDate}…`);

    // Process slot by slot: Morning → Afternoon → Evening
    for (const slot of TIME_SLOTS) {
      const q = snapQueues[slot];
      if (q.isEmpty()) {
        log(`${SLOT_ICONS[slot]} ${SLOT_LABELS[slot]}: no requests`, 'warn');
        continue;
      }
      log(`${SLOT_ICONS[slot]} ${SLOT_LABELS[slot]} — ${q.size()} request(s)`);

      while (!q.isEmpty()) {
        if (stopRef.current) {
          log('⏹ Simulation stopped by user.', 'warn');
          setSimRunning(false);
          return;
        }

        const req = q.dequeue()!;  // ← Queue.dequeue() — O(n) shift
        const { error } = await supabase.rpc('process_request', { p_request_id: req.id });

        if (error) {
          log(`  ❌ ${req.building} – ${error.message}`, 'warn');
          continue;
        }

        totalProcessed++;
        dryCount[req.waste_type]++;
        slotCount[slot]++;

        const items = req.waste_items?.join(', ') || req.waste_type;
        log(`  ✅ ${req.building}, Flat ${req.flat_number ?? '–'} – ${items} (${req.quantity ?? '–'})`, 'ok');

        // 600 ms pause so the demo is visually clear
        await new Promise(r => setTimeout(r, 600));
      }
    }

    // Update local queues to empty (all processed)
    setSlotQueues({
      morning:   new Queue(),
      afternoon: new Queue(),
      evening:   new Queue(),
    });

    const summary = [
      `🏁 Done! Processed ${totalProcessed} request(s).`,
      `   Morning: ${slotCount.morning} · Afternoon: ${slotCount.afternoon} · Evening: ${slotCount.evening}`,
      `   Dry: ${dryCount.dry} · Wet: ${dryCount.wet}`,
    ].join('\n');
    setSimSummary(summary);
    log(summary, 'ok');
    setSimRunning(false);
    onDataChanged();
  }

  function stopSimulation() {
    stopRef.current = true;
  }

  // ── Render slot card ─────────────────────────────────────────────────────
  function renderSlotCard(slot: TimeSlot) {
    const q = slotQueues[slot];
    const items = q.toArray();
    const isOverCapacity = items.length > MAX_PER_SLOT;
    const withinCapacity = items.slice(0, MAX_PER_SLOT);
    const overflow = items.slice(MAX_PER_SLOT);

    return (
      <div key={slot} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Slot header */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-gray-50">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {SLOT_ICONS[slot]} {SLOT_LABELS[slot]}
            </p>
            <p className={`text-xs mt-0.5 ${isOverCapacity ? 'text-red-500' : 'text-gray-400'}`}>
              {Math.min(items.length, MAX_PER_SLOT)} / {MAX_PER_SLOT} booked
              {isOverCapacity && ` · ${overflow.length} waiting`}
            </p>
          </div>
          <button
            onClick={() => processNext(slot)}
            disabled={q.isEmpty() || simRunning}
            className="text-xs px-4 py-1.5 rounded-full bg-accent hover:bg-accent-hover text-white font-medium transition disabled:opacity-40"
          >
            Process next →
          </button>
        </div>

        {/* Queue items */}
        <div className="divide-y divide-gray-50">
          {items.length === 0 ? (
            <p className="text-xs text-gray-400 px-5 py-4 text-center">
              No pickups scheduled for this slot.
            </p>
          ) : (
            withinCapacity.map((req, idx) => (
              <div key={req.id}
                className={`px-5 py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2
                  ${idx === 0 ? 'bg-blue-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  {idx === 0 && (
                    <span className="inline-block text-xs font-semibold text-white bg-accent px-2 py-0.5 rounded-full mb-1">
                      Next
                    </span>
                  )}
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {req.building}{req.flat_number ? ` · ${req.flat_number}` : ''}
                  </p>
                  <p className="text-xs text-gray-400">
                    {req.waste_type === 'dry' ? '♻️' : '🍃'}{' '}
                    {req.waste_items?.join(', ') || req.waste_type}
                    {req.quantity ? ` · ${req.quantity}` : ''}
                  </p>
                  {req.phone && <p className="text-xs text-gray-300">📞 {req.phone}</p>}
                  <p className="text-xs text-gray-300">#{idx + 1} · {new Date(req.created_at).toLocaleTimeString()}</p>
                </div>

                {/* Image thumbnail */}
                {req.image_url && (
                  <button onClick={() => setLightboxSrc(req.image_url!)} className="shrink-0">
                    <img src={req.image_url} alt=""
                      className="w-12 h-12 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition" />
                  </button>
                )}

                {/* Admin actions */}
                <div className="flex gap-1.5 shrink-0 flex-wrap">
                  <button
                    onClick={() => setRejectTarget(req)}
                    disabled={simRunning}
                    className="text-xs px-3 py-1 rounded-full border border-red-200 text-red-500 hover:bg-red-50 transition disabled:opacity-40"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => setReschedTarget(req)}
                    disabled={simRunning}
                    className="text-xs px-3 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-gray-300 transition disabled:opacity-40"
                  >
                    Reschedule
                  </button>
                </div>
              </div>
            ))
          )}

          {/* Overflow / waiting list */}
          {overflow.length > 0 && (
            <div className="px-5 py-3 bg-amber-50">
              <p className="text-xs font-semibold text-amber-600 mb-2">
                ⚠️ Waiting list ({overflow.length}) — over capacity
              </p>
              {overflow.map(req => (
                <div key={req.id} className="flex items-center justify-between py-1">
                  <p className="text-xs text-gray-600">
                    {req.building}{req.flat_number ? ` · ${req.flat_number}` : ''}
                  </p>
                  <button onClick={() => setReschedTarget(req)}
                    className="text-xs px-2 py-0.5 rounded-full border border-gray-200 text-gray-500 hover:border-gray-300 transition">
                    Reschedule
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const totalPending = TIME_SLOTS.reduce((s, sl) => s + slotQueues[sl].size(), 0);

  return (
    <>
      {/* Modals */}
      {rejectTarget && (
        <RejectModal
          requestId={rejectTarget.id}
          building={rejectTarget.building}
          onConfirm={reason => handleReject(rejectTarget, reason)}
          onCancel={() => setRejectTarget(null)}
        />
      )}
      {reschedTarget && (
        <RescheduleModal
          requestId={reschedTarget.id}
          building={reschedTarget.building}
          currentDate={reschedTarget.scheduled_date}
          currentSlot={reschedTarget.time_slot as TimeSlot | null}
          onDone={handleRescheduleDone}
          onCancel={() => setReschedTarget(null)}
        />
      )}
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      <div className="space-y-6">
        {/* Date picker + simulation controls */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={e => handleDateChange(e.target.value)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-accent"
              />
              {!loading && (
                <p className="text-xs text-gray-400 mt-1">
                  {totalPending} pending request{totalPending !== 1 ? 's' : ''} for this day
                </p>
              )}
            </div>

            {/* Simulation controls */}
            <div className="flex gap-2 shrink-0">
              {simRunning ? (
                <button
                  onClick={stopSimulation}
                  className="px-5 py-2.5 rounded-full border border-red-200 text-red-500 text-sm font-medium hover:bg-red-50 transition"
                >
                  ⏹ Stop
                </button>
              ) : (
                <button
                  onClick={runSimulation}
                  disabled={loading || totalPending === 0}
                  className="px-5 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white text-sm font-medium transition disabled:opacity-40"
                >
                  ▶ Run Day Simulation
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Feedback bar */}
        {actionMsg && (
          <p className={`text-sm px-4 py-2.5 rounded-xl border ${
            actionMsg.startsWith('✅')
              ? 'text-green-700 bg-green-50 border-green-100'
              : actionMsg.startsWith('🚫')
              ? 'text-red-600 bg-red-50 border-red-100'
              : 'text-amber-700 bg-amber-50 border-amber-100'
          }`}>
            {actionMsg}
          </p>
        )}
        {loadError && <p className="text-sm text-red-500">{loadError}</p>}
        {loading && <p className="text-sm text-gray-400">Loading schedule…</p>}

        {/* Three slot cards */}
        <div className="grid grid-cols-1 gap-4">
          {TIME_SLOTS.map(slot => renderSlotCard(slot))}
        </div>

        {/* Simulation log */}
        {simLog.length > 0 && (
          <div className="bg-gray-900 rounded-2xl p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Simulation Log
            </p>
            <div className="space-y-1 font-mono text-xs max-h-64 overflow-y-auto">
              {simLog.map((entry, i) => (
                <p key={i} className={
                  entry.type === 'ok'   ? 'text-green-400'
                  : entry.type === 'warn' ? 'text-amber-400'
                  : 'text-gray-300'
                }>
                  {entry.text}
                </p>
              ))}
            </div>
            {simSummary && (
              <div className="mt-3 pt-3 border-t border-gray-700">
                <p className="text-xs text-green-400 whitespace-pre-line font-mono">{simSummary}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
