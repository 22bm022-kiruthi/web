import React, { useState } from 'react';
import { User, Sun, Moon, Folder, LogOut } from 'lucide-react';
import { Theme } from '../types';

interface HeaderProps {
  onToggleTheme: () => void;
  theme: Theme;
  onOpenFiles?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onToggleTheme, theme, onOpenFiles }) => {
  const [showUpload, setShowUpload] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const closeAll = () => { setShowUpload(false); setShowCode(false); };

  // close widgets when clicking elsewhere: simple handler could be added globally later

  return (
    <header className={`h-16 transition-colors duration-300 ${
      theme === 'dark'
        ? 'bg-gray-800 border-gray-700'
        : 'bg-[var(--surface)] border-transparent shadow-soft'
    }`}>
      <div className="flex items-center justify-between h-full px-6">
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-xl transition-colors duration-300 flex items-center justify-center bg-transparent`}>
            {/* Company logo - transparent PNG 'logo_only.png' in public folder */}
            <img src="/logo_final.png" alt="DeepSpectrum logo" className="h-8 w-8 object-contain" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--primary)]">DeepSpectrum</h1>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Spectral Data Analysis</p>
          </div>
        </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={onToggleTheme}
              className={`p-2 rounded-lg transition-all duration-300 hover:scale-105 ${
                theme === 'dark'
                  ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-100'
              }`}
              title="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            <button onClick={() => onOpenFiles && onOpenFiles()} className={`p-2 rounded-lg transition-all duration-300 hover:scale-105 bg-white text-gray-600 border border-gray-100`} title="Files">
              <Folder className="h-5 w-5" />
            </button>

            {/* Upload and Custom Code moved to right-side dock */}

            <a
              href="/login?showLogin=1"
              onClick={(e) => {
                // allow modifier clicks (open in new tab)
                if ((e as any).metaKey || (e as any).ctrlKey || (e as any).shiftKey || (e as any).button === 1) {
                  return;
                }
                e.preventDefault();
                try {
                  window.dispatchEvent(new CustomEvent('openLoginOverlay'));
                  try { window.history.pushState({}, '', '/login?showLogin=1'); } catch (e) {}
                } catch (err) {
                  // ignore
                }
              }}
              className={`p-2 rounded-lg transition-all duration-300 hover:scale-105 bg-white text-gray-600 border border-gray-100 inline-flex items-center justify-center`}
              title="Login"
            >
              <User className="h-5 w-5" />
            </a>

            <button
              title="Sign out"
              onClick={() => {
                try { localStorage.setItem('loggedIn', 'false'); } catch (e) {}
                // reload to let App pick up loggedIn=false
                window.location.reload();
              }}
              className={`p-2 rounded-lg transition-all duration-300 hover:scale-105 bg-white text-gray-600 border border-gray-100`}
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
      </div>
      {/* Files modal is managed by parent (App) via onOpenFiles */}
    </header>
  );
};

export default Header;