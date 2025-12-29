import type React from "react";
import type SwiperCore from "swiper";
import "./index.css";

interface Props {
	tabNames: string[];
	swiper: SwiperCore | null;
	setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
	activeIndex: number;
}

export function TabComponent({
	tabNames,
	swiper,
	setActiveIndex,
	activeIndex,
}: Props) {
	const handleChange = (newValue: number): void => {
		setActiveIndex(newValue);
		if (swiper) {
			swiper.slideTo(newValue);
		}
	};

	return (
		<div className="tab-component-wrapper">
			<div className="tab-component-buttons">
				{tabNames.map((tabName, index) => (
					<button
						key={tabName}
						className={`tab-component-button ${activeIndex === index ? "active" : ""}`}
						onClick={() => handleChange(index)}
					>
						{tabName}
					</button>
				))}
			</div>
		</div>
	);
}
