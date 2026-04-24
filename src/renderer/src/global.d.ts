export {};

declare global {
  interface Window {
    quickflow: {
      versions: {
        chrome: string;
        electron: string;
        node: string;
      };
      openDocument: () => Promise<{ filePath: string; content: string } | null>;
      saveDocument: (payload: {
        filePath: string | null;
        content: string;
        saveAs?: boolean;
      }) => Promise<{ filePath: string } | null>;
      saveBinary: (payload: {
        dataBase64: string;
        defaultPath: string;
        filters?: Array<{ name: string; extensions: string[] }>;
      }) => Promise<{ filePath: string } | null>;
      exportPdfFromSvg: (payload: {
        svg: string;
        defaultPath: string;
        width: number;
        height: number;
      }) => Promise<{ filePath: string } | null>;
      printSvg: (payload: { svg: string }) => Promise<{ success: boolean }>;
      onMenuAction: (
        handler: (
          action:
            | 'file:new'
            | 'file:open'
            | 'file:save'
            | 'file:saveAs'
            | 'file:exportPng'
            | 'file:exportPdf'
            | 'file:print'
        ) => void
      ) => () => void;
    };
  }
}
