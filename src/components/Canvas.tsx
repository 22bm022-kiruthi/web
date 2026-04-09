import React, { useRef, useState, useCallback } from 'react';
import { useDrop } from 'react-dnd';
import CanvasWidget from './CanvasWidget';
import ConnectionLine from './ConnectionLine';
import { Widget, Connection } from '../types';
import { useTheme } from '../contexts/ThemeContext';

interface CanvasProps {
  widgets: Widget[];
  connections: Connection[];
  onUpdateWidget: (id: string, changes: Partial<Widget>) => void;
  onDeleteWidget: (id: string) => void;
  onOpenConfig: (widget: Widget) => void;
  onAddConnection: (fromId: string, toId: string) => void; // <-- must be present
  onAddWidget: (type: string, position: { x: number; y: number }, initialData?: any) => string | void; // <-- must be present
  onRemoveConnections?: (widgetId: string) => void;
}

const Canvas: React.FC<CanvasProps> = ({
  widgets,
  connections,
  onUpdateWidget,
  onDeleteWidget,
  onOpenConfig,
  onAddConnection,
  onAddWidget,
  onRemoveConnections,
}) => {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  // Inner radius (in pixels) used for connection anchors / hit-testing. Use a smaller value to attach to the inner layer.
  const INNER_RADIUS = 30;
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [connectingFromPort, setConnectingFromPort] = useState<'top' | 'left' | 'right' | 'bottom' | null>(null);
  const [connectionPreview, setConnectionPreview] = useState<{
    from: { x: number; y: number };
    to: { x: number; y: number };
  } | null>(null);
  const [externalDrag, setExternalDrag] = useState<boolean>(false);
  const { theme } = useTheme();

  const [{ isOver }, drop] = useDrop(() => ({
    accept: ['widget', 'canvas-widget'], // Accept both new and existing widgets
    drop: (item: any, monitor) => {
      console.log('[Canvas] Drop detected, item:', item, 'monitor:', monitor);
      if (!canvasRef.current) {
        console.log('[Canvas] Drop: canvasRef is null');
        return;
      }
      // clientOffset may be null under some HTML5Backend/browser combinations.
      // Try several fallbacks to compute a reasonable drop position.
      let clientOffset = monitor.getClientOffset() as { x: number; y: number } | null;
      if (!clientOffset) clientOffset = (monitor as any).getSourceClientOffset ? (monitor as any).getSourceClientOffset() : null;
      if (!clientOffset) clientOffset = (monitor as any).getInitialClientOffset ? (monitor as any).getInitialClientOffset() : null;
      // As a final fallback, attempt to derive from initial + difference offsets
      if (!clientOffset && (monitor as any).getInitialClientOffset && (monitor as any).getDifferenceFromInitialOffset) {
        const init = (monitor as any).getInitialClientOffset();
        const diff = (monitor as any).getDifferenceFromInitialOffset();
        if (init && diff) {
          clientOffset = { x: init.x + diff.x, y: init.y + diff.y };
        }
      }
      console.log('[Canvas] Drop: clientOffset:', clientOffset);
      if (!clientOffset) {
        console.warn('[Canvas] Drop: no clientOffset — using canvas center fallback');
        const canvasRect = canvasRef.current.getBoundingClientRect();
        clientOffset = { x: canvasRect.left + canvasRect.width / 2, y: canvasRect.top + canvasRect.height / 2 };
      }
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const position = {
        x: clientOffset.x - canvasRect.left - 40,
        y: clientOffset.y - canvasRect.top - 40,
      };

      console.log('[Canvas] Drop: calculated position:', position, 'canvasRect:', canvasRect);

      // If dragging from sidebar, add new widget
      if (item.type && typeof item.type === 'string' && !item.id) {
        console.log('[Canvas] Drop: Adding new widget with type:', item.type);
        onAddWidget(item.type, position);
      }

      // If dragging an existing widget, update its position
      if (item.id) {
        console.log('[Canvas] Drop: Updating position of existing widget:', item.id);
        onUpdateWidget(item.id, { position });
      }
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  }));

  const setCanvasRef = useCallback(
    (node: HTMLDivElement | null) => {
      console.log('[Canvas] setCanvasRef called with node:', !!node);
      canvasRef.current = node;
      if (node) {
        console.log('[Canvas] Registering drop handler on canvas node');
        drop(node);
      }
    },
    [drop]
  );

  // Track native HTML5 drag state so we can avoid heavy processing while a drag is active
  React.useEffect(() => {
    const onNativeDragStart = () => {
      console.debug('[Canvas] native dragstart detected');
      setExternalDrag(true);
    };
    const onNativeDragEnd = () => {
      console.debug('[Canvas] native dragend detected');
      setExternalDrag(false);
    };
    window.addEventListener('dragstart', onNativeDragStart);
    window.addEventListener('dragend', onNativeDragEnd);
    window.addEventListener('dragleave', onNativeDragEnd);
    return () => {
      window.removeEventListener('dragstart', onNativeDragStart);
      window.removeEventListener('dragend', onNativeDragEnd);
      window.removeEventListener('dragleave', onNativeDragEnd);
    };
  }, []);

  const createLinkedNode = useCallback(
    (sourceId: string, widgetTypeId: string) => {
      const source = widgets.find((w) => w.id === sourceId);
      if (!source || !canvasRef.current) return;
      const canvasRect = canvasRef.current.getBoundingClientRect();
      // place new node to the right-bottom of source, with a small offset
      const newPos = {
        x: Math.min(source.position.x + 140, Math.max(20, canvasRect.width - 80)),
        y: Math.min(source.position.y + 40, Math.max(20, canvasRect.height - 80)),
      };
      // Tell parent (App) to add widget -- Canvas doesn't own widgets state; we'll call onAddWidget which expects a type and position
      onAddWidget(widgetTypeId, newPos);
      // schedule connection when widget is likely added (small timeout)
      setTimeout(() => {
        // find the newest widget by id pattern
        const newWidget = widgets.find((w) => w.type === widgetTypeId && w.position.x === newPos.x && w.position.y === newPos.y);
        if (newWidget) {
          onAddConnection(sourceId, newWidget.id);
        } else {
          // fallback: try to find any recently added widget of that type
          const candidates = widgets.filter((w) => w.type === widgetTypeId);
          if (candidates.length > 0) {
            const pick = candidates[candidates.length - 1];
            onAddConnection(sourceId, pick.id);
          }
        }
      }, 120);
    },
    [widgets, onAddWidget, onAddConnection]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (externalDrag) return; // avoid heavy preview work during native drags
      if (connectingFrom && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const fromWidget = widgets.find((w) => w.id === connectingFrom);
          if (fromWidget) {
          const baseX = fromWidget.position.x + 40;
          const baseY = fromWidget.position.y + 40;
          let from = { x: baseX, y: baseY };
          if (connectingFromPort === 'right') from = { x: baseX + INNER_RADIUS, y: baseY };
          if (connectingFromPort === 'left') from = { x: baseX - INNER_RADIUS, y: baseY };
          if (connectingFromPort === 'top') from = { x: baseX, y: baseY - INNER_RADIUS };
          if (connectingFromPort === 'bottom') from = { x: baseX, y: baseY + INNER_RADIUS };

          setConnectionPreview({
            from,
            to: {
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
            },
          });
        }
      }
    },
    [connectingFrom, connectingFromPort, widgets, externalDrag]
  );

  const handleStartConnection = useCallback(
    (
      widgetId: string,
      portOrPoint?: 'top' | 'left' | 'right' | 'bottom' | { clientX: number; clientY: number }
    ) => {
      console.debug('[Canvas] start connection from', widgetId, 'portOrPoint=', portOrPoint);
      setConnectingFrom(widgetId);

      // compute an exact perimeter anchor if the caller supplied client coordinates
      let anchor = null as { x: number; y: number } | null;
      if (canvasRef.current && typeof portOrPoint === 'object' && portOrPoint !== null) {
        try {
          const rect = canvasRef.current.getBoundingClientRect();
          const w = widgets.find((x) => x.id === widgetId);
          // If the caller marked this as a port center, use the exact client coords
          // converted to canvas coordinates so the connection starts at the visible dot.
          if ((portOrPoint as any).portCenter) {
            anchor = { x: (portOrPoint as any).clientX - rect.left, y: (portOrPoint as any).clientY - rect.top };
            setConnectingFromPort(null);
            console.debug('[Canvas] portCenter anchor (canvas coords):', anchor, 'widgetId=', widgetId);
            // Immediately set a connection preview so the preview originates at the dot
            setConnectionPreview({ from: anchor, to: anchor });
          } else if (w) {
            const cx = w.position.x + 40;
            const cy = w.position.y + 40;
            // compute angle from center to client point
            const angle = Math.atan2(portOrPoint.clientY - (rect.top + cy), portOrPoint.clientX - (rect.left + cx));
            // perimeter radius (use inner radius to attach connections to inner layer)
            const r = INNER_RADIUS;
            // anchor in canvas coordinates
            anchor = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
            // store connectingFromPort as null because we're using continuous anchor
            setConnectingFromPort(null);
          }
        } catch (err) {
          // fallback to cardinal port logic below
        }
      } else if (typeof portOrPoint === 'string') {
        setConnectingFromPort(portOrPoint || null);
      }

      // Install global pointer handlers for drag-to-release
      const onPointerMoveGlobal = (ev: PointerEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const srcWidget = widgets.find((w) => w.id === widgetId);
        const baseX = srcWidget && srcWidget.position ? srcWidget.position.x + 40 : 0;
        const baseY = srcWidget && srcWidget.position ? srcWidget.position.y + 40 : 0;
        let from = { x: baseX, y: baseY };
        if (anchor) {
          from = { x: anchor.x, y: anchor.y };
        } else if (portOrPoint === 'right' || connectingFromPort === 'right') {
          from = { x: baseX + INNER_RADIUS, y: baseY };
        } else if (portOrPoint === 'left' || connectingFromPort === 'left') {
          from = { x: baseX - INNER_RADIUS, y: baseY };
        } else if (portOrPoint === 'top' || connectingFromPort === 'top') {
          from = { x: baseX, y: baseY - INNER_RADIUS };
        } else if (portOrPoint === 'bottom' || connectingFromPort === 'bottom') {
          from = { x: baseX, y: baseY + INNER_RADIUS };
        }
        const to = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
        console.debug('[Canvas] preview from', from, 'to', to);
        setConnectionPreview({ from, to });
      };

      const onPointerUpGlobal = (ev: PointerEvent) => {
        try {
          if (!canvasRef.current) return;
          const canvasRect = canvasRef.current.getBoundingClientRect();
          const px = ev.clientX - canvasRect.left;
          const py = ev.clientY - canvasRect.top;

          // choose a widget target by checking pointer proximity to the widget inner perimeter
          let best: { id: string; score: number } | null = null;
          for (const w of widgets) {
            if (w.id === widgetId) continue;
            const cx = w.position.x + 40;
            const cy = w.position.y + 40;
            const dx = px - cx;
            const dy = py - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
              // prefer pointers that lie near the widget inner perimeter (INNER_RADIUS)
              const ringDist = Math.abs(dist - INNER_RADIUS);
              const maxDist = INNER_RADIUS * 2.2;
              const ringThresh = INNER_RADIUS * 0.95;
              if (dist < maxDist && ringDist < ringThresh) {
                const score = ringDist + dist * 0.01; // lower score better
              if (!best || score < best.score) best = { id: w.id, score };
            }
          }

          if (best && best.id) {
            if (widgetId !== best.id) onAddConnection(widgetId, best.id);
            console.debug('[Canvas] onAddConnection chosen target:', best.id, 'from', widgetId);
          }
        } catch (err) {
          // swallow
        }
        // cleanup
        setConnectingFrom(null);
        setConnectingFromPort(null);
        setConnectionPreview(null);
        document.removeEventListener('pointermove', onPointerMoveGlobal);
        document.removeEventListener('pointerup', onPointerUpGlobal);
      };

      document.addEventListener('pointermove', onPointerMoveGlobal);
      document.addEventListener('pointerup', onPointerUpGlobal);
    },
    [widgets, onAddConnection]
  );

  const handleEndConnection = useCallback(
    (widgetId: string) => {
      console.debug('[Canvas] end connection to', widgetId, 'connectingFrom=', connectingFrom);
      if (connectingFrom && connectingFrom !== widgetId) {
        onAddConnection(connectingFrom, widgetId);
      }
      setConnectingFrom(null);
      setConnectionPreview(null);
    },
    [connectingFrom, onAddConnection]
  );

  const handleCancelConnection = useCallback(() => {
    console.debug('[Canvas] cancel connection');
    setConnectingFrom(null);
    setConnectionPreview(null);
  }, []);

  return (
    <div
      ref={setCanvasRef}
      className={`relative w-full h-full overflow-hidden transition-all duration-300 orange-canvas ${
        isOver ? (theme === 'dark' ? 'bg-gray-800/50' : 'bg-gray-50') : ''
      }`}
      onMouseMove={handleMouseMove}
      onClick={handleCancelConnection}
      // To prevent canvas from losing drag events by stopping propagation on inner elements:
      onDragOver={(e) => { e.preventDefault(); /* keep native drag from interfering */ }}
      onDrop={(e) => { console.debug('[Canvas] native onDrop event', e.type, 'dataTransfer types:', e.dataTransfer?.types); e.preventDefault(); }}
    >

      {/* Connection Lines */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
        style={{ overflow: 'visible' }} // Ensure lines are not clipped
      >
        {connections.map((connection) => {
          const fromWidget = widgets.find((w) => w.id === connection.fromId);
          const toWidget = widgets.find((w) => w.id === connection.toId);

          if (!fromWidget || !toWidget) return null;

          // Helper: compute port coordinates for input widgets so connections appear to start/end at dots
          const computePort = (w: typeof fromWidget, sidePreference: 'left' | 'right' | 'auto' = 'auto') => {
            // Prefer using a measured icon center if available (stored in widget.data.iconCenter as viewport coords)
            const canvasRect = canvasRef.current ? canvasRef.current.getBoundingClientRect() : { left: 0, top: 0 } as DOMRect;
            let centerX = w.position.x + 40;
            let centerY = w.position.y + 40;
            try {
              const ic = (w.data && (w.data as any).iconCenter) || null;
              if (ic && typeof ic.left === 'number' && typeof ic.top === 'number') {
                // convert viewport coords to canvas-local coordinates
                centerX = ic.left - canvasRect.left;
                centerY = ic.top - canvasRect.top;
              }
            } catch (err) {
              // fallback to position-based center
            }
            const leftDotX = centerX - 21;
            const rightDotX = centerX + 21;
            const isInput = ['supabase', 'data-table', 'file-upload'].includes(w.type);
            if (!isInput) return { x: centerX, y: centerY };
            if (sidePreference === 'left') return { x: leftDotX, y: centerY };
            if (sidePreference === 'right') return { x: rightDotX, y: centerY };
            // auto: default to center if we cannot infer side
            return { x: centerX, y: centerY };
          };

          // Decide which ports to use based on relative positions so lines connect visually between dots
          const dx = toWidget.position.x - fromWidget.position.x;
          let fromPoint = { x: fromWidget.position.x + 40, y: fromWidget.position.y + 40 };
          let toPoint = { x: toWidget.position.x + 40, y: toWidget.position.y + 40 };
          if (dx > 0) {
            // from is left of to -> use right port on from and left port on to
            fromPoint = computePort(fromWidget, 'right');
            toPoint = computePort(toWidget, 'left');
          } else if (dx < 0) {
            // from is right of to -> use left port on from and right port on to
            fromPoint = computePort(fromWidget, 'left');
            toPoint = computePort(toWidget, 'right');
          } else {
            // vertically aligned or same x: use centers
            fromPoint = { x: fromWidget.position.x + 40, y: fromWidget.position.y + 40 };
            toPoint = { x: toWidget.position.x + 40, y: toWidget.position.y + 40 };
          }

          return (
            <ConnectionLine
              key={connection.id}
              from={fromPoint}
              to={toPoint}
              theme={theme}
              createdAt={connection.createdAt}
            />
          );
        })}

        {/* Preview Connection */}
        {connectionPreview && (
          <ConnectionLine
            from={connectionPreview.from}
            to={connectionPreview.to}
            isPreview
            theme={theme}
          />
        )}
        {/* Debug: show a small marker at the preview 'from' point to verify anchor */}
        {connectionPreview && (
          <circle cx={connectionPreview.from.x} cy={connectionPreview.from.y} r={4} fill="#ef4444" style={{ pointerEvents: 'none' }} />
        )}
      </svg>

      {/* Widgets */}
      {widgets.map((widget) => {
        // compute a quick distance-based highlight for preview end snapping
        let isHighlighted = false;
        let highlightAngle: number | null = null;
        if (!externalDrag && connectionPreview) {
          const dx = connectionPreview.to.x - (widget.position.x + 40);
          const dy = connectionPreview.to.y - (widget.position.y + 40);
          const dist = Math.sqrt(dx * dx + dy * dy);
          isHighlighted = dist < 84; // within 84px show highlight
          if (isHighlighted) {
            // compute angle in degrees for widget to orient the semi-arc
            const angle = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180
            highlightAngle = angle;
          }
        }

        return (
            <CanvasWidget
            key={widget.id}
            widget={widget}
            isConnecting={connectingFrom !== null}
            isConnectingFrom={connectingFrom === widget.id}
            isHighlighted={isHighlighted}
            highlightAngle={highlightAngle}
            onUpdatePosition={(position) => onUpdateWidget(widget.id, { position })}
            onDelete={() => onDeleteWidget(widget.id)}
            onOpenConfig={() => onOpenConfig(widget)} 
              onStartConnection={(port) => handleStartConnection(widget.id, port)}
            onEndConnection={() => handleEndConnection(widget.id)}
            onUpdateWidget={(updates: any) => onUpdateWidget(widget.id, updates)}
            onCreateLinkedNode={(sourceId: string, widgetTypeId: string) => createLinkedNode(sourceId, widgetTypeId)}
            onRemoveConnections={() => onRemoveConnections && onRemoveConnections(widget.id)}
            onAddWidget={onAddWidget}
          />
        );
      })}
      {/* Empty canvas welcome with small tool pills */}
      {widgets.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-auto z-20">
          <div className={`text-center ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
            <div className="text-6xl mb-4">🌊</div>
            <h3 className="text-xl font-semibold mb-2">Welcome to DeepSpectrum</h3>
            <p className="text-lg mb-4">Drag widgets from the sidebar to start building your analysis workflow</p>
            <div className="flex flex-wrap justify-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => {
                  if (!canvasRef.current) return;
                  const rect = canvasRef.current.getBoundingClientRect();
                  const position = { x: rect.width / 2 - 40, y: rect.height / 2 - 40 };
                  onAddWidget('supabase', position);
                }}
                className={`px-3 py-1 rounded-full ${theme === 'dark' ? 'bg-gray-700 text-white' : 'bg-blue-100 text-blue-800'}`}
              >
                Add Supabase Source
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!canvasRef.current) return;
                  const rect = canvasRef.current.getBoundingClientRect();
                  const position = { x: rect.width / 2 - 40, y: rect.height / 2 - 40 };
                  onAddWidget('blank-remover', position);
                }}
                className={`px-3 py-1 rounded-full ${theme === 'dark' ? 'bg-gray-700 text-white' : 'bg-blue-100 text-blue-800'}`}
              >
                Process
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!canvasRef.current) return;
                  const rect = canvasRef.current.getBoundingClientRect();
                  const position = { x: rect.width / 2 - 40, y: rect.height / 2 - 40 };
                  onAddWidget('line-chart', position);
                }}
                className={`px-3 py-1 rounded-full ${theme === 'dark' ? 'bg-gray-700 text-white' : 'bg-blue-100 text-blue-800'}`}
              >
                Visualize
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!canvasRef.current) return;
                  const rect = canvasRef.current.getBoundingClientRect();
                  const position = { x: rect.width / 2 - 40, y: rect.height / 2 + 60 };
                  onAddWidget('kmeans-analysis', position);
                }}
                className={`px-3 py-1 rounded-full ${theme === 'dark' ? 'bg-gray-700 text-white' : 'bg-blue-100 text-blue-800'}`}
              >
                KMeans Clustering
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Canvas;
