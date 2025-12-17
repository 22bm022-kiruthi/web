import React from 'react';
import { LucideIcon } from 'lucide-react';

interface OrangeStyleWidgetProps {
  icon: LucideIcon;
  label: string;
  statusText?: string;
  statusColor?: 'blue' | 'green' | 'gray' | 'orange';
  mainColor: string; // e.g., '#FF9800'
  lightColor: string; // e.g., '#FFE4CC'
  bgColor: string; // e.g., '#FFF8F0'
  children?: React.ReactNode; // Controls section
  alwaysShowControls?: boolean; // If true, controls are always visible (not hidden until hover)
  iconRef?: React.Ref<HTMLDivElement>;
  portElements?: React.ReactNode;
}

/**
 * Reusable Orange Data Mining style widget container
 * Features:
 * - Clean icon circle with connection ports
 * - Label below icon
 * - Status indicator
 * - Hover-to-show controls
 */
const OrangeStyleWidget: React.FC<OrangeStyleWidgetProps> = ({
  icon: Icon,
  label,
  statusText,
  statusColor = 'gray',
  mainColor,
  lightColor,
  bgColor,
  children,
  alwaysShowControls = false,
  iconRef,
  portElements
}) => {
  const statusColors = {
    blue: 'text-blue-600 bg-blue-50',
    green: 'text-green-600 bg-green-50',
    gray: 'text-gray-400',
    orange: 'text-orange-500'
  };

  return (
    <div
      className="flex flex-col items-center justify-center w-full h-full cursor-default p-3 pointer-events-none"
    >
      {/* Main icon circle - Orange Data Mining style (clean, no dashed border) */}
      {/* Keep pointer-events-none so connection overlay can work */}
      <div className="flex flex-col items-center gap-2 mb-2">
        {/* Single solid circle with icon - cleaner Orange style */}
        <div 
          ref={iconRef}
          className="relative rounded-full flex items-center justify-center"
          style={{
            width: 70,
            height: 70,
            background: mainColor,
            boxShadow: `0 2px 8px ${mainColor}40`
          }}
        >
          <Icon className="h-7 w-7 text-white" strokeWidth={2.5} />
          {portElements}
        </div>
        
        {/* Label below icon - Orange style (only show if label exists) */}
        {label && (
          <div className="text-center">
            <div className="text-[11px] font-semibold text-gray-800">{label}</div>
          </div>
        )}
      </div>

      {/* Compact controls - conditional visibility based on alwaysShowControls prop */}
      {children && (
        <div className={`w-full flex flex-col gap-1.5 transition-opacity duration-200 ${
          alwaysShowControls 
            ? 'opacity-100 pointer-events-auto' 
            : 'opacity-0 hover:opacity-100 pointer-events-none hover:pointer-events-auto'
        }`}>
          {children}
        </div>
      )}
    </div>
  );
};

export default OrangeStyleWidget;
