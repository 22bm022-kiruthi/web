import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ParametersModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const ParametersModal: React.FC<ParametersModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
}) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [overlayStyle, setOverlayStyle] = useState<React.CSSProperties | null>(null);

  useEffect(() => {
    // Always use a full-viewport overlay to avoid positioning issues
    setOverlayStyle({ position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', zIndex: 10050 });
    console.log('[ParametersModal] mounted, using full-viewport overlay');
    return () => {};
  }, []);

  if (!isOpen) return null;

  const modal = (
    <div ref={overlayRef} style={overlayStyle || { position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', zIndex: 10050 }}>
      <div
        style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClose(); }}
      >
        <div
          className="bg-white rounded-lg shadow-lg p-6 min-w-[420px] max-w-[480px] max-h-[80vh] overflow-auto relative"
          onClick={(e) => { e.stopPropagation(); }}
        >
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="px-3 py-1 bg-gray-200 rounded text-sm text-gray-700 hover:bg-gray-300" aria-label="Close">Close</button>
          </div>
          <div>{children}</div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default ParametersModal;
