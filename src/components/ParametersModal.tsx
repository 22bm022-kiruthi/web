import React, { useEffect, useState } from 'react';
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
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setMountNode(document.body);
    console.debug('[ParametersModal] mounted, initial isOpen=', isOpen, 'title=', title);
  }, []);

  if (!isOpen || !mountNode) {
    console.debug('[ParametersModal] not rendering (isOpen, mountNode)=', isOpen, !!mountNode, 'title=', title);
    return null;
  }
  console.debug('[ParametersModal] rendering modal (title)=', title);

  const modal = (
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-black bg-opacity-40"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        console.log('[Modal] Backdrop clicked');
        onClose();
      }}
    >
      <div
        className="bg-white rounded-lg shadow-lg p-6 min-w-[420px] max-w-[480px] max-h-[80vh] overflow-auto relative z-[10051]"
        onClick={(e) => {
          console.log('[Modal] Content area clicked');
          e.stopPropagation();
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={(e) => {
              e.stopPropagation();
              console.log('[Modal] Close button clicked');
              onClose();
            }}
            className="text-gray-500 hover:text-red-500 text-2xl font-bold leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div>
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, mountNode);
};

export default ParametersModal;
