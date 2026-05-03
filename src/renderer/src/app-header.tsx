import React from 'react';
import type { TabDocument } from './document-state';
import { basename } from './export-utils';

type AppHeaderProps = {
  tabs: TabDocument[];
  activeTabId: string;
  outlineVisible: boolean;
  taskTableVisible: boolean;
  toolbarVisible: boolean;
  onNewTab: () => void;
  onCloseTab: (tabId: string) => void;
  onSwitchTab: (tabId: string) => void;
  onToggleOutline: () => void;
  onToggleTaskTable: () => void;
  onToggleToolbar: () => void;
};

export function AppHeader({
  tabs,
  activeTabId,
  outlineVisible,
  taskTableVisible,
  toolbarVisible,
  onNewTab,
  onCloseTab,
  onSwitchTab,
  onToggleOutline,
  onToggleTaskTable,
  onToggleToolbar
}: AppHeaderProps) {
  return (
    <header className="tabs-header">
      <div className="tabs-strip">
        {tabs.map(tab => {
          const active = tab.id === activeTabId;
          const label = tab.currentFilePath ? basename(tab.currentFilePath) : tab.title;
          return (
            <div key={tab.id} className={active ? 'tab-item tab-item-active' : 'tab-item'}>
              <button type="button" className="tab-switch" onClick={() => onSwitchTab(tab.id)}>
                {label}
                {tab.isDirty ? <span className="tab-dirty-dot" /> : null}
              </button>
              {tabs.length > 1 ? (
                <button type="button" className="tab-close" onClick={() => onCloseTab(tab.id)}>
                  x
                </button>
              ) : null}
            </div>
          );
        })}
        <button type="button" className="tab-add" onClick={onNewTab}>
          +
        </button>
      </div>
      <div className="header-actions">
        <button
          type="button"
          className="outline-toggle-btn"
          data-testid="outline-toggle"
          onClick={onToggleOutline}
          title={outlineVisible ? 'Hide outline' : 'Show outline'}
        >
          {outlineVisible ? '☰' : '☷'}
        </button>
        <button
          type="button"
          className="task-toggle-btn"
          data-testid="task-toggle"
          onClick={onToggleTaskTable}
          title={taskTableVisible ? 'Hide task table' : 'Show task table'}
        >
          Task Table
        </button>
        <button
          type="button"
          className="toolbar-toggle-btn"
          onClick={onToggleToolbar}
          title={toolbarVisible ? 'Hide toolbar' : 'Show toolbar'}
        >
          {toolbarVisible ? '▧' : '▨'}
        </button>
      </div>
    </header>
  );
}

type FileStatusProps = {
  message: string;
};

export function FileStatus({ message }: FileStatusProps) {
  if (message === 'Ready') return null;
  const className =
    message.includes('failed') || message.includes('blocked') ? 'file-status file-status-error' : 'file-status';
  return (
    <div className={className} data-testid="file-status" role="status">
      {message}
    </div>
  );
}
