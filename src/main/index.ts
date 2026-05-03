import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  type FileFilter,
  type OpenDialogOptions,
  type SaveDialogOptions
} from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSvgPreviewHtml, shouldAllowPreviewRequest } from './preview-security';

const isDev = !app.isPackaged;
const QFLOW_FILTER = [{ name: 'Flowmaptool Files', extensions: ['qflow'] }];
const PNG_FILTER = [{ name: 'PNG Image', extensions: ['png'] }];
const PDF_FILTER = [{ name: 'PDF Document', extensions: ['pdf'] }];

async function showSaveDialogWithFocusedWindow(options: SaveDialogOptions) {
  const win = BrowserWindow.getFocusedWindow();
  return win
    ? dialog.showSaveDialog(win, options)
    : dialog.showSaveDialog(options);
}

type MenuAction =
  | 'file:new'
  | 'file:open'
  | 'file:save'
  | 'file:saveAs'
  | 'file:exportPng'
  | 'file:exportPdf'
  | 'file:print';

function sendMenuAction(action: MenuAction) {
  const win = BrowserWindow.getFocusedWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send('flowmaptool:menuAction', action);
}

function normalizeFilePath(filePath: string, extension: string) {
  return filePath.toLowerCase().endsWith(extension) ? filePath : `${filePath}${extension}`;
}

function inferExtension(defaultPath: string, filters?: FileFilter[]) {
  if (defaultPath.toLowerCase().endsWith('.pdf')) return '.pdf';
  if (defaultPath.toLowerCase().endsWith('.png')) return '.png';
  const extensions = (filters || []).flatMap(filter => filter.extensions.map(ext => ext.toLowerCase()));
  if (extensions.includes('pdf')) return '.pdf';
  return '.png';
}

async function createPrintWindowWithSvg(svg: string) {
  const html = createSvgPreviewHtml(svg);
  const previewUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  const printWindow = new BrowserWindow({
    width: 1400,
    height: 1000,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      partition: `preview-${Date.now()}-${Math.random().toString(36).slice(2)}`
    }
  });
  printWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  printWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== previewUrl) {
      event.preventDefault();
    }
  });
  printWindow.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    callback({
      cancel: !shouldAllowPreviewRequest(details.url, previewUrl, details.resourceType)
    });
  });
  await printWindow.loadURL(previewUrl);
  return printWindow;
}

function installApplicationMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => sendMenuAction('file:new') },
        { label: 'Open...', accelerator: 'CmdOrCtrl+O', click: () => sendMenuAction('file:open') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendMenuAction('file:save') },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendMenuAction('file:saveAs')
        },
        { type: 'separator' },
        {
          label: 'Export PNG...',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => sendMenuAction('file:exportPng')
        },
        { label: 'Export PDF...', click: () => sendMenuAction('file:exportPdf') },
        { label: 'Print...', accelerator: 'CmdOrCtrl+P', click: () => sendMenuAction('file:print') },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { role: 'viewMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Node editing', enabled: false },
        { label: 'Edit selected node', accelerator: 'Space', enabled: false },
        { label: 'Add child node', accelerator: 'Tab', enabled: false },
        { label: 'Add sibling node', accelerator: 'Enter', enabled: false },
        { label: 'Delete selected node or edge', accelerator: 'Delete', enabled: false },
        { label: 'Copy selected nodes', accelerator: 'CmdOrCtrl+C', enabled: false },
        { label: 'Paste copied nodes', accelerator: 'CmdOrCtrl+V', enabled: false },
        { label: 'Move sibling up / down: Ctrl+Up / Ctrl+Down', enabled: false },
        { type: 'separator' },
        { label: 'Selection and edges', enabled: false },
        { label: 'Multi-select nodes: Ctrl+Click', enabled: false },
        { label: 'Marquee select: drag empty canvas', enabled: false },
        { label: 'Create manual edge: drag a node handle', enabled: false },
        { label: 'Adjust selected edge route: drag its control point', enabled: false },
        { label: 'Reset selected edge bend: right toolbar Reset Bend', enabled: false },
        { type: 'separator' },
        { label: 'Canvas', enabled: false },
        { label: 'Zoom: Ctrl+Mouse Wheel', enabled: false },
        { label: 'Fit graph to view: right toolbar Fit', enabled: false },
        { label: 'Switch layout: right toolbar Layout', enabled: false }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);
}

