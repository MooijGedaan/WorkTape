import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Prompt from "./Prompt";
import "./styles/app.css";

// Determine which component to render based on URL path
const path = window.location.pathname;
const RootComponent = path === '/prompt' ? Prompt : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
);
