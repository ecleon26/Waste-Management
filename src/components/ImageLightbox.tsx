/**
 * ImageLightbox – opens a full-screen overlay with the image.
 * Click backdrop or "✕" button to close.
 */
interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export default function ImageLightbox({ src, alt = 'Request image', onClose }: ImageLightboxProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
    >
      <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-8 right-0 text-white text-sm font-medium hover:opacity-80 transition"
        >
          ✕ Close
        </button>
        <img
          src={src}
          alt={alt}
          className="w-full max-h-[80vh] object-contain rounded-2xl border border-gray-700"
        />
      </div>
    </div>
  );
}
