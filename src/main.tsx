import React from "react"
import ReactDOM from "react-dom/client"
import { HashRouter as Router, Route, Routes } from "react-router-dom"
import Home from "./Home"
import Setting from "./Setting"

import WindowControls from "./_components/WindowControls"

import "./main.css";

const App = (Element: JSX.Element) => {
  return (
    <>
      <WindowControls />
      {Element}
    </>
  )
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Router>
      <Routes>
        <Route path="/" element={App(<Home />)} />
        <Route path="/setting" element={App(<Setting />)} />
      </Routes>
    </Router>
  </React.StrictMode>
)
