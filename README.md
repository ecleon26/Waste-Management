# Neighborhood Waste Collection Planner (v2)

> **SDG 11 – Sustainable Cities and Communities**  
> A college Data Structures micro-project demonstrating **FIFO Queues** as the scheduling backbone for neighborhood waste pickup. Every pending request enters a queue and is served in arrival order — fair, transparent, and explainable.

---

## What's New in v2

| Feature | Details |
|---|---|
| **Scheduled Planner** | Admin date picker with three per-day time slots, each backed by its own `Queue<PickupRequest>` |
| **Day Simulation** | "Run Day Simulation" button processes requests slot-by-slot, one queue dequeue at a time, with 600 ms delay and a live log panel |
| **Reject flow** | Admin can reject any pending request with a required reason; user sees the reason and can "Submit again" with pre-filled form |
| **Rich request form** | Location, flat, street, phone (+91 validation), waste-item checkboxes, quantity, preferred date/slot with capacity check, image upload |
| **Image upload** | Supabase Storage — jpg/png/webp ≤ 5 MB; thumbnail in list, lightbox on click |
| **Slot capacity** | MAX_PER_SLOT = 5; full slots shown as "Full" in the form and as overflow in the planner |
| **Reschedule** | Admin can move a pending request to a different date+slot (capacity-aware, via RPC) |
| **Unit tests** | 11 Vitest tests for `Queue<T>` in `src/lib/queue.test.ts` |

---

## Problem Statement

Urban neighborhoods lack a systematic, fair way to manage resident waste pickup requests. Without a queue-based approach, requests can be processed out of order or lost.

This app gives:
- **Residents** a detailed submission form and real-time queue position per slot.
- **Admins** a global queue view, a date/slot planner, and a simulation to demonstrate FIFO processing.

---

## SDG 11 Link

*Sustainable Cities and Communities* requires **inclusive, safe, resilient** urban services. This planner directly supports:
- Fair, transparent waste collection (queue = no favoritism).
- Data-driven planning via stats by waste type, slot, and date.
- Digital civic infrastructure accessible to all residents.

---

## Why a Queue?

| Property | Why it matters |
|---|---|
| **FIFO** | Fairness: first to submit, first to be served |
| **O(1) enqueue** | Adding a new request is instant |
| **O(1) peek** | Admin can see the next request without scanning |
| **Simple model** | Works like any line — easy to explain to stakeholders |

A priority queue or stack would break fairness. One queue per time slot means each slot is served independently and in arrival order.

---

## Why One Queue Per Slot?

The planner builds **three independent FIFO queues** for each day:
```
Morning   Queue: [req_A, req_B, req_C] ← oldest first
Afternoon Queue: [req_D, req_E]
Evening   Queue: [req_F]
```
This models how a real pickup team works (morning crew, afternoon crew, etc.) while keeping FIFO fairness within each crew's schedule.

---

## What the Simulation Demonstrates

The "Run Day Simulation" button:
1. Calls `Queue.dequeue()` on each slot's queue in order (Morning → Afternoon → Evening).
2. Calls `process_request(id)` RPC for each dequeued item (atomic DB update).
3. Waits 600 ms between each so the demo is visually clear.
4. Shows a live log panel and a final summary.

This demonstrates that the `Queue<T>` data structure — not just a DB sort — is actively driving the processing order.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vite + React 19 + TypeScript |
| Styling | Tailwind CSS v3 |
| Backend / DB | Supabase (PostgreSQL + Auth + Storage) |
| Routing | react-router-dom v7 |
| Tests | Vitest |

---

## Project Structure

```
src/
├── lib/
│   ├── supabase.ts          # Client + all shared types + constants
│   ├── queue.ts             # Queue<T> FIFO class (documented)
│   └── queue.test.ts        # 11 Vitest unit tests
├── pages/
│   ├── Login.tsx            # Sign-in / sign-up, role-aware redirect
│   ├── UserDashboard.tsx    # Resident portal
│   ├── AdminDashboard.tsx   # Admin queue + planner tabs
│   └── PlannerTab.tsx       # Date/slot queues + simulation
├── components/
│   ├── Navbar.tsx           # Sticky header with sign-out
│   ├── RequestForm.tsx      # Detailed submission form (8 sections)
│   ├── RequestList.tsx      # Reusable list with image/reject/slot info
│   ├── StatCard.tsx         # Single-stat card
│   ├── RejectModal.tsx      # Reject with quick-pick reasons
│   ├── RescheduleModal.tsx  # Reschedule with capacity check
│   └── ImageLightbox.tsx    # Full-screen image overlay
└── App.tsx                  # Auth state + role routing
supabase/
├── schema.sql               # Full v2 schema (fresh setup)
├── migration_v2.sql         # Safe incremental migration (existing DB)
└── seed.sql                 # 12 sample requests across 3 days
```

---

## Setup Instructions

### 1. Create a Supabase Project
Go to [supabase.com](https://supabase.com) → New Project → copy **Project URL** and **anon key**.

### 2. Run the Schema

**Fresh setup:** paste `supabase/schema.sql` into the SQL Editor and run.

**Existing database (has data):** paste `supabase/migration_v2.sql` instead — it is safe to re-run.

### 3. Configure Environment Variables

```bash
cp .env.example .env
```
Edit `.env`:
```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Install and Run

```bash
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173).

### 5. Create an Admin Account

1. Sign up through the app with your admin email.
2. In Supabase SQL Editor, promote it:
```sql
update public.profiles set role = 'admin' where email = 'admin@example.com';
```
3. Sign out and back in — you'll land on the Admin Console.