function registerIpcHandlers() {
  ipcMain.handle('flowmaptool:openDocument', async () => {
    const testOpenPath = process.env.FLOWMAPTOOL_TEST_OPEN_DOCUMENT_PATH;
    if (testOpenPath) {
      const content = await readFile(testOpenPath, 'utf-8');
      return { filePath: testOpenPath, content };
    }

    const win = BrowserWindow.getFocusedWindow();
    const options: OpenDialogOptions = {
      properties: ['openFile'],
      filters: QFLOW_FILTER
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const content = await readFile(filePath, 'utf-8');
    return { filePath, content };
  });

  ipcMain.handle(
    'flowmaptool:saveDocument',
    async (_event, payload: { filePath: string | null; content: string; saveAs?: boolean }) => {
      const win = BrowserWindow.getFocusedWindow();
      let targetPath = payload.filePath;
      if (!targetPath || payload.saveAs) {
        const options: SaveDialogOptions = {
          filters: QFLOW_FILTER,
          defaultPath: targetPath || 'untitled.qflow'
        };
        const result = win
          ? await dialog.showSaveDialog(win, options)
          : await dialog.showSaveDialog(options);
        if (result.canceled || !result.filePath) return null;
        targetPath = result.filePath.endsWith('.qflow') ? result.filePath : `${result.filePath}.qflow`;
      }

      await writeFile(targetPath, payload.content, 'utf-8');
      return { filePath: targetPath };
    }
  );

  ipcMain.handle(
    'flowmaptool:saveBinary',
    async (
      _event,
      payload: {
        dataBase64: string;
        defaultPath: string;
        filters?: FileFilter[];
      }
    ) => {
      const testSavePath = process.env.FLOWMAPTOOL_TEST_SAVE_BINARY_PATH;
      if (testSavePath) {
        const normalizedPath = normalizeFilePath(
          testSavePath,
          inferExtension(payload.defaultPath, payload.filters)
        );
        const buffer = Buffer.from(payload.dataBase64, 'base64');
        await writeFile(normalizedPath, buffer);
        return { filePath: normalizedPath };
      }
      const result = await showSaveDialogWithFocusedWindow({
        defaultPath: payload.defaultPath,
        filters: payload.filters || PNG_FILTER
      });
      if (result.canceled || !result.filePath) return null;
      const normalizedPath = normalizeFilePath(
        result.filePath,
        inferExtension(payload.defaultPath, payload.filters)
      );
      const buffer = Buffer.from(payload.dataBase64, 'base64');
      await writeFile(normalizedPath, buffer);
      return { filePath: normalizedPath };
    }
  );

  ipcMain.handle(
    'flowmaptool:exportPdfFromSvg',
    async (
      _event,
      payload: {
        svg: string;
        defaultPath: string;
        width: number;
        height: number;
      }
    ) => {
      const result = await showSaveDialogWithFocusedWindow({
        defaultPath: payload.defaultPath,
        filters: PDF_FILTER
      });
      if (result.canceled || !result.filePath) return null;
      const targetPath = normalizeFilePath(result.filePath, '.pdf');
      const printWindow = await createPrintWindowWithSvg(payload.svg);
      try {
        const pdf = await printWindow.webContents.printToPDF({
          printBackground: true,
          landscape: payload.width > payload.height,
          pageSize: 'A4'
        });
        await writeFile(targetPath, pdf);
      } finally {
        if (!printWindow.isDestroyed()) {
          printWindow.destroy();
        }
      }
      return { filePath: targetPath };
    }
  );

  ipcMain.handle(
    'flowmaptool:printSvg',
    async (_event, payload: { svg: string }) => {
      const printWindow = await createPrintWindowWithSvg(payload.svg);
      try {
        const success = await new Promise<boolean>(resolve => {
          printWindow.webContents.print(
            { silent: false, printBackground: true },
            done => resolve(done)
          );
        });
        return { success };
      } finally {
        if (!printWindow.isDestroyed()) {
          printWindow.destroy();
        }
      }
    }
  );
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (isDev && devServerUrl) {
    win.loadURL(devServerUrl);
    if (process.env.FLOWMAPTOOL_OPEN_DEVTOOLS === '1') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
    return;
  }

  win.loadFile(join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  registerIpcHandlers();
  installApplicationMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
