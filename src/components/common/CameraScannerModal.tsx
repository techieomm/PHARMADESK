import React, { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Camera, AlertCircle } from 'lucide-react';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [manualCode, setManualCode] = useState<string>('');
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setHasPermission(true);

        // Native BarcodeDetector API if available
        if ('BarcodeDetector' in window) {
          const detector = new (window as any).BarcodeDetector({
            formats: ['code_128', 'ean_13', 'ean_8', 'qr_code', 'data_matrix'],
          });

          intervalId = setInterval(async () => {
            if (videoRef.current && videoRef.current.readyState === 4) {
              try {
                const barcodes = await detector.detect(videoRef.current);
                if (barcodes.length > 0) {
                  const rawValue = barcodes[0].rawValue;
                  if (rawValue) {
                    onScan(rawValue);
                    onClose();
                  }
                }
              } catch {
                // Ignore detection errors in loop
              }
            }
          }, 300);
        }
      } catch (err) {
        console.warn('Camera access error:', err);
        setHasPermission(false);
      }
    };

    startCamera();

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isOpen, onClose, onScan]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      onScan(manualCode.trim());
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Camera Barcode Scanner"
      subtitle="Point camera at medicine barcode or enter code manually"
      maxWidth="md"
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        {hasPermission === false ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3 text-amber-800 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
            <p>Camera permission was denied or camera is unavailable. You can use a USB scanner or enter the barcode manually below.</p>
          </div>
        ) : (
          <div className="relative aspect-video bg-charcoal-900 rounded-lg overflow-hidden flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Target Reticle */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-24 border-2 border-brand-400 rounded-lg relative animate-pulse">
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-rose-500/80 shadow-xs" />
              </div>
            </div>
            <div className="absolute bottom-2 inset-x-0 text-center text-[11px] text-white/80 bg-charcoal-900/60 py-1">
              Position barcode inside the frame
            </div>
          </div>
        )}

        {/* Manual Barcode Input */}
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            type="text"
            placeholder="Or type barcode here (e.g. 8901030001011)..."
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            className="h-10 flex-1 rounded-md border border-charcoal-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
          <Button type="submit" variant="primary">
            Submit
          </Button>
        </form>
      </div>
    </Modal>
  );
};
