import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import commonEN from './locales/en/common.json';
import worklogEN from './locales/en/worklog.json';
import homeEN from './locales/en/home.json';
import exportEN from './locales/en/export.json';
import notificationsEN from './locales/en/notifications.json';
import promptEN from './locales/en/prompt.json';
import settingsEN from './locales/en/settings.json';
import sprintboardEN from './locales/en/sprintboard.json';
import calendarEN from './locales/en/calendar.json';
import hintsEN from './locales/en/hints.json';

import commonNL from './locales/nl/common.json';
import worklogNL from './locales/nl/worklog.json';
import homeNL from './locales/nl/home.json';
import exportNL from './locales/nl/export.json';
import notificationsNL from './locales/nl/notifications.json';
import promptNL from './locales/nl/prompt.json';
import settingsNL from './locales/nl/settings.json';
import sprintboardNL from './locales/nl/sprintboard.json';
import calendarNL from './locales/nl/calendar.json';
import hintsNL from './locales/nl/hints.json';

// Define resources
export const resources = {
  en: {
    common: commonEN,
    worklog: worklogEN,
    home: homeEN,
    export: exportEN,
    notifications: notificationsEN,
    prompt: promptEN,
    settings: settingsEN,
    sprintboard: sprintboardEN,
    calendar: calendarEN,
    hints: hintsEN,
  },
  nl: {
    common: commonNL,
    worklog: worklogNL,
    home: homeNL,
    export: exportNL,
    notifications: notificationsNL,
    prompt: promptNL,
    settings: settingsNL,
    sprintboard: sprintboardNL,
    calendar: calendarNL,
    hints: hintsNL,
  },
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'worklog', 'home', 'export', 'notifications', 'prompt', 'settings', 'sprintboard', 'calendar', 'hints'],

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
