import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { playSuccessBeep, playWarningBeep, playErrorTone } from '@/utils/audioTones';
import { parseGs1Barcode, ParsedGs1Barcode } from '@/utils/gs1Parser';

export type ScannerScreenContext = 
  | 'pos' 
  | 'purchases' 
  | 'stock_audit' 
  | 'medicines' 
  | 'returns' 
  | 'transfers' 
  | 'global';

export interface ScanResult {
  code: string;
  timestamp: number;
  source: 'usb' | 'camera';
  parsedGs1: ParsedGs1Barcode;
}

export type ScanHandler = (scan: ScanResult) => boolean | Promise<boolean>;

interface BarcodeScannerContextType {
  lastScan: ScanResult | null;
  isFlashing: boolean;
  activeScreenContext: ScannerScreenContext;
  setActiveScreenContext: (ctx: ScannerScreenContext) => void;
  registerScanHandler: (context: ScannerScreenContext, handler: ScanHandler) => () => void;
  simulateScan: (barcode: string, source?: 'usb' | 'camera') => Promise<boolean>;
  beepEnabled: boolean;
  setBeepEnabled: (enabled: boolean) => void;
  interKeyThresholdMs: number;
  setInterKeyThresholdMs: (ms: number) => void;
}

const BarcodeScannerContext = createContext<BarcodeScannerContextType | undefined>(undefined);

export const BarcodeScannerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);
  const [activeScreenContext, setActiveScreenContext] = useState<ScannerScreenContext>('pos');
  const [beepEnabled, setBeepEnabled] = useState<boolean>(true);
  const [interKeyThresholdMs, setInterKeyThresholdMs] = useState<number>(35); // Max 35ms avg between keys

  const handlersRef = useRef<Map<ScannerScreenContext, Set<ScanHandler>>>(new Map());
  const bufferRef = useRef<Array<{ char: string; time: number }>>([]);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerVisualFlash = () => {
    setIsFlashing(true);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setIsFlashing(false), 300);
  };

  const registerScanHandler = useCallback((context: ScannerScreenContext, handler: ScanHandler) => {
    if (!handlersRef.current.has(context)) {
      handlersRef.current.set(context, new Set());
    }
    handlersRef.current.get(context)!.add(handler);

    return () => {
      handlersRef.current.get(context)?.delete(handler);
    };
  }, []);

  const dispatchScan = useCallback(async (barcode: string, source: 'usb' | 'camera'): Promise<boolean> => {
    const parsedGs1 = parseGs1Barcode(barcode);
    const scan: ScanResult = {
      code: parsedGs1.isGs1 && parsedGs1.gtin ? parsedGs1.gtin : barcode,
      timestamp: Date.now(),
      source,
      parsedGs1,
    };

    setLastScan(scan);
    triggerVisualFlash();

    // 1. Try active context handlers first
    const activeHandlers = handlersRef.current.get(activeScreenContext);
    let handled = false;

    if (activeHandlers && activeHandlers.size > 0) {
      for (const handler of Array.from(activeHandlers)) {
        try {
          const res = await handler(scan);
          if (res) {
            handled = true;
            break;
          }
        } catch (e) {
          console.error('[Scanner] Handler error:', e);
        }
      }
    }

    // 2. If not handled by screen context, try global handlers
    if (!handled) {
      const globalHandlers = handlersRef.current.get('global');
      if (globalHandlers) {
        for (const handler of Array.from(globalHandlers)) {
          try {
            const res = await handler(scan);
            if (res) {
              handled = true;
              break;
            }
          } catch (e) {
            console.error('[Scanner] Global handler error:', e);
          }
        }
      }
    }

    // Feedback
    if (handled) {
      if (beepEnabled) playSuccessBeep();
    } else {
      if (beepEnabled) playWarningBeep();
    }

    return handled;
  }, [activeScreenContext, beepEnabled]);

  // Global USB Barcode Scanner Keyboard Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't hijack if user is deliberately typing in a standard input or textarea
      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const isScannerWhitelistedInput = target && target.getAttribute('data-scanner-input') === 'true';

      if (isInput && !isScannerWhitelistedInput) {
        // If an input is focused and the input is NOT scanner-ready, ignore global key listening
        return;
      }

      const now = Date.now();

      if (e.key === 'Enter') {
        const buffer = bufferRef.current;
        bufferRef.current = [];

        if (buffer.length >= 6) {
          // Calculate average inter-key latency
          let totalDiff = 0;
          for (let i = 1; i < buffer.length; i++) {
            totalDiff += (buffer[i].time - buffer[i - 1].time);
          }
          const avgDiff = totalDiff / (buffer.length - 1);

          // Fast burst (<35ms avg) indicates hardware barcode scanner
          if (avgDiff <= interKeyThresholdMs || isScannerWhitelistedInput) {
            e.preventDefault();
            const scannedString = buffer.map(b => b.char).join('');
            dispatchScan(scannedString, 'usb');
          }
        }
        return;
      }

      // Add printable character to buffer
      if (e.key.length === 1) {
        const buffer = bufferRef.current;
        // Expire old buffer if idle for > 200ms
        if (buffer.length > 0 && now - buffer[buffer.length - 1].time > 200) {
          bufferRef.current = [];
        }
        bufferRef.current.push({ char: e.key, time: now });
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [dispatchScan, interKeyThresholdMs]);

  return (
    <BarcodeScannerContext.Provider
      value={{
        lastScan,
        isFlashing,
        activeScreenContext,
        setActiveScreenContext,
        registerScanHandler,
        simulateScan: (code, source = 'usb') => dispatchScan(code, source),
        beepEnabled,
        setBeepEnabled,
        interKeyThresholdMs,
        setInterKeyThresholdMs,
      }}
    >
      {children}
      {/* Visual Flash Indicator on successful scan */}
      {isFlashing && (
        <div className="fixed inset-0 pointer-events-none z-50 ring-4 ring-brand-500/50 bg-brand-500/5 transition-opacity" />
      )}
    </BarcodeScannerContext.Provider>
  );
};

export const useBarcodeScanner = () => {
  const context = useContext(BarcodeScannerContext);
  if (!context) {
    throw new Error('useBarcodeScanner must be used within BarcodeScannerProvider');
  }
  return context;
};
