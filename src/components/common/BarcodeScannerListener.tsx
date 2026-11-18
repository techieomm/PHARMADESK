import { useEffect, useRef } from 'react';
import { playScanBeep } from '@/utils/barcode';

interface BarcodeScannerListenerProps {
  onScan: (barcode: string) => void;
  enabled?: boolean;
  beepOnScan?: boolean;
}

export const useBarcodeScanner = ({
  onScan,
  enabled = true,
  beepOnScan = true,
}: BarcodeScannerListenerProps) => {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore functional modifier keys
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(e.key)) {
        return;
      }

      const now = Date.now();
      const diff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Enter key indicates end of barcode string
      if (e.key === 'Enter') {
        if (bufferRef.current.length >= 3) {
          const barcode = bufferRef.current;
          bufferRef.current = '';
          if (beepOnScan) playScanBeep();
          onScan(barcode);
        } else {
          bufferRef.current = '';
        }
        return;
      }

      // Barcode scanners type very rapidly (typically < 45ms per character)
      // If typing delay is large (> 120ms), it's likely manual user typing, so reset buffer
      if (diff > 120) {
        bufferRef.current = '';
      }

      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, onScan, beepOnScan]);
};
