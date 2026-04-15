import { Activity, Eraser, Eye, Filter, Grid3x3, LayoutGrid, Pencil, Sparkles, TrendingUp } from "lucide-react";

export const menuItems = {
  File: ["New", "Open", "Save", "Save As...", "Exit"],
  Edit: ["Undo", "Redo", "Copy", "Paste", "Delete"],
  View: ["Zoom In", "Zoom Out", "Reset Zoom", "Full Screen"],
  Widget: ["Add Widget", "Remove Widget", "Configure"],
  Window: ["Minimize", "Maximize", "Close"],
  Options: ["Preferences", "Settings"],
  Help: ["Documentation", "About"],

  tools: [
    { icon: Pencil, label: ['Windowing'] },
    { icon: LayoutGrid, label: ['Mean Average'] },
    { icon: Filter, label: ['Noise Filter'] },
    { icon: TrendingUp, label: ['Baseline Correction']},
    { icon: Activity, label: ['Smoothing'] },
    { icon: Eye, label: ['Normalization']},
    { icon: Sparkles, label: ['Feature Extraction'] },
    { icon: Grid3x3, label: ['Spectral Segmentation'] },
    { icon: Eraser, label: ['Blank Remover'] }
  ]


  
};
