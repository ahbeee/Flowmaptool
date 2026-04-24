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
  win.webContents.send('quickflow:menuAction', action);
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

function createSvgPreviewHtml(svg: string) {
  return [
    '<!doctype html>',
    '<html>',
    '<head><meta charset="utf-8"><title>Flowmaptool export</title></head>',
    '<body style="margin:0;background:#fff;display:flex;align-items:center;justify-content:center;">',
    svg,
    '</body>',
    '</html>'
  ].join('');
}

async function createPrintWindowWithSvg(svg: string) {
  const printWindow = new BrowserWindow({
    width: 1400,
    height: 1000,
    show: false,
    webPreferences: {
      sandbox: true
    }
  });
  const html = createSvgPreviewHtml(svg);
  await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
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
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    { role: 'help', submenu: [] }
  ]);
  Menu.setApplicationMenu(menu);
}

function registerIpcHandlers() {
  ipcMain.handle('quickflow:openDocument', async () => {
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
    'quickflow:saveDocument',
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
    'quickflow:saveBinary',
    async (
      _event,
      payload: {
        dataBase64: string;
        defaultPath: string;
        filters?: FileFilter[];
      }
    ) => {
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
    'quickflow:exportPdfFromSvg',
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
    'quickflow:printSvg',
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
    if (process.env.QUICKFLOW_OPEN_DEVTOOLS === '1') {
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
