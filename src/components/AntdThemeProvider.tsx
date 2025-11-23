import { ConfigProvider, theme } from "antd";
import { PropsWithChildren } from "react";
import { useMemo } from "react";

export const AntdThemeProvider = ({ children }: PropsWithChildren) => {
  const { token } = theme.useToken();
  const appTheme = useMemo(() => {
    return {
      clearButton: {
        color: token.colorError,
        borderColor: token.colorError,
        hoverColor: "#ff7875",
        disabledColor: "rgba(255, 255, 255, 0.85)",
        disabledBorder: "rgba(255, 255, 255, 0.45)",
      },
    };
  }, [token.colorError]);

  return (
    <>
      <style>
        {`
          .clear-btn {
            color: ${appTheme.clearButton.color};
            border-color: ${appTheme.clearButton.borderColor};
            background: transparent;
          }
          .clear-btn:hover {
            color: ${appTheme.clearButton.hoverColor};
            border-color: ${appTheme.clearButton.hoverColor};
          }
          .clear-btn.ant-btn-disabled {
            color: ${appTheme.clearButton.disabledColor};
            border-color: ${appTheme.clearButton.disabledBorder};
            background: transparent;
            opacity: 0.9;
          }
        `}
      </style>
      {children}
    </>
  );
};