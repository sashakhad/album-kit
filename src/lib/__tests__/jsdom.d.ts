declare module 'jsdom' {
  export class VirtualConsole {
    on(event: 'jsdomError', handler: (error: unknown) => void): void;
  }

  export class JSDOM {
    window: Window & typeof globalThis;

    constructor(
      html: string,
      options?: {
        url?: string;
        runScripts?: 'dangerously';
        pretendToBeVisual?: boolean;
        virtualConsole?: VirtualConsole;
        beforeParse?: (window: Window & typeof globalThis) => void;
      }
    );
  }
}
