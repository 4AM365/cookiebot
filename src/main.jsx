import React from "react";
import { createRoot } from "react-dom/client";
import CookieBuildSheet from "../cookie-build-sheet.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <CookieBuildSheet />
  </React.StrictMode>
);
