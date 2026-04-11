import { WidgetType } from '../types';

export const widgetRegistry: WidgetType[] = [
  { id: 'file-upload', name: 'File Upload', icon: 'Upload', description: 'Upload CSV/XLS files', category: 'input' },
  { id: 'supabase', name: 'Supabase Source', icon: 'Database', description: 'Fetch data from Supabase (raman_data)', category: 'input' },
  { id: 'data-table', name: 'Data Table', icon: 'Database', description: 'View and edit data', category: 'input' },
  { id: 'line-chart', name: 'Line Chart', icon: 'LineChart', description: 'Spectral line visualization', category: 'visualization' },
  { id: 'scatter-plot', name: 'Scatter Plot', icon: 'Scatter3D', description: 'Correlation analysis', category: 'visualization' },
  { id: 'box-plot', name: 'Box Plot', icon: 'Box', description: 'Distribution analysis', category: 'visualization' },
  { id: 'bar-chart', name: 'Bar Chart', icon: 'BarChart3', description: 'Categorical visualization', category: 'visualization' },
  { id: 'mean-average', name: 'Mean Average', icon: 'Calculator', description: 'Statistical processing', category: 'processing' },
  { id: 'noise-filter', name: 'Noise Filter', icon: 'Filter', description: 'Smoothing / denoising', category: 'processing' },
  { id: 'baseline-correction', name: 'Baseline Correction', icon: 'Filter', description: 'Subtract baseline/minimum per column', category: 'processing' },
  { id: 'smoothing', name: 'Smoothing', icon: 'Filter', description: 'Gaussian smoothing for numeric columns', category: 'processing' },
  { id: 'normalization', name: 'Normalization', icon: 'Filter', description: 'Min-Max or Z-score normalization', category: 'processing' },
  { id: 'pca-analysis', name: 'PCA Analysis', icon: 'Search', description: 'Principal Component Analysis', category: 'processing' },
  { id: 'hierarchical-clustering', name: 'Hierarchical Clustering', icon: 'Search', description: 'Agglomerative / Divisive clustering', category: 'processing' },
  { id: 'kmeans-analysis', name: 'KMeans Clustering', icon: 'Scatter3D', description: 'KMeans clustering (unsupervised)', category: 'processing' },
  { id: 'future-extraction', name: 'Future Extraction', icon: 'Filter', description: 'Simple forecasting (linear/naive)', category: 'processing' },
  { id: 'predict', name: 'Predict', icon: 'Shield', description: 'Predict normal/abnormal', category: 'processing' },
  { id: 'spectral-segmentation', name: 'Spectral Segmentation', icon: 'Filter', description: 'K-means or threshold-based segmentation', category: 'processing' },
  { id: 'blank-remover', name: 'Blank Remover', icon: 'Filter', description: 'Data cleaning', category: 'processing' },
  { id: 'custom-code', name: 'Custom Code', icon: 'Code', description: 'Write and execute custom Python code', category: 'processing' },
];

export default widgetRegistry;
