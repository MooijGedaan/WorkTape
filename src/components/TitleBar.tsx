import { getCurrentWindow } from '@tauri-apps/api/window';
import { MinusIcon, XMarkIcon } from './icons';

const appWindow = getCurrentWindow();

export function TitleBar() {
  const handleMinimize = () => {
    appWindow.minimize();
  };

  const handleMaximize = () => {
    appWindow.toggleMaximize();
  };

  const handleClose = () => {
    appWindow.close();
  };

  return (
    <div className="flex h-8 items-center justify-between dark:bg-zinc-900 select-none">
      {/* Left side - App name */}
      <div className="flex items-center px-3" data-tauri-drag-region>
        <span className="text-xs font-semibold text-zinc-950 dark:text-white">
          WorkRecall
        </span>
      </div>

      {/* Draggable region */}
      <div data-tauri-drag-region className="flex-1 h-full" />

      {/* Right side - Window controls */}
      <div className="flex items-center">
        <button
          onClick={handleMinimize}
          className="h-8 w-10 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Minimize"
        >
          <MinusIcon className="h-3 w-3" />
        </button>
        <button
          onClick={handleMaximize}
          className="h-8 w-10 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Maximize"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 12 12" stroke="currentColor">
            <rect x="1" y="1" width="10" height="10" strokeWidth="1" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="h-8 w-10 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
          aria-label="Close"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
