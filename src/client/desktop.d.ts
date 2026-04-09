export {};

declare global {
  interface Window {
    desktopBridge?: {
      selectPortfolioRoot: () => Promise<string | undefined>;
      isDesktop: boolean;
    };
  }
}
