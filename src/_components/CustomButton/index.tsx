import { Button } from "@mui/material";
import { styled } from "@mui/material/styles";

const CustomButton = styled(Button)(() => ({
  // 基本スタイル
  border: "1px solid var(--border-primary)",
  backgroundColor: "var(--surface-primary)",
  color: "var(--text-primary)",
  borderRadius: "12px",
  padding: "6px",
  fontWeight: 600,
  fontSize: "0.875rem",
  textTransform: "none",
  boxShadow: "var(--shadow-sm)",
  backdropFilter: "var(--backdrop-blur)",
  position: "relative",
  overflow: "hidden",
  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",

  // ホバー効果のための疑似要素
  "&::before": {
    content: '""',
    position: "absolute",
    inset: 0,
    background: "var(--accent-gradient)",
    opacity: 0,
    transition: "opacity 0.3s ease",
  },

  "&::after": {
    content: '""',
    position: "absolute",
    inset: 0,
    background: "var(--glass-primary)",
    opacity: 0,
    transition: "opacity 0.2s ease",
  },

  // ホバー状態
  "&:hover": {
    border: "1px solid var(--accent-primary)",
    backgroundColor: "var(--surface-elevated)",
    boxShadow: "var(--shadow-hover)",
    transform: "translateY(-2px)",

    "&::before": {
      opacity: 0.1,
    },

    "&::after": {
      opacity: 0.5,
    },
  },

  // アクティブ状態
  "&:active": {
    transform: "translateY(0)",
    boxShadow: "var(--shadow-active)",
  },

  // フォーカス状態
  "&:focus-visible": {
    outline: "2px solid var(--accent-primary)",
    outlineOffset: "2px",
  },

  // 無効状態
  "&:disabled": {
    backgroundColor: "var(--surface-secondary)",
    color: "var(--text-tertiary)",
    border: "1px solid var(--border-secondary)",
    boxShadow: "none",
    transform: "none",
    cursor: "not-allowed",

    "&::before, &::after": {
      opacity: 0,
    },
  },

  // テキストコンテンツを前面に
  "& .MuiButton-startIcon, & .MuiButton-endIcon, & .MuiButton-label": {
    position: "relative",
    zIndex: 1,
  },

  // バリアント: primary
  "&.variant-primary": {
    backgroundColor: "var(--accent-primary)",
    color: "var(--text-on-accent)",
    border: "1px solid var(--accent-primary)",

    "&:hover": {
      backgroundColor: "var(--accent-secondary)",
      border: "1px solid var(--accent-secondary)",
    },
  },

  // バリアント: secondary
  "&.variant-secondary": {
    backgroundColor: "transparent",
    color: "var(--accent-primary)",
    border: "1px solid var(--accent-primary)",

    "&:hover": {
      backgroundColor: "var(--accent-primary)",
      color: "var(--text-on-accent)",
    },
  },

  // バリアント: danger
  "&.variant-danger": {
    backgroundColor: "var(--error)",
    color: "var(--text-on-accent)",
    border: "1px solid var(--error)",

    "&:hover": {
      backgroundColor: "#dc2626",
      border: "1px solid #dc2626",
    },
  },

  // サイズ: small
  "&.size-small": {
    padding: "8px 16px",
    fontSize: "0.75rem",
    borderRadius: "8px",
  },

  // サイズ: large
  "&.size-large": {
    padding: "16px 32px",
    fontSize: "1rem",
    borderRadius: "16px",
  },
}));

export default CustomButton;