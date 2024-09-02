import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import SwiperCore from "swiper";

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
  const handleChange = (
    _event: React.ChangeEvent<object>,
    newValue: number,
  ): void => {
    setActiveIndex(newValue);
    if (swiper) {
      swiper.slideTo(newValue);
    }
  };

  return (
    <Tabs value={activeIndex} onChange={handleChange} variant="fullWidth"
      sx={{
        backgroundColor: "#fafafa",
        borderBottom: "1px solid #e0e0e0",
      }}
    >
      {tabNames.map((tabName, index) => {
        return <Tab key={index} label={tabName} />;
      })}
    </Tabs>
  );
}