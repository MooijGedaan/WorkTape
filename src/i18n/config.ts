import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import commonEN from './locales/en/common.json';
import worklogEN from './locales/en/worklog.json';
import homeEN from './locales/en/home.json';
import exportEN from './locales/en/export.json';
import notificationsEN from './locales/en/notifications.json';
import aiSummaryEN from './locales/en/aiSummary.json';
import promptEN from './locales/en/prompt.json';
import settingsEN from './locales/en/settings.json';
import sprintboardEN from './locales/en/sprintboard.json';

import commonNL from './locales/nl/common.json';
import worklogNL from './locales/nl/worklog.json';
import homeNL from './locales/nl/home.json';
import exportNL from './locales/nl/export.json';
import notificationsNL from './locales/nl/notifications.json';
import aiSummaryNL from './locales/nl/aiSummary.json';
import promptNL from './locales/nl/prompt.json';
import settingsNL from './locales/nl/settings.json';
import sprintboardNL from './locales/nl/sprintboard.json';

// Define resources
export const resources = {
  en: {
    common: commonEN,
    worklog: worklogEN,
    home: homeEN,
    export: exportEN,
    notifications: notificationsEN,
    aiSummary: aiSummaryEN,
    prompt: promptEN,
    settings: settingsEN,
    sprintboard: sprintboardEN,
  },
  nl: {
    common: commonNL,
    worklog: worklogNL,
    home: homeNL,
    export: exportNL,
    notifications: notificationsNL,
    aiSummary: aiSummaryNL,
    prompt: promptNL,
    settings: settingsNL,
    sprintboard: sprintboardNL,
  },
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'worklog', 'home', 'export', 'notifications', 'aiSummary', 'prompt', 'settings', 'sprintboard'],

    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },

    interpolation: {
      escapeValue: false, // React already escapes values
    },

    react: {
      useSuspense: false, // Disable suspense for Tauri compatibility
    },
  });

export default i18n;
