import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';

export function useTauriEvent(event: string, handler: () => void): void {
  useEffect(() => {
    const unlisten = listen(event, handler);
    return () => {
      unlisten.then(fn => fn());
    };
  }, [event, handler]);
}
