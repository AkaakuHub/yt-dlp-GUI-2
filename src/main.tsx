import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import Home from "./Home";
import Setting from "./Setting";

import WindowControls from "./_components/WindowControls";
import { AppProvider } from "./_components/AppContext";

import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { SwiperSlide } from "swiper/react";
import { Swiper } from "swiper/react";
import SwiperCore from "swiper";
import "swiper/css";
import "swiper/css/pagination";

import { TabComponent } from "./_components/TabComponent";

import "./main.css";

const App = () => {
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [swiper, setSwiper] = useState<SwiperCore | null>(null);

  const handleSlideChange = (swiper: SwiperCore): void => {
    setActiveIndex(swiper.activeIndex);
  };

  return (
    <>
      <WindowControls />
      <ToastContainer
        position="top-left"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        draggable
        pauseOnFocusLoss={false}
        pauseOnHover
        theme="light"
        style={{
          top: "84px",
        }}
      />
      <TabComponent
        tabNames={["ホーム", "設定"]}
        swiper={swiper}
        setActiveIndex={setActiveIndex}
        activeIndex={activeIndex}
      />
      <div className="body-wrapper">
        <Swiper
          spaceBetween={0}
          slidesPerView={1}
          onSwiper={setSwiper}
          onSlideChange={handleSlideChange}
          preventClicks={false}
          preventClicksPropagation={false}
          simulateTouch={false}
          style={{
            display: "flex",
            height: "calc(100vh - 89px)",
            margin: "0 4px 4px 4px",
          }}
        >
          <SwiperSlide>
            <Home />
          </SwiperSlide>
          <SwiperSlide>
            <Setting />
          </SwiperSlide>
        </Swiper>
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>
);
