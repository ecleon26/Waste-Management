import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── Shared types ─────────────────────────────────────────────────────────────

export type WasteType = 'dry' | 'wet';
/** All possible statuses — now includes 'rejected' */
export type RequestStatus = 'pending' | 'processed' | 'rejected';

/** Time slot constants – also used in the planner */
export const TIME_SLOTS = ['morning', 'afternoon', 'evening'] as const;
export type TimeSlot = typeof TIME_SLOTS[number];

/** Slot display labels */
export const SLOT_LABELS: Record<TimeSlot, string> = {
  morning:   'Morning (8–11 am)',
  afternoon: 'Afternoon (12–3 pm)',
  evening:   'Evening (4–7 pm)',
};

/** Maximum requests per slot per day */
export const MAX_PER_SLOT = 5;

/** Dry waste item options */
export const DRY_ITEMS = ['Plastic', 'Paper/Cardboard', 'Glass', 'Metal', 'Cloth', 'Other'] as const;
/** Wet waste item options */
export const WET_ITEMS = ['Kitchen/Food waste', 'Garden waste', 'Other'] as const;

export interface PickupRequest {
  id: string;
  user_id: string;
  // Location
  building: string;
  flat_number: string | null;
  street: string | null;
  // Contact
  phone: string | null;
  // Waste
  waste_type: WasteType;
  waste_items: string[];
  quantity: 'small' | 'medium' | 'large' | null;
  // Schedule
  scheduled_date: string | null;  // ISO date string 'YYYY-MM-DD'
  time_slot: TimeSlot | null;
  // Misc
  note: string | null;
  image_url: string | null;
  status: RequestStatus;
  // Timestamps
  created_at: string;
  processed_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
}

export interface Profile {
  id: string;
  email: string;
  role: 'user' | 'admin';
}

export interface RequestStats {
  total_pending: number;
  total_processed: number;
  total_rejected: number;
  processed_dry: number;
  processed_wet: number;
}