### 6. Load Demo Data (Optional)

In the Supabase SQL Editor, run `supabase/seed.sql` **after** at least one user has signed up.  
It inserts 12 requests across today and the next 2 days (all slots, mixed waste types, 1 pre-rejected).

### 7. Run Tests

```bash
npm test
```
Runs 11 Vitest unit tests for `Queue<T>`. All should pass.

---

## Queue Time Complexities

| Operation | Time | Notes |
|---|---|---|
| `enqueue(item)` | **O(1)** | `Array.push` — tail append |
| `dequeue()` | **O(n)** | `Array.shift` — shifts all elements left |
| `peek()` | **O(1)** | Direct index 0 read |
| `isEmpty()` | **O(1)** | `.length === 0` |
| `size()` | **O(1)** | `.length` |
| `toArray()` | **O(n)** | Spread operator copy |

> For a neighborhood-scale queue (≤100 items), `Array.shift` costs microseconds. A linked-list would give O(1) dequeue but with worse cache performance for this scale.

---

## Viva Notes

### Why a Queue?
Queues enforce **FIFO** ordering, which maps directly to the real-world requirement: *whoever submits first, gets served first*. A stack (LIFO) would serve the most recent requester first — unfair. A priority queue would require a priority metric that doesn't exist here.

### Why One Queue Per Slot?
Each time slot is an independent processing unit (different crews, different times). Within a slot, FIFO must still hold. Three queues = three independent FIFO schedules. This is directly analogous to multiple checkout queues in a store.

### What Does the Simulation Demonstrate?
The simulation calls `Queue.dequeue()` — not a database query — to determine the next item. The database (`process_request` RPC) is only the persistence layer. The *ordering logic* lives in the `Queue<T>` data structure. This is the key grading point: the data structure is driving behavior, not just display.

### Complexity of Key Operations
- **Enqueue**: O(1) — appending to the back of an array.
- **Dequeue**: O(n) — shifting all remaining elements. For n ≤ 100, this is sub-millisecond.
- **Peek**: O(1) — reading `items[0]` directly.

---

## Test Cases

### Test 1 – Normal FIFO Flow with Simulation

**Steps:**
1. Sign up as a user. Submit 10+ requests spread across today's three slots.
2. Sign in as admin → Planner tab → select today.
3. Click "Run Day Simulation".

**Expected:**
- Simulation processes Morning → Afternoon → Evening, FIFO within each.
- Log panel shows each request processed in arrival order.
- Summary shows correct counts per slot and per waste type.
- Stat cards update (Pending decreases, Processed increases).

---

### Test 2 – Boundary Cases

**Empty slot:**
- Click "Process next" on a slot with no requests.
- Expected: friendly message "No pending requests in the [slot] slot.", no crash.

**Full slot (capacity = 5):**
- Submit a 6th request for the same date+slot.
- Expected in form: that slot shows "Full" and is disabled.
- Expected in admin planner: 6th request appears in "Waiting list" (overflow section).

**Dequeue on empty Queue:**
- All requests processed → `Queue.isEmpty()` returns `true`.
- Clicking "Process next" shows the empty-state message.
- `Queue.dequeue()` returns `undefined` (confirmed by unit test).

---

### Test 3 – Validation: Invalid Input

**Bad phone:**
- Submit form with "123" as phone.
- Expected: "Enter a valid 10-digit Indian phone number."

**Past date:**
- Set pickup date to yesterday.
- Expected: "Date must be today or later."

**No waste items:**
- Select waste type but check zero items.
- Expected: "Select at least one waste item."

**Oversized image:**
- Upload a file > 5 MB.
- Expected: "Image must be smaller than 5 MB."

**Wrong image type:**
- Upload a `.pdf` or `.gif`.
- Expected: "Only JPG, PNG, or WebP images are allowed."

---

### Test 4 – Reject Flow

**Reject with reason:**
1. Admin clicks "Reject" on any pending request.
2. Modal opens with quick-pick reasons.
3. Select or type a reason → Confirm.
4. Expected: request leaves the queue, appears in "Rejected" section, admin sees rejection reason, Rejected stat increases.
5. User logs in → sees "Rejected" badge and the reason text in a red card.

**Reject without reason:**
1. Admin opens reject modal, leaves reason empty or types 1–2 characters → Confirm.
2. Expected: validation error "Please provide a reason (at least 3 characters).", request unchanged.

---

### Test 5 – Access Control

**UI redirect:**
1. Sign in as a regular user.
2. Navigate to `/admin` manually.
3. Expected: immediately redirected to `/` (login page). Admin UI never renders.

**RLS enforcement:**
- User A submits a request. User B logs in.
- User B's dashboard does not show User A's requests (RLS: `auth.uid() = user_id`).
- A direct Supabase API call with User B's token cannot fetch User A's rows.

**RPC admin guard:**
- Calling `process_request`, `reject_request`, or `reschedule_request` with a non-admin token raises `"Access denied: admins only"` from Postgres.

---

## Manual Steps in Supabase (Summary)

| Step | Action |
|---|---|
| 1 | Run `schema.sql` (fresh) **or** `migration_v2.sql` (existing DB) in SQL Editor |
| 2 | Verify `status` check constraint now includes `'rejected'` |
| 3 | Verify `request-images` bucket appears in Storage |
| 4 | Promote admin: `update profiles set role='admin' where email='...'` |
| 5 | (Optional) Run `seed.sql` after signing up |

---

*Built as a Data Structures micro-project — demonstrating how a classic FIFO Queue maps directly onto a real-world civic scheduling problem.*
