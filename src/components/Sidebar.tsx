import React, { useState } from 'react';
import { useDrag } from 'react-dnd';
import { Upload, BarChart3, ScatterChart as Scatter3D, Box, Calculator, Filter, Database, LineChart, Search, Code } from 'lucide-react';
import { WidgetType } from '../types';
import widgetRegistry from '../utils/widgetRegistry';
import { useTheme } from '../contexts/ThemeContext';
// removed unused extra lucide-react imports

// Use central registry so sidebar shows all available widgets
const widgetTypes: WidgetType[] = widgetRegistry;

const iconMap: Record<string, React.ComponentType<any>> = {
  Upload,
  Database,
  LineChart,
  Scatter3D,
  Box,
  BarChart3,
  Calculator,
  Filter,
  Code,
  Search
};

interface DraggableWidgetProps {
  widgetType: WidgetType;
}

const DraggableWidget: React.FC<DraggableWidgetProps> = ({ widgetType }) => {
  const { theme } = useTheme();
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'widget',
    item: { type: widgetType.id },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));

  const IconComponent = iconMap[widgetType.icon];
  const [showFallback, setShowFallback] = useState<boolean>(true);
  const svgPath = `/${widgetType.id}.svg`;

  return (
    <div
      ref={drag}
      className={`group relative cursor-move transition-all duration-300 flex flex-col items-center ${
        isDragging ? 'opacity-50 scale-95' : 'hover:scale-105'
      }`}
    >
      <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${
        theme === 'dark'
          ? 'bg-gray-200 border-2 border-blue-200'
          : 'bg-white border-2 border-blue-200'
      }`}>
        <div className="icon-outer">
            <img
              src={svgPath}
              alt={widgetType.name}
              className="h-5 w-5 icon"
              style={{ display: showFallback ? 'none' : 'block' }}
              onLoad={() => setShowFallback(false)}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; setShowFallback(true); }}
            />
            <IconComponent style={{ display: showFallback ? 'block' : 'none' }} className={`h-5 w-5 icon transition-colors duration-300`} />
        </div>
      </div>
        {/* Always show widget name below icon */}
        <span className={`mt-2 text-xs font-medium text-center ${
          theme === 'dark' ? 'text-blue-900' : 'text-blue-700'
        }`}>
          {widgetType.name}
        </span>
    </div>
  );
};

// Small inline list item for nested lists
const SmallWidgetItem: React.FC<{ widgetType: WidgetType }> = ({ widgetType }) => {
  const [iconLoadFailed, setIconLoadFailed] = useState(false);
  const IconComponent = iconMap[widgetType.icon] || Upload;
  const { theme } = useTheme();
  
  // Use useDrag hook at the top level of the component
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'widget',
    item: { type: widgetType.id },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  // HTML5 drag for React Flow
  const onDragStart = (event: React.DragEvent) => {
    console.log('[Sidebar] Drag started for widget:', widgetType.id);
    event.dataTransfer.setData('application/reactflow', widgetType.id);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <li
      ref={drag as any}
      draggable
      onDragStart={onDragStart}
      className={`flex flex-col items-center gap-1 px-2 py-2 rounded hover:bg-blue-50 transition cursor-grab ${
        isDragging ? 'opacity-50' : ''
      }`}
      role="option"
      aria-label={widgetType.name}
    >
      <div className={`w-14 h-14 rounded flex items-center justify-center ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="icon-outer">
          {!iconLoadFailed ? (
            <img src={`/${widgetType.id}.svg`} alt={widgetType.name} className="h-5 w-5 icon" onError={() => setIconLoadFailed(true)} />
          ) : (
            <IconComponent className={`h-5 w-5 icon`} />
          )}
        </div>
      </div>
      <span className={`text-xs mt-1 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>{widgetType.name}</span>
    </li>
  );
};

interface SidebarProps {
  onAddWidget: (type: string, position: { x: number; y: number }) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onAddWidget }) => {
  const { theme } = useTheme();
  // ensure onAddWidget is referenced to avoid unused var linting
  void onAddWidget;
  // Start collapsed after login; user must click section headers to open
  const [showInputOpen, setShowInputOpen] = useState<boolean>(false);
  const [showProcessingOpen, setShowProcessingOpen] = useState<boolean>(false);
  const [showVisualizationOpen, setShowVisualizationOpen] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');

  const categories = {
    input: widgetTypes.filter(w => w.category === 'input'),
    processing: widgetTypes.filter(w => w.category === 'processing'),
    visualization: widgetTypes.filter(w => w.category === 'visualization')
  };

  // drag start handled via react-dnd; keep function removed to avoid unused var warnings

  return (
    <aside className={`w-96 transition-colors duration-300 ${
      theme === 'dark' ? 'bg-gray-900 border-transparent shadow-soft' : 'bg-[var(--surface)] border-transparent shadow-soft'
    }`}>
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-800">Widget Toolbox</h2>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-3 text-gray-400" />
          <input
            id="widget-search"
            type="search"
            placeholder="Search Widget"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-8 py-2 rounded border bg-white text-sm focus:outline-none"
            aria-label="Search Widget"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setSearch('');
                // refocus the input after clearing
                const el = document.getElementById('widget-search') as HTMLInputElement | null;
                el?.focus();
              }}
              className="absolute right-2 top-2 text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          )}
        </div>

        {/* Category list (clickable items with icon + count) */}
        <div className="flex flex-col gap-2 mb-4">
          {/* Data Input button + its inline expansion rendered directly below */}
          <div>
            <button
              type="button"
              onClick={() => setShowInputOpen((prev) => !prev)}
              aria-expanded={showInputOpen}
              className={`w-full flex items-center gap-3 p-2 rounded hover:bg-blue-50 transition text-left ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}
              aria-label="Toggle Data Input"
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-blue-100 text-blue-700">📤</div>
              <div className="flex-1">
                <div className="text-sm font-medium">Data Input</div>
                <div className="text-xs text-gray-500">{categories.input.length} widgets</div>
              </div>
              <div className="text-sm text-gray-500">{showInputOpen ? '−' : '+'}</div>
            </button>

            {showInputOpen && (
              <div className="mb-2 pl-4 border-l border-gray-100 dark:border-gray-800">
                <ul className="grid grid-cols-3 gap-3 list-none p-0 m-0">
                  {categories.input
                    .filter((w) => w.name.toLowerCase().includes(search.toLowerCase()))
                    .map((widget) => (
                      <SmallWidgetItem key={widget.id} widgetType={widget} />
                    ))}
                </ul>
              </div>
            )}
          </div>

          {/* Processing button + its inline expansion rendered directly below */}
          <div>
            <button
              type="button"
              onClick={() => setShowProcessingOpen((prev) => !prev)}
              aria-expanded={showProcessingOpen}
              className={`w-full flex items-center gap-3 p-2 rounded hover:bg-blue-50 transition text-left ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}
              aria-label="Toggle Processing"
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-pink-100 text-pink-700">🧹</div>
              <div className="flex-1">
                <div className="text-sm font-medium">Processing</div>
                <div className="text-xs text-gray-500">{categories.processing.length} widgets</div>
              </div>
              <div className="text-sm text-gray-500">{showProcessingOpen ? '−' : '+'}</div>
            </button>

            {showProcessingOpen && (
              <div className="mb-2 pl-4 border-l border-gray-100 dark:border-gray-800">
                <ul className="grid grid-cols-3 gap-3 list-none p-0 m-0">
                  {categories.processing
                    .filter((w) => w.name.toLowerCase().includes(search.toLowerCase()))
                    .map((widget) => (
                      <SmallWidgetItem key={widget.id} widgetType={widget} />
                    ))}
                </ul>
              </div>
            )}
          </div>

          {/* Visualization button + its inline expansion rendered directly below */}
          <div>
            <button
              type="button"
              onClick={() => setShowVisualizationOpen((prev) => !prev)}
              aria-expanded={showVisualizationOpen}
              className={`w-full flex items-center gap-3 p-2 rounded hover:bg-blue-50 transition text-left ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}
              aria-label="Toggle Visualization"
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-green-100 text-green-700">📈</div>
              <div className="flex-1">
                <div className="text-sm font-medium">Visualization</div>
                <div className="text-xs text-gray-500">{categories.visualization.length} widgets</div>
              </div>
              <div className="text-sm text-gray-500">{showVisualizationOpen ? '−' : '+'}</div>
            </button>

            {showVisualizationOpen && (
              <div className="mb-2 pl-4 border-l border-gray-100 dark:border-gray-800">
                <ul className="grid grid-cols-3 gap-3 list-none p-0 m-0">
                  {categories.visualization
                    .filter((w) => w.name.toLowerCase().includes(search.toLowerCase()))
                    .map((widget) => (
                      <SmallWidgetItem key={widget.id} widgetType={widget} />
                    ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;