import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Prompt from "./Prompt";
import QuickEntry from "./QuickEntry";
import "./styles/app.css";
import "./i18n/config";

// Determine which component to render based on URL path
const path = window.location.pathname;
const RootComponent = path === '/prompt' ? Prompt : path === '/quick-entry' ? QuickEntry : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
);
