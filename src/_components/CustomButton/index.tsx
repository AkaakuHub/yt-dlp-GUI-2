import { Button } from "@mui/material";
import { styled } from "@mui/material/styles";

const CustomButton = styled(Button)(() => ({
  border: "1px solid #7a7a7a",
  backgroundColor: "#fff",
  color: "#000",
  boxShadow: "none",

  "&:hover": {
    border: "1px solid #0078d4",
    backgroundColor: "#e0eef9",
    boxShadow: "none",
  },
}));

export default CustomButton;