/**
 * Orange Data Mining Style - Widget Color Schemes
 * Each widget type has consistent colors matching Orange software
 */

export interface WidgetColors {
  main: string;      // Primary color for icon circle
  light: string;     // Light color for dashed border
  bg: string;        // Background color
  accent: string;    // Accent color for highlights
}

export const WIDGET_COLORS: Record<string, WidgetColors> = {
  // ALL WIDGETS - Light Blue
  'supabase': {
    main: '#2196F3',
    light: '#BBDEFB',
    bg: '#E3F2FD',
    accent: '#2196F3'
  },
  'file-upload': {
    main: '#2196F3',
    light: '#BBDEFB',
    bg: '#E3F2FD',
    accent: '#2196F3'
  },
  
  // PROCESSING - Light Blue
  'noise-filter': {
    main: '#2196F3',
    light: '#BBDEFB',
    bg: '#E3F2FD',
    accent: '#2196F3'
  },
  'baseline-correction': {
    main: '#2196F3',
    light: '#BBDEFB',
    bg: '#E3F2FD',
    accent: '#2196F3'
  },
  'smoothing': {
    main: '#2196F3',
    light: '#BBDEFB',
    bg: '#E3F2FD',
    accent: '#2196F3'
  },
  'normalization': {
    main: '#2196F3',
    light: '#BBDEFB',
    bg: '#E3F2FD',
    accent: '#2196F3'
  },
  'pca-analysis': {
    main: '#2196F3',
    light: '#BBDEFB',
    bg: '#E3F2FD',
    accent: '#2196F3'
  },
  'kmeans-analysis': {
    main: '#1e88e5',
    light: '#BBDEFB',
    bg: '#E3F2FD',
    accent: '#1e88e5'
  },
  'blank-remover': {
    main: '#2196F3',
    light: '#BBDEFB',
    bg: '#E3F2FD',
    accent: '#2196F3'
  },
  
  // VISUALIZATION - Light Blue
  'line-chart': {
    main: '#2196F3',
    light: '#BBDEFB',
    bg: '#E3F2FD',
    accent: '#2196F3'
  },
  'scatter-plot': {
    main: '#2196F3',
    light: '#BBDEFB',
    bg: '#E3F2FD',
    accent: '#2196F3'
  },
  'bar-chart': {
    main: '#2196F3',
    light: '#BBDEFB',
    bg: '#E3F2FD',
    accent: '#2196F3'
  },
  'box-plot': {
    main: '#2196F3',
    light: '#BBDEFB',
    bg: '#E3F2FD',
    accent: '#2196F3'
  },
  'data-table': {
    main: '#2196F3',
    light: '#BBDEFB',
    bg: '#E3F2FD',
    accent: '#2196F3'
  },
  
  // ANALYSIS - Light Blue
  'custom-code': {
    main: '#2196F3',
    light: '#BBDEFB',
    bg: '#E3F2FD',
    accent: '#2196F3'
  },
  'mean-average': {
    main: '#2196F3',
    light: '#BBDEFB',
    bg: '#E3F2FD',
    accent: '#2196F3'
  },
  'peak-detection': {
    main: '#2196F3',
    light: '#BBDEFB',
    bg: '#E3F2FD',
    accent: '#2196F3'
  },
  
  // SPECIAL - Light Blue
  'spectral-segmentation': {
    main: '#2196F3',
    light: '#BBDEFB',
    bg: '#E3F2FD',
    accent: '#2196F3'
  },
  'future-extraction': {
    main: '#2196F3',
    light: '#BBDEFB',
    bg: '#E3F2FD',
    accent: '#2196F3'
  }
};

/**
 * Get colors for a widget type
 * Falls back to gray if type not found
 */
export function getWidgetColors(widgetType: string): WidgetColors {
  return WIDGET_COLORS[widgetType] || {
    main: '#607D8B',
    light: '#CFD8DC',
    bg: '#ECEFF1',
    accent: '#607D8B'
  };
}

/**
 * Widget labels matching Orange Data Mining naming
 */
export const WIDGET_LABELS: Record<string, string> = {
  'supabase': 'Datasets',
  'file-upload': 'File',
  'noise-filter': 'Noise Filter',
  'baseline-correction': 'Baseline',
  'smoothing': 'Smooth',
  'normalization': 'Normalize',
  'blank-remover': 'Select',
  'line-chart': 'Line Plot',
  'scatter-plot': 'Scatter',
  'bar-chart': 'Bar Plot',
  'box-plot': 'Box Plot',
  'data-table': 'Data Table',
  'custom-code': 'Python Script',
  'mean-average': 'Mean Average',
  'pca-analysis': 'PCA',
  'kmeans-analysis': 'KMeans',
  'peak-detection': 'Peaks',
  'spectral-segmentation': 'Segment',
  'future-extraction': 'Extract'
};

export function getWidgetLabel(widgetType: string): string {
  return WIDGET_LABELS[widgetType] || widgetType;
}

/**
 * Get category for a widget type (for Orange theme styling)
 */
export function getWidgetCategory(widgetType: string): 'data' | 'processing' | 'analysis' | 'visualization' | 'utility' {
  const dataTypes = ['supabase', 'file-upload'];
  const processingTypes = ['noise-filter', 'baseline-correction', 'smoothing', 'normalization', 'blank-remover', 'pca-analysis', 'kmeans-analysis'];
  const analysisTypes = ['custom-code', 'mean-average', 'peak-detection'];
  const visualizationTypes = ['line-chart', 'scatter-plot', 'bar-chart', 'box-plot', 'data-table'];
  
  if (dataTypes.includes(widgetType)) return 'data';
  if (processingTypes.includes(widgetType)) return 'processing';
  if (analysisTypes.includes(widgetType)) return 'analysis';
  if (visualizationTypes.includes(widgetType)) return 'visualization';
  return 'utility';
}
