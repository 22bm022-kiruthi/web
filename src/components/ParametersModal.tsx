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
    const compute = () => {
      try {
        const canvasEl = document.querySelector('.orange-canvas') as HTMLElement | null;
        if (!canvasEl) {
          setOverlayStyle({ position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', zIndex: 10050 });
          return;
        }
        const rect = canvasEl.getBoundingClientRect();
        setOverlayStyle({ position: 'fixed', left: rect.left, top: rect.top, width: rect.width, height: rect.height, zIndex: 10050 });
      } catch (e) {
        setOverlayStyle({ position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', zIndex: 10050 });
      }
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
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
            <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-gray-500 hover:text-red-500 text-2xl font-bold leading-none" aria-label="Close">×</button>
          </div>
          <div>{children}</div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default ParametersModal;
