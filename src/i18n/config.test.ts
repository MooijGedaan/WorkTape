import { describe, it, expect } from "vitest";
import i18n, { resources } from "./config";

describe("i18n configuration", () => {
  it("is initialized", () => {
    expect(i18n.isInitialized).toBe(true);
  });

  it("has English as fallback language", () => {
    const fallback = i18n.options.fallbackLng;
    // Can be string or array
    if (Array.isArray(fallback)) {
      expect(fallback).toContain("en");
    } else {
      expect(fallback).toBe("en");
    }
  });

  it("has common as default namespace", () => {
    expect(i18n.options.defaultNS).toBe("common");
  });

  it("loads all expected namespaces", () => {
    const expectedNamespaces = [
      "common",
      "worklog",
      "home",
      "export",
      "notifications",
      "prompt",
      "settings",
    ];

    expectedNamespaces.forEach((ns) => {
      expect(i18n.options.ns).toContain(ns);
    });
  });

  it("has resources for English", () => {
    expect(resources.en).toBeDefined();
    expect(resources.en.common).toBeDefined();
    expect(resources.en.worklog).toBeDefined();
  });

  it("has resources for Dutch", () => {
    expect(resources.nl).toBeDefined();
    expect(resources.nl.common).toBeDefined();
    expect(resources.nl.worklog).toBeDefined();
  });

  it("has consistent namespace keys across languages", () => {
    const enKeys = Object.keys(resources.en);
    const nlKeys = Object.keys(resources.nl);

    expect(enKeys.sort()).toEqual(nlKeys.sort());
  });

  it("disables React suspense for Tauri compatibility", () => {
    expect(i18n.options.react?.useSuspense).toBe(false);
  });

  it("uses localStorage for language detection", () => {
    expect(i18n.options.detection?.caches).toContain("localStorage");
  });
});
