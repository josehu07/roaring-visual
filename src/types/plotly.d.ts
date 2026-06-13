declare module 'plotly.js-dist-min' {
  // Minimal typings — only what the app uses.
  type Data = Record<string, unknown>;
  type Layout = Record<string, unknown>;
  type Config = Record<string, unknown>;

  interface PlotlyStatic {
    newPlot(
      root: HTMLElement,
      data: Data[],
      layout?: Partial<Layout>,
      config?: Partial<Config>,
    ): Promise<void>;
    react(
      root: HTMLElement,
      data: Data[],
      layout?: Partial<Layout>,
      config?: Partial<Config>,
    ): Promise<void>;
    purge(root: HTMLElement): void;
    Plots: {
      resize(root: HTMLElement): void;
    };
  }

  const Plotly: PlotlyStatic;
  export default Plotly;
}
