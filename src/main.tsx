import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter as Router, Route, Routes } from "react-router-dom";
import Home from "./Home";
import Setting from "./Setting";

import WindowControls from "./_components/WindowControls";
import { AppProvider } from "./_lib/AppContext";

import "./main.css";

const App = () => {
  return (
    <>
      <WindowControls />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/setting" element={<Setting />} />
      </Routes>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Router>
      <AppProvider>
        <App />
      </AppProvider>
    </Router>
  </React.StrictMode>
);
