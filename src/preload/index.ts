import { contextBridge } from 'electron';
import { ipcRenderer } from 'electron';

type OpenDocumentResult = { filePath: string; content: string } | null;
type SaveDocumentResult = { filePath: string } | null;
type SaveBinaryResult = { filePath: string } | null;
type PrintResult = { success: boolean };
type MenuAction =
  | 'file:new'
  | 'file:open'
  | 'file:save'
  | 'file:saveAs'
  | 'file:exportPng'
  | 'file:exportPdf'
  | 'file:print';

contextBridge.exposeInMainWorld('quickflow', {
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node
  },
  openDocument: () => ipcRenderer.invoke('quickflow:openDocument') as Promise<OpenDocumentResult>,
  saveDocument: (payload: { filePath: string | null; content: string; saveAs?: boolean }) =>
    ipcRenderer.invoke('quickflow:saveDocument', payload) as Promise<SaveDocumentResult>,
  saveBinary: (payload: {
    dataBase64: string;
    defaultPath: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }) => ipcRenderer.invoke('quickflow:saveBinary', payload) as Promise<SaveBinaryResult>,
  exportPdfFromSvg: (payload: {
    svg: string;
    defaultPath: string;
    width: number;
    height: number;
  }) => ipcRenderer.invoke('quickflow:exportPdfFromSvg', payload) as Promise<SaveBinaryResult>,
  printSvg: (payload: { svg: string }) =>
    ipcRenderer.invoke('quickflow:printSvg', payload) as Promise<PrintResult>,
  onMenuAction: (handler: (action: MenuAction) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: MenuAction) => handler(action);
    ipcRenderer.on('quickflow:menuAction', listener);
    return () => ipcRenderer.removeListener('quickflow:menuAction', listener);
  }
});
