import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { LanguageSelector } from "./LanguageSelector";
import { renderWithI18n } from "../tests/utils/testHelpers";

describe("LanguageSelector", () => {
  it("renders language selector with options", () => {
    renderWithI18n(<LanguageSelector />);

    // Check if the label is present
    expect(screen.getByText("Language / Taal")).toBeInTheDocument();

    // Check if language options are present
    expect(screen.getByRole("option", { name: "English" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Nederlands" })
    ).toBeInTheDocument();
  });
});
