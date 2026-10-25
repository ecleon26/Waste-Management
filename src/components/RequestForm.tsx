import { useState, useRef } from 'react';
import { supabase, DRY_ITEMS, WET_ITEMS, TIME_SLOTS, SLOT_LABELS, MAX_PER_SLOT } from '../lib/supabase';
import type { WasteType, TimeSlot, PickupRequest } from '../lib/supabase';

interface RequestFormProps {
  userId: string;
  onSubmitted: () => void;
  /** Pre-fill from a rejected request (for "Submit again") */
  prefill?: Partial<PickupRequest>;
}

interface FormErrors {
  building?: string;
  flat_number?: string;
  street?: string;
  phone?: string;
  waste_type?: string;
  waste_items?: string;
  other_item?: string;
  quantity?: string;
  scheduled_date?: string;
  time_slot?: string;
  note?: string;
  image?: string;
  general?: string;
}


const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const TODAY = new Date().toISOString().split('T')[0];
const MAX_DATE = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

/**
 * Detailed pickup request form with:
 *  – Location section (building, flat, street)
 *  – Contact (phone with +91 India validation)
 *  – Waste (type, items checkboxes, quantity)
 *  – Schedule (preferred date + time slot with capacity check)
 *  – Image upload (optional, jpg/png/webp ≤ 5 MB)
 *  – Special instructions
 * Validates everything client-side before submitting.
 */
