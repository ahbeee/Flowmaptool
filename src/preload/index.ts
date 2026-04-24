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

contextBridge.exposeInMainWorld('flowmaptool', {
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node
  },
  openDocument: () => ipcRenderer.invoke('flowmaptool:openDocument') as Promise<OpenDocumentResult>,
  saveDocument: (payload: { filePath: string | null; content: string; saveAs?: boolean }) =>
    ipcRenderer.invoke('flowmaptool:saveDocument', payload) as Promise<SaveDocumentResult>,
  saveBinary: (payload: {
    dataBase64: string;
    defaultPath: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }) => ipcRenderer.invoke('flowmaptool:saveBinary', payload) as Promise<SaveBinaryResult>,
  exportPdfFromSvg: (payload: {
    svg: string;
    defaultPath: string;
    width: number;
    height: number;
  }) => ipcRenderer.invoke('flowmaptool:exportPdfFromSvg', payload) as Promise<SaveBinaryResult>,
  printSvg: (payload: { svg: string }) =>
    ipcRenderer.invoke('flowmaptool:printSvg', payload) as Promise<PrintResult>,
  onMenuAction: (handler: (action: MenuAction) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: MenuAction) => handler(action);
    ipcRenderer.on('flowmaptool:menuAction', listener);
    return () => ipcRenderer.removeListener('flowmaptool:menuAction', listener);
  }
});
