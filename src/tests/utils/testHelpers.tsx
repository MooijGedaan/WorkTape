import { ReactElement } from "react";
import { render, RenderOptions } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18n from "i18next";

// Create a test i18n instance
const createTestI18n = () => {
  const testI18n = i18n.createInstance();
  testI18n.init({
    lng: "en",
    fallbackLng: "en",
    resources: {
      en: {
        translation: {
          // Add minimal translations needed for tests
        },
      },
    },
  });
  return testI18n;
};

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  i18nInstance?: typeof i18n;
}

export function renderWithI18n(
  ui: ReactElement,
  options?: CustomRenderOptions
) {
  const i18nInstance = options?.i18nInstance || createTestI18n();

  function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <I18nextProvider i18n={i18nInstance}>{children}</I18nextProvider>;
  }

  return render(ui, { wrapper: Wrapper, ...options });
}
