import { useState, useEffect, useCallback } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { getDb } from './useDatabase';

interface UpdateState {
  checking: boolean;
  downloading: boolean;
  available: boolean;
  version: string | null;
  currentVersion: string | null;
  progress: number;
  error: string | null;
}

export function useUpdater() {
  const [state, setState] = useState<UpdateState>({
    checking: false,
    downloading: false,
    available: false,
    version: null,
    currentVersion: null,
    progress: 0,
    error: null,
  });
  const [update, setUpdate] = useState<Update | null>(null);

  useEffect(() => {
    getVersion().then((v) =>
      setState((s) => ({ ...s, currentVersion: v }))
    );
  }, []);

  const checkForUpdates = useCallback(async () => {
    setState((s) => ({ ...s, checking: true, error: null }));
    try {
      const db = await getDb();
      const row = await db.select<{ value: string }[]>(
        "SELECT value FROM settings WHERE key = 'device_token'"
      );
      const token = row[0]?.value;
      const headers: Record<string, string> = token
        ? { 'X-Device-Token': token }
        : {};
      const result = await check({ headers });
      if (result) {
        setUpdate(result);
        setState((s) => ({
          ...s,
          checking: false,
          available: true,
          version: result.version,
        }));
      } else {
        setState((s) => ({
          ...s,
          checking: false,
          available: false,
          version: null,
        }));
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const friendly = raw.includes('status code')
        ? 'No updates available yet. Check back later.'
        : raw;
      setState((s) => ({
        ...s,
        checking: false,
        error: friendly,
      }));
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    if (!update) return;
    setState((s) => ({ ...s, downloading: true, progress: 0, error: null }));
    try {
      const db = await getDb();
      const row = await db.select<{ value: string }[]>(
        "SELECT value FROM settings WHERE key = 'device_token'"
      );
      const token = row[0]?.value;
      const headers: Record<string, string> = token
        ? { 'X-Device-Token': token }
        : {};
      let totalLength = 0;
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started' && event.data.contentLength) {
          totalLength = event.data.contentLength;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (totalLength > 0) {
            setState((s) => ({
              ...s,
              progress: Math.round((downloaded / totalLength) * 100),
            }));
          }
        } else if (event.event === 'Finished') {
          setState((s) => ({ ...s, progress: 100 }));
        }
      }, { headers });
      await invoke('relaunch_app');
    } catch (e) {
      setState((s) => ({
        ...s,
        downloading: false,
        error: e instanceof Error ? e.message : String(e),
      }));
    }
  }, [update]);

  const dismiss = useCallback(() => {
    setState((s) => ({ ...s, available: false }));
    setUpdate(null);
  }, []);

  return {
    ...state,
    checkForUpdates,
    downloadAndInstall,
    dismiss,
  };
}
