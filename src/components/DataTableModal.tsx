import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface DataTableModalProps {
  isOpen: boolean;
  data: any[]; // array of objects or arrays
  onClose: () => void;
  // optional id of the widget that is the source of this table (used to request upstream data)
  sourceWidgetId?: string;
}

const DataTableModal: React.FC<DataTableModalProps> = ({ isOpen, data, onClose, sourceWidgetId }) => {
  // Debug flag (false in normal usage). Set true only when actively debugging.
  const DEBUG_ALWAYS_SHOW = false;
  // Drag state for making the modal movable
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const offsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // portal container inside the canvas (if available)
  const portalContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRectRef = useRef<DOMRect | null>(null);
  // Center modal on first open. Retry briefly if element hasn't been measured yet
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    let attempts = 0;

    const compute = () => {
      attempts += 1;
      if (cancelled) return;
      const el = modalRef.current;
      if (!el) {
        if (attempts < 6) {
          // try again on next frame
          requestAnimationFrame(compute);
        }
        return;
      }
      const rect = el.getBoundingClientRect();
      // If layout not ready (width/height are zero), retry a few times
      if ((rect.width === 0 || rect.height === 0) && attempts < 6) {
        requestAnimationFrame(compute);
        return;
      }

      const canvasEl = document.querySelector('.orange-canvas') as HTMLElement | null;
      if (canvasEl) {
        const canvasRect = canvasEl.getBoundingClientRect();
        // remember canvas rect for portal-relative positioning later
        canvasRectRef.current = canvasRect;
        // Calculate center position RELATIVE TO CANVAS (not viewport) since we're portalling into canvas
        const relCenterX = Math.round((canvasRect.width - rect.width) / 2);
        const relCenterY = Math.round((canvasRect.height - rect.height) / 2);
        console.debug('[DataTableModal] compute center (canvas-relative)', { rect: { width: rect.width, height: rect.height }, canvasRect: { width: canvasRect.width, height: canvasRect.height }, center: { x: relCenterX, y: relCenterY } });
        // Store position as viewport coords for now (will be converted to canvas-relative later)
        setPos({ x: canvasRect.left + Math.max(8, relCenterX), y: canvasRect.top + Math.max(8, relCenterY) });
      } else {
        const px = Math.round((window.innerWidth - rect.width) / 2);
        const py = Math.round((window.innerHeight - rect.height) / 2);
        console.debug('[DataTableModal] compute center (viewport)', { rect: { width: rect.width, height: rect.height }, viewport: { w: window.innerWidth, h: window.innerHeight }, pos: { x: px, y: py } });
        setPos({ x: px, y: py });
      }
    };

    // schedule initial compute
    requestAnimationFrame(compute);

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Create a portal container inside the canvas when opening the modal so
  // the overlay/modal can be positioned relative to the canvas element.
  useEffect(() => {
    if (!isOpen) return;
    const canvasEl = document.querySelector('.orange-canvas') as HTMLElement | null;
    if (!canvasEl) return;
    // create container if not present
    if (!portalContainerRef.current) {
      const c = document.createElement('div');
      c.className = 'data-table-portal-container';
      // ensure container fills canvas area and is positioned relative to canvas
      c.style.position = 'absolute';
      c.style.left = '0';
      c.style.top = '0';
      c.style.width = '100%';
      c.style.height = '100%';
      c.style.zIndex = '10001';
      canvasEl.appendChild(c);
      portalContainerRef.current = c;
    }
    return () => {
      try {
        if (portalContainerRef.current && portalContainerRef.current.parentElement) {
          portalContainerRef.current.parentElement.removeChild(portalContainerRef.current);
        }
      } catch (e) { /* ignore */ }
      portalContainerRef.current = null;
      canvasRectRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging) return;
      setPos((prev) => {
        if (!prev) return prev;
        return { x: e.clientX - offsetRef.current.x, y: e.clientY - offsetRef.current.y };
      });
    }

    function onUp() {
      setDragging(false);
    }

    if (dragging) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if (!modalRef.current) return;
    const rect = modalRef.current.getBoundingClientRect();
    offsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setDragging(true);
    e.preventDefault();
  };

  // Ensure hooks run unconditionally — compute safe data/columns
  const safeData = Array.isArray(data) ? data : [];
  const columns: string[] = [];
  if (safeData.length > 0) {
    const first = safeData[0];
    if (typeof first === 'object' && !Array.isArray(first)) {
      columns.push(...Object.keys(first));
    } else if (Array.isArray(first)) {
      columns.push(...first.map((_: any, i: number) => `Column ${i + 1}`));
    }
  }

  // Don't render if modal is not open
  if (!isOpen && !DEBUG_ALWAYS_SHOW) {
    return null;
  }

  // If no data, normally don't render. In debug mode we still render a placeholder
  if (safeData.length === 0) {
    console.debug('[DataTableModal] no data available', { isOpen, sourceWidgetId });
    if (!DEBUG_ALWAYS_SHOW) {
      console.debug('[DataTableModal] not rendering because safeData.length === 0', { isOpen, sourceWidgetId });
      return null;
    }
  }
  const modalContent = (
    <div 
      // When portalled into the canvas the overlay is absolute inside the canvas.
      className="data-table-overlay"
      style={{ position: portalContainerRef.current ? 'absolute' : 'fixed', left: 0, top: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 10001 }}
      onClick={(e) => {
        // Close when clicking on backdrop (not on the modal itself)
        if (e.target === e.currentTarget) {
          console.debug('[DataTableModal] backdrop click detected', { DEBUG_ALWAYS_SHOW });
          if (!DEBUG_ALWAYS_SHOW) onClose();
        }
      }}
    >
      {/* overlay; modal positioned absolutely so we can move it */}
      <div
        ref={modalRef}
        style={(() => {
          // If we have a canvas rect and we portalled into canvas, compute coords relative to canvas
          if (pos && portalContainerRef.current && canvasRectRef.current) {
            const canvasRect = canvasRectRef.current;
            const relLeft = Math.max(8, pos.x - canvasRect.left);
            const relTop = Math.max(8, pos.y - canvasRect.top);
            return { position: 'absolute', left: relLeft, top: relTop, zIndex: 10002, width: 'min(90vw, 1100px)' } as React.CSSProperties;
          }
          return pos ? { position: 'absolute', left: pos.x, top: pos.y, zIndex: 10002, width: 'min(90vw, 1100px)' } : { position: 'absolute', zIndex: 10002, width: 'min(90vw, 1100px)' };
        })()}
        className="bg-white rounded-lg shadow-lg p-6 max-w-3xl"
        onClick={(e) => {
          e.stopPropagation();
        }}
        onMouseDown={(e) => {
          // Allow dragging but prevent backdrop click
          e.stopPropagation();
        }}
      >
        <div className="flex justify-between items-center mb-4">
          <div
            className="cursor-move font-semibold"
            onMouseDown={onHeaderMouseDown}
            title="Drag to move"
          >
            Data Table
          </div>
          <button 
            onClick={(e) => {
              console.log('[DataTableModal] Close button clicked!');
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            className="text-gray-500 hover:text-red-500 text-2xl font-bold leading-none cursor-pointer bg-transparent border-none"
            aria-label="Close"
            type="button"
            style={{ padding: '0 8px' }}
          >
            ×
          </button>
        </div>
        <div className="overflow-auto max-h-[60vh]">
          <table className="min-w-full border border-gray-300">
            <thead>
              <tr>
                {columns.map((col: string, idx: number) => (
                  <th key={idx} className="border px-2 py-1 bg-gray-100">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {safeData.map((row: any, i: number) => (
                <tr key={i}>
                  {columns.map((col: string, idx: number) => {
                    const cellValue = typeof row === 'object' && !Array.isArray(row) ? row[col] : row[idx];
                    // Convert objects to JSON strings to avoid React rendering errors
                    const displayValue = typeof cellValue === 'object' && cellValue !== null 
                      ? JSON.stringify(cellValue) 
                      : String(cellValue ?? '');
                    return (
                      <td key={idx} className="border px-2 py-1">
                        {displayValue}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // If we created a portal container inside the canvas, render into it.
  if (portalContainerRef.current) {
    try {
      return createPortal(modalContent, portalContainerRef.current);
    } catch (e) {
      // fallback to normal render
      console.warn('[DataTableModal] createPortal failed, falling back to direct render', e);
      return modalContent;
    }
  }

  return modalContent;
};

export default DataTableModal;