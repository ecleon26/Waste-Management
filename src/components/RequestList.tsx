import { useState } from 'react';
import type { PickupRequest } from '../lib/supabase';
import { SLOT_LABELS } from '../lib/supabase';
import type { TimeSlot } from '../lib/supabase';
import ImageLightbox from './ImageLightbox';

interface RequestListProps {
  requests: PickupRequest[];
  /** Show queue position badge (user view, pending only) */
  showPosition?: boolean;
  emptyMessage?: string;
  /** Per-slot position map: requestId → position */
  slotPositions?: Record<string, number>;
  /** Extra action buttons per row (admin use) */
  renderActions?: (req: PickupRequest) => React.ReactNode;
}

/**
 * Reusable request list used in both User and Admin views.
 * Handles all status colours, image thumbnails (with lightbox),
 * rejection reasons, and slot position labels.
 */
export default function RequestList({
  requests,
  showPosition = false,
  emptyMessage = 'No requests yet.',
  slotPositions,
  renderActions,
}: RequestListProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  if (requests.length === 0) {
    return <p className="text-sm text-gray-400 py-4 text-center">{emptyMessage}</p>;
  }

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      pending:   'text-amber-600 bg-amber-50 border-amber-100',
      processed: 'text-green-600 bg-green-50 border-green-100',
      rejected:  'text-red-500 bg-red-50 border-red-100',
    };
    const label: Record<string, string> = {
      pending: 'Pending', processed: 'Processed', rejected: 'Rejected',
    };
    return (
      <span className={`text-xs font-medium px-3 py-1 rounded-full border ${map[status] ?? ''}`}>
        {label[status] ?? status}
      </span>
    );
  }

  return (
    <>
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}

      <ul className="space-y-3">
        {requests.map((req, index) => (
          <li key={req.id}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 flex flex-col gap-2">

            {/* Top row */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div className="flex-1 min-w-0">
                {/* Building + flat */}
                <p className="text-sm font-medium text-gray-900">
                  {req.building}{req.flat_number ? ` · Flat ${req.flat_number}` : ''}
                </p>
                {req.street && <p className="text-xs text-gray-400 mt-0.5">{req.street}</p>}

                {/* Waste info */}
                <p className="text-xs text-gray-400 mt-0.5">
                  {req.waste_type === 'dry' ? '♻️ Dry' : '🍃 Wet'}
                  {req.waste_items?.length > 0 ? ` · ${req.waste_items.join(', ')}` : ''}
                  {req.quantity ? ` · ${req.quantity}` : ''}
                </p>

                {/* Schedule */}
                {(req.scheduled_date || req.time_slot) && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    📅 {req.scheduled_date ?? '–'}
                    {req.time_slot ? ` · ${SLOT_LABELS[req.time_slot as TimeSlot]}` : ''}
                    {slotPositions?.[req.id] != null
                      ? ` — You are #${slotPositions[req.id]} in this slot`
                      : ''}
                  </p>
                )}

                {req.phone && (
                  <p className="text-xs text-gray-300 mt-0.5">📞 {req.phone}</p>
                )}

                {req.note && (
                  <p className="text-xs text-gray-400 mt-0.5 italic">"{req.note}"</p>
                )}

                {/* Rejection reason */}
                {req.status === 'rejected' && req.rejection_reason && (
                  <div className="mt-1.5 px-3 py-1.5 bg-red-50 rounded-xl border border-red-100">
                    <p className="text-xs text-red-600">
                      <span className="font-medium">Reason:</span> {req.rejection_reason}
                    </p>
                  </div>
                )}

                <p className="text-xs text-gray-300 mt-0.5">
                  Submitted {new Date(req.created_at).toLocaleString()}
                </p>
              </div>

              {/* Right column: badges */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {/* Queue position for pending items (user view) */}
                {showPosition && req.status === 'pending' && !slotPositions && (
                  <span className="text-xs font-medium text-accent bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                    #{index + 1} in queue
                  </span>
                )}
                {statusBadge(req.status)}
              </div>
            </div>

            {/* Image thumbnail */}
            {req.image_url && (
              <button type="button" onClick={() => setLightboxSrc(req.image_url!)}
                className="self-start">
                <img src={req.image_url} alt="Waste photo"
                  className="w-16 h-16 object-cover rounded-xl border border-gray-200 hover:opacity-80 transition" />
              </button>
            )}

            {/* Extra actions (admin) */}
            {renderActions && (
              <div className="flex gap-2 flex-wrap">
                {renderActions(req)}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