export default function RequestForm({ userId, onSubmitted, prefill }: RequestFormProps) {
  // ── Location ──────────────────────────────────────────────────────────────
  const [building, setBuilding]       = useState(prefill?.building ?? '');
  const [flatNumber, setFlatNumber]   = useState(prefill?.flat_number ?? '');
  const [street, setStreet]           = useState(prefill?.street ?? '');
  // ── Contact ───────────────────────────────────────────────────────────────
  const [phone, setPhone]             = useState(prefill?.phone ?? '');
  // ── Waste ─────────────────────────────────────────────────────────────────
  const [wasteType, setWasteType]     = useState<WasteType | ''>(prefill?.waste_type ?? '');
  const [wasteItems, setWasteItems]   = useState<string[]>(prefill?.waste_items ?? []);
  const [otherItem, setOtherItem]     = useState('');
  const [quantity, setQuantity]       = useState(prefill?.quantity ?? '');
  // ── Schedule ──────────────────────────────────────────────────────────────
  const [schedDate, setSchedDate]     = useState(prefill?.scheduled_date ?? '');
  const [timeSlot, setTimeSlot]       = useState<TimeSlot | ''>(prefill?.time_slot ?? '');
  const [slotCounts, setSlotCounts]   = useState<Record<string, number>>({});
  const [loadingSlots, setLoadingSlots] = useState(false);
  // ── Misc ──────────────────────────────────────────────────────────────────
  const [note, setNote]               = useState(prefill?.note ?? '');
  const [imageFile, setImageFile]     = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // ── Form state ────────────────────────────────────────────────────────────
  const [errors, setErrors]           = useState<FormErrors>({});
  const [submitting, setSubmitting]   = useState(false);
  const [success, setSuccess]         = useState(false);

  // ── Waste items derived from type ─────────────────────────────────────────
  const itemOptions = wasteType === 'dry' ? DRY_ITEMS : wasteType === 'wet' ? WET_ITEMS : [];

  function handleWasteTypeChange(t: WasteType) {
    setWasteType(t);
    setWasteItems([]); // reset items when type changes
    setOtherItem('');
  }

  function toggleItem(item: string) {
    setWasteItems(prev =>
      prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]
    );
  }

  // ── Date change → fetch slot counts ──────────────────────────────────────
  async function handleDateChange(val: string) {
    setSchedDate(val);
    setTimeSlot('');
    if (!val) { setSlotCounts({}); return; }
    setLoadingSlots(true);
    const counts: Record<string, number> = {};
    for (const slot of TIME_SLOTS) {
      const { data } = await supabase.rpc('get_slot_count', { p_date: val, p_slot: slot });
      counts[slot] = (data as number) ?? 0;
    }
    setSlotCounts(counts);
    setLoadingSlots(false);
  }

  // ── Image pick ────────────────────────────────────────────────────────────
  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setErrors(prev => ({ ...prev, image: undefined }));
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrors(prev => ({ ...prev, image: 'Only JPG, PNG, or WebP images are allowed.' }));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setErrors(prev => ({ ...prev, image: 'Image must be smaller than 5 MB.' }));
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function removeImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  // ── Validation ────────────────────────────────────────────────────────────
  function validate(): boolean {
    const e: FormErrors = {};
    if (!building.trim())    e.building   = 'Building name / number is required.';
    if (!flatNumber.trim())  e.flat_number = 'Flat / unit number is required.';
    if (!street.trim())      e.street     = 'Street or landmark is required.';

    // Phone: allow optional +91 then exactly 10 digits
    const phoneDigits = phone.replace(/^\+91/, '').replace(/\s/g, '');
    if (!phone.trim())       e.phone = 'Contact phone is required.';
    else if (!/^\d{10}$/.test(phoneDigits))
                             e.phone = 'Enter a valid 10-digit Indian phone number (e.g. 9876543210 or +919876543210).';

    if (!wasteType)          e.waste_type  = 'Please select a waste type.';

    if (wasteType && wasteItems.length === 0)
                             e.waste_items = 'Select at least one waste item.';
    if (wasteItems.includes('Other') && !otherItem.trim())
                             e.other_item  = 'Describe the "Other" item.';

    if (!quantity)           e.quantity    = 'Select an estimated quantity.';

    if (!schedDate)          e.scheduled_date = 'Choose a pickup date.';
    else if (schedDate < TODAY)      e.scheduled_date = 'Date must be today or later.';
    else if (schedDate > MAX_DATE)   e.scheduled_date = 'Date must be within the next 14 days.';

    if (!timeSlot)           e.time_slot   = 'Choose a time slot.';
    else if ((slotCounts[timeSlot] ?? 0) >= MAX_PER_SLOT)
                             e.time_slot   = 'This slot is full. Please choose another.';

    if (note.length > 300)   e.note = `Max 300 characters (${note.length}/300).`;

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(evt: React.FormEvent) {
    evt.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setErrors({});

    let imageUrl: string | null = null;

    // Upload image if present
    if (imageFile) {
      const ext = imageFile.name.split('.').pop();
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { data: upData, error: upErr } = await supabase.storage
        .from('request-images')
        .upload(path, imageFile);
      if (upErr) {
        setErrors({ general: `Image upload failed: ${upErr.message}. You can submit without the image.` });
        setSubmitting(false);
        return;
      }
      const { data: urlData } = supabase.storage.from('request-images').getPublicUrl(upData.path);
      imageUrl = urlData.publicUrl;
    }

    // Combine waste items — append "Other: <desc>" if needed
    const finalItems = wasteItems.map(i => (i === 'Other' && otherItem.trim()) ? `Other: ${otherItem.trim()}` : i);

    const { error } = await supabase.from('pickup_requests').insert({
      user_id:        userId,
      building:       building.trim(),
      flat_number:    flatNumber.trim() || null,
      street:         street.trim() || null,
      phone:          phone.replace(/\s/g, '') || null,
      waste_type:     wasteType,
      waste_items:    finalItems,
      quantity:       quantity || null,
      scheduled_date: schedDate || null,
      time_slot:      timeSlot || null,
      note:           note.trim() || null,
      image_url:      imageUrl,
    });

    setSubmitting(false);
    if (error) {
      setErrors({ general: error.message });
    } else {
      // Reset form
      setBuilding(''); setFlatNumber(''); setStreet('');
      setPhone(''); setWasteType(''); setWasteItems([]); setOtherItem('');
      setQuantity(''); setSchedDate(''); setTimeSlot('');
      setNote(''); removeImage(); setSlotCounts({});
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
      onSubmitted();
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const inputCls = (err?: string) =>
    `w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition bg-gray-50
     ${err ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-accent focus:bg-white'}`;

  const ErrMsg = ({ msg }: { msg?: string }) =>
    msg ? <p className="mt-1 text-xs text-red-500">{msg}</p> : null;

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{children}</p>
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">New Pickup Request</h2>

      {/* ── Location ──────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionLabel>Location</SectionLabel>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Building Name / Number <span className="text-red-500">*</span></label>
          <input type="text" value={building} onChange={e => setBuilding(e.target.value)}
            placeholder="e.g. Block A" className={inputCls(errors.building)} />
          <ErrMsg msg={errors.building} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Flat / Unit <span className="text-red-500">*</span></label>
            <input type="text" value={flatNumber} onChange={e => setFlatNumber(e.target.value)}
              placeholder="e.g. 204" className={inputCls(errors.flat_number)} />
            <ErrMsg msg={errors.flat_number} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Street / Landmark <span className="text-red-500">*</span></label>
            <input type="text" value={street} onChange={e => setStreet(e.target.value)}
              placeholder="e.g. MG Road" className={inputCls(errors.street)} />
            <ErrMsg msg={errors.street} />
          </div>
        </div>
      </div>

      {/* ── Contact ────────────────────────────────────────────────────── */}
      <div>
        <SectionLabel>Contact</SectionLabel>
        <label className="block text-sm font-medium text-gray-700 mb-1">Phone <span className="text-red-500">*</span></label>
        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
          placeholder="+91 98765 43210" className={inputCls(errors.phone)} />
        <ErrMsg msg={errors.phone} />
      </div>

      {/* ── Waste type ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionLabel>Waste Details</SectionLabel>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Waste Type <span className="text-red-500">*</span></label>
          <div className="flex gap-3">
            {(['dry', 'wet'] as WasteType[]).map(t => (
              <button key={t} type="button"
                onClick={() => handleWasteTypeChange(t)}
                className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition
                  ${wasteType === t ? 'bg-accent text-white border-accent' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                {t === 'dry' ? '♻️ Dry' : '🍃 Wet'}
              </button>
            ))}
          </div>
          <ErrMsg msg={errors.waste_type} />
        </div>

        {/* Waste items */}
        {wasteType && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Items to collect <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {itemOptions.map(item => (
                <label key={item}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs cursor-pointer transition
                    ${wasteItems.includes(item)
                      ? 'bg-accent/10 border-accent text-accent font-medium'
                      : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                  <input type="checkbox" className="sr-only"
                    checked={wasteItems.includes(item)}
                    onChange={() => toggleItem(item)} />
                  {item}
                </label>
              ))}
            </div>
            <ErrMsg msg={errors.waste_items} />
            {wasteItems.includes('Other') && (
              <div className="mt-2">
                <input type="text" value={otherItem} onChange={e => setOtherItem(e.target.value)}
                  placeholder="Describe the item…"
                  className={inputCls(errors.other_item)} />
                <ErrMsg msg={errors.other_item} />
              </div>
            )}
          </div>
        )}

        {/* Quantity */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Estimated Quantity <span className="text-red-500">*</span></label>
          <div className="flex gap-2">
            {[['small','Small (1 bag)'],['medium','Medium (2–3 bags)'],['large','Large (4+ bags)']] .map(([val, label]) => (
              <button key={val} type="button"
                onClick={() => setQuantity(val)}
                className={`flex-1 py-2 rounded-xl border text-xs font-medium transition
                  ${quantity === val ? 'bg-accent text-white border-accent' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                {label}
              </button>
            ))}
          </div>
          <ErrMsg msg={errors.quantity} />
        </div>
      </div>

      {/* ── Schedule ──────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionLabel>Preferred Schedule</SectionLabel>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Pickup Date <span className="text-red-500">*</span></label>
          <input type="date" min={TODAY} max={MAX_DATE} value={schedDate}
            onChange={e => handleDateChange(e.target.value)}
            className={inputCls(errors.scheduled_date)} />
          <ErrMsg msg={errors.scheduled_date} />
        </div>
        {schedDate && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Time Slot <span className="text-red-500">*</span></label>
            {loadingSlots ? (
              <p className="text-xs text-gray-400">Checking availability…</p>
            ) : (
              <div className="space-y-2">
                {TIME_SLOTS.map(slot => {
                  const count = slotCounts[slot] ?? 0;
                  const isFull = count >= MAX_PER_SLOT;
                  return (
                    <label key={slot}
                      className={`flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm cursor-pointer transition
                        ${isFull ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-200'
                          : timeSlot === slot ? 'bg-accent/10 border-accent'
                          : 'bg-gray-50 border-gray-200 hover:border-gray-300'}`}>
                      <span className="flex items-center gap-2">
                        <input type="radio" name="time_slot" value={slot} disabled={isFull}
                          checked={timeSlot === slot}
                          onChange={() => !isFull && setTimeSlot(slot)}
                          className="text-accent" />
                        <span className={timeSlot === slot ? 'font-medium text-accent' : 'text-gray-700'}>
                          {SLOT_LABELS[slot]}
                        </span>
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        isFull ? 'text-red-500 bg-red-50 border border-red-100' : 'text-gray-400 bg-gray-100'
                      }`}>
                        {isFull ? 'Full' : `${count}/${MAX_PER_SLOT}`}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            <ErrMsg msg={errors.time_slot} />
          </div>
        )}
      </div>

      {/* ── Image ─────────────────────────────────────────────────────── */}
      <div>
        <SectionLabel>Photo (optional)</SectionLabel>
        {imagePreview ? (
          <div className="flex items-start gap-3">
            <img src={imagePreview} alt="Preview" className="w-20 h-20 object-cover rounded-xl border border-gray-200" />
            <div>
              <p className="text-xs text-gray-500">{imageFile?.name}</p>
              <button type="button" onClick={removeImage}
                className="mt-1 text-xs text-red-500 hover:underline">Remove</button>
            </div>
          </div>
        ) : (
          <div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
              onChange={handleImageChange} className="block text-sm text-gray-500
                file:mr-3 file:py-1.5 file:px-4 file:rounded-full file:border-0
                file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700
                hover:file:bg-gray-200 transition" />
            <p className="text-xs text-gray-400 mt-1">JPG, PNG, or WebP · max 5 MB</p>
          </div>
        )}
        <ErrMsg msg={errors.image} />
      </div>

      {/* ── Notes ─────────────────────────────────────────────────────── */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Special Instructions <span className="text-gray-400 font-normal">(optional, max 300 chars)</span>
        </label>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
          placeholder='e.g. "Bags kept near gate"'
          className={`${inputCls(errors.note)} resize-none`} />
        <div className="flex justify-between mt-0.5">
          <ErrMsg msg={errors.note} />
          <span className={`text-xs ml-auto ${note.length > 300 ? 'text-red-500' : 'text-gray-300'}`}>
            {note.length}/300
          </span>
        </div>
      </div>

      {/* ── Feedback ──────────────────────────────────────────────────── */}
      {errors.general && <p className="text-xs text-red-500">{errors.general}</p>}
      {success && (
        <div className="px-4 py-3 rounded-xl bg-green-50 border border-green-100">
          <p className="text-sm text-green-700 font-medium">✅ Request submitted successfully!</p>
          <p className="text-xs text-green-600 mt-0.5">
            You'll see it in your pending list below.
          </p>
        </div>
      )}

      <button type="submit" disabled={submitting}
        className="w-full py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white text-sm font-medium transition disabled:opacity-50">
        {submitting ? 'Submitting…' : 'Submit Request'}
      </button>
    </form>
  );
}
