import React from 'react';
import type { EdgeLineType, EdgeStyle, FlowTag, FlowSettings, NodeShape, NodeStyle, TextAlign } from '@shared/graph';
import type { LayoutDirection } from '@shared/layout';
import {
  COLOR_SWATCHES,
  EDGE_LINE_TYPES,
  EDGE_WIDTHS,
  FONT_FAMILIES,
  FONT_SIZES,
  MIXED_OPTION,
  NODE_SHAPES,
  SPACING_MAX,
  SPACING_MIN,
  THEMES
} from './ui-config';
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE } from './node-style';
import type { SelectedEdgeStyleSummary, SelectedNodeStyleSummary } from './selection-style';

type ToolbarPanelProps = {
  hasNodeSelection: boolean;
  hasEdgeSelection: boolean;
  selectedNodeCount: number;
  selectedStyleEdgeCount: number;
  nodeStyleSummary: SelectedNodeStyleSummary;
  edgeStyleSummary: SelectedEdgeStyleSummary;
  settings: FlowSettings;
  layoutDirection: LayoutDirection;
  themeEdgeColor: string;
  canResetSelectedEdgeBend: boolean;
  newTagColor: string;
  onApplyTheme: (themeId: string) => void;
  onSwitchLayoutDirection: (direction: LayoutDirection) => void;
  onApplySpacing: (key: 'horizontal' | 'vertical', value: number) => void;
  onSetDefaultShape: (shape: NodeShape) => void;
  onApplyDefaultEdgeStyle: (patch: EdgeStyle) => void;
  onFitCanvasToView: () => void;
  onResetSelectedEdgeBend: () => void;
  onApplySelectedNodeStyle: (patch: NodeStyle) => void;
  onApplySelectedEdgeStyle: (patch: EdgeStyle) => void;
  onSetNewTagColor: (color: string) => void;
  onAddCustomTag: () => void;
  onRenameTag: (tag: FlowTag, name: string) => void;
  onRemoveTag: (tagId: string) => void;
  onClearSelectedNodeStyle: () => void;
};

export function ToolbarPanel(props: ToolbarPanelProps) {
  return (
    <aside className="right-toolbar-rail">
      <div className="right-toolbar right-toolbar-vertical">
        {props.hasNodeSelection ? (
          <NodeToolbar {...props} />
        ) : props.hasEdgeSelection ? (
          <EdgeToolbar {...props} />
        ) : (
          <MapToolbar {...props} />
        )}
      </div>
    </aside>
  );
}

function ColorDropdown({
  label,
  value,
  fallback,
  mixed,
  onSelect
}: {
  label: string;
  value: string | '';
  fallback: string;
  mixed: boolean;
  onSelect: (color: string) => void;
}) {
  const displayColor = value || fallback;
  return (
    <div className="toolbar-field">
      <span>{label}</span>
      <details className="color-dropdown">
        <summary aria-label={label}>
          <span
            className={mixed ? 'color-preview color-preview-mixed' : 'color-preview'}
            style={mixed ? undefined : { backgroundColor: displayColor }}
          />
          <span className="color-dropdown-label">{mixed ? 'Mixed' : displayColor.toUpperCase()}</span>
        </summary>
        <div className="color-swatch-grid" role="group" aria-label={`${label} options`}>
          {COLOR_SWATCHES.map(color => {
            const active = !mixed && displayColor.toLowerCase() === color.toLowerCase();
            return (
              <button
                key={color}
                type="button"
                className={active ? 'color-swatch color-swatch-active' : 'color-swatch'}
                style={{ backgroundColor: color }}
                aria-label={`${label} ${color}`}
                onClick={event => {
                  onSelect(color);
                  event.currentTarget.closest('details')?.removeAttribute('open');
                }}
              />
            );
          })}
        </div>
      </details>
    </div>
  );
}

function EdgeStyleControls({
  title,
  edgeCount,
  widthValue,
  widthMixed,
  lineTypeValue,
  lineTypeMixed,
  colorValue,
  colorMixed,
  fallback,
  onPatch
}: {
  title: string;
  edgeCount: number;
  widthValue: number | '';
  widthMixed: boolean;
  lineTypeValue: EdgeLineType | '';
  lineTypeMixed: boolean;
  colorValue: string | '';
  colorMixed: boolean;
  fallback: Required<EdgeStyle>;
  onPatch: (patch: EdgeStyle) => void;
}) {
  return (
    <div className="edge-style-controls">
      <div className="toolbar-section-title">
        {title}
        {edgeCount > 0 ? ` (${edgeCount})` : ''}
      </div>
      <label className="toolbar-field">
        <span>Line Width</span>
        <select
          value={widthMixed ? MIXED_OPTION : String(widthValue || fallback.width)}
          onChange={event => {
            if (event.target.value === MIXED_OPTION) return;
            onPatch({ width: Number(event.target.value) });
          }}
        >
          {widthMixed ? (
            <option value={MIXED_OPTION} disabled>
              Mixed
            </option>
          ) : null}
          {EDGE_WIDTHS.map(width => (
            <option key={width} value={width}>
              {width}px
            </option>
          ))}
        </select>
      </label>
      <label className="toolbar-field">
        <span>Line Type</span>
        <select
          value={lineTypeMixed ? MIXED_OPTION : lineTypeValue || fallback.lineType}
          onChange={event => {
            if (event.target.value === MIXED_OPTION) return;
            onPatch({ lineType: event.target.value as EdgeLineType });
          }}
        >
          {lineTypeMixed ? (
            <option value={MIXED_OPTION} disabled>
              Mixed
            </option>
          ) : null}
          {EDGE_LINE_TYPES.map(lineType => (
            <option key={lineType.value} value={lineType.value}>
              {lineType.label}
            </option>
          ))}
        </select>
      </label>
      <ColorDropdown
        label="Line Color"
        value={colorValue}
        fallback={fallback.color}
        mixed={colorMixed}
        onSelect={color => onPatch({ color })}
      />
    </div>
  );
}

function getEdgeFallback(settings: FlowSettings, themeEdgeColor: string): Required<EdgeStyle> {
  return {
    width: settings.defaultEdgeStyle.width || 2,
    lineType: settings.defaultEdgeStyle.lineType || 'solid',
    color: settings.defaultEdgeStyle.color || themeEdgeColor
  };
}

function MapToolbar({
  settings,
  layoutDirection,
  themeEdgeColor,
  canResetSelectedEdgeBend,
  onApplyTheme,
  onSwitchLayoutDirection,
  onApplySpacing,
  onSetDefaultShape,
  onApplyDefaultEdgeStyle,
  onFitCanvasToView,
  onResetSelectedEdgeBend
}: ToolbarPanelProps) {
  const edgeFallback = getEdgeFallback(settings, themeEdgeColor);
  return (
    <>
      <div className="toolbar-title">Mind Map Style</div>
      <label className="toolbar-field">
        <span>Theme</span>
        <select value={settings.themeId} onChange={event => onApplyTheme(event.target.value)}>
          {Object.entries(THEMES).map(([id, theme]) => (
            <option key={id} value={id}>
              {theme.label}
            </option>
          ))}
        </select>
      </label>
      <label className="toolbar-field">
        <span>Layout</span>
        <select
          value={layoutDirection}
          onChange={event => onSwitchLayoutDirection(event.target.value as LayoutDirection)}
        >
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </select>
      </label>
      <label className="toolbar-field">
        <span>Horizontal Gap</span>
        <input
          type="number"
          min={SPACING_MIN}
          max={SPACING_MAX}
          value={settings.spacing.horizontal}
          onChange={event => onApplySpacing('horizontal', Number(event.target.value))}
        />
      </label>
      <label className="toolbar-field">
        <span>Vertical Gap</span>
        <input
          type="number"
          min={SPACING_MIN}
          max={SPACING_MAX}
          value={settings.spacing.vertical}
          onChange={event => onApplySpacing('vertical', Number(event.target.value))}
        />
      </label>
      <label className="toolbar-field">
        <span>Default Shape</span>
        <select value={settings.defaultShape} onChange={event => onSetDefaultShape(event.target.value as NodeShape)}>
          {NODE_SHAPES.map(shape => (
            <option key={shape.value} value={shape.value}>
              {shape.label}
            </option>
          ))}
        </select>
      </label>
      <EdgeStyleControls
        title="Default Line"
        edgeCount={0}
        widthValue={edgeFallback.width}
        widthMixed={false}
        lineTypeValue={edgeFallback.lineType}
        lineTypeMixed={false}
        colorValue={edgeFallback.color}
        colorMixed={false}
        fallback={edgeFallback}
        onPatch={onApplyDefaultEdgeStyle}
      />
      <div className="toolbar-button-row">
        <button type="button" onClick={onFitCanvasToView} aria-label="Fit" title="Fit graph to visible canvas">
          Fit
        </button>
        <button
          type="button"
          onClick={onResetSelectedEdgeBend}
          aria-label="Reset Bend"
          title="Reset selected line route"
          disabled={!canResetSelectedEdgeBend}
        >
          Reset Bend
        </button>
      </div>
    </>
  );
}

function NodeToolbar({
  selectedNodeCount,
  selectedStyleEdgeCount,
  nodeStyleSummary,
  edgeStyleSummary,
  settings,
  themeEdgeColor,
  canResetSelectedEdgeBend,
  newTagColor,
  onApplySelectedNodeStyle,
  onApplySelectedEdgeStyle,
  onSetNewTagColor,
  onAddCustomTag,
  onRenameTag,
  onRemoveTag,
  onClearSelectedNodeStyle
}: ToolbarPanelProps) {
  const edgeFallback = getEdgeFallback(settings, themeEdgeColor);
  return (
    <>
      <div className="toolbar-title">Node Style</div>
      <div className="toolbar-subtitle">{selectedNodeCount} selected</div>
      <label className="toolbar-field">
        <span>Font</span>
        <select
          value={
            nodeStyleSummary.selectedFontFamilyMixed
              ? MIXED_OPTION
              : nodeStyleSummary.selectedFontFamily || DEFAULT_FONT_FAMILY
          }
          onChange={event => {
            if (event.target.value === MIXED_OPTION) return;
            onApplySelectedNodeStyle({ fontFamily: event.target.value });
          }}
        >
          {nodeStyleSummary.selectedFontFamilyMixed ? (
            <option value={MIXED_OPTION} disabled>
              Mixed
            </option>
          ) : null}
          {FONT_FAMILIES.map(font => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
      </label>
      <label className="toolbar-field">
        <span>Size</span>
        <select
          value={
            nodeStyleSummary.selectedFontSizeMixed
              ? MIXED_OPTION
              : String(nodeStyleSummary.selectedFontSize || DEFAULT_FONT_SIZE)
          }
          onChange={event => {
            if (event.target.value === MIXED_OPTION) return;
            onApplySelectedNodeStyle({ fontSize: Number(event.target.value) });
          }}
        >
          {nodeStyleSummary.selectedFontSizeMixed ? (
            <option value={MIXED_OPTION} disabled>
              Mixed
            </option>
          ) : null}
          {FONT_SIZES.map(size => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <div className="toolbar-toggle-row">
        <button
          type="button"
          aria-label="Bold"
          title="Bold"
          className={
            nodeStyleSummary.isAllBold ? 'mode-btn-active' : nodeStyleSummary.hasMixedBold ? 'mode-btn-mixed' : ''
          }
          onClick={() => onApplySelectedNodeStyle({ bold: !nodeStyleSummary.isAllBold })}
        >
          B
        </button>
        <button
          type="button"
          aria-label="Italic"
          title="Italic"
          className={
            nodeStyleSummary.isAllItalic ? 'mode-btn-active' : nodeStyleSummary.hasMixedItalic ? 'mode-btn-mixed' : ''
          }
          onClick={() => onApplySelectedNodeStyle({ italic: !nodeStyleSummary.isAllItalic })}
        >
          I
        </button>
        <button
          type="button"
          aria-label="Underline"
          title="Underline"
          className={
            nodeStyleSummary.isAllUnderline
              ? 'mode-btn-active'
              : nodeStyleSummary.hasMixedUnderline
                ? 'mode-btn-mixed'
                : ''
          }
          onClick={() => onApplySelectedNodeStyle({ underline: !nodeStyleSummary.isAllUnderline })}
        >
          U
        </button>
      </div>
      <div className="toolbar-toggle-row">
        {(['left', 'center', 'right'] as TextAlign[]).map(align => (
          <button
            key={align}
            type="button"
            aria-label={align === 'left' ? 'Align Left' : align === 'center' ? 'Align Center' : 'Align Right'}
            title={align === 'left' ? 'Align Left' : align === 'center' ? 'Align Center' : 'Align Right'}
            className={nodeStyleSummary.selectedTextAlign === align ? 'mode-btn-active' : ''}
            onClick={() => onApplySelectedNodeStyle({ textAlign: align })}
          >
            {align[0].toUpperCase()}
          </button>
        ))}
      </div>
      <ColorDropdown
        label="Text Color"
        value={nodeStyleSummary.selectedTextColor}
        fallback="#0f172a"
        mixed={nodeStyleSummary.selectedTextColorMixed}
        onSelect={color => onApplySelectedNodeStyle({ textColor: color })}
      />
      <ColorDropdown
        label="Node Color"
        value={nodeStyleSummary.selectedBackgroundColor}
        fallback="#ffffff"
        mixed={nodeStyleSummary.selectedBackgroundColorMixed}
        onSelect={color => onApplySelectedNodeStyle({ backgroundColor: color })}
      />
      <label className="toolbar-field">
        <span>Shape</span>
        <select
          value={
            nodeStyleSummary.selectedShapeMixed ? MIXED_OPTION : nodeStyleSummary.selectedShape || settings.defaultShape
          }
          onChange={event => {
            if (event.target.value === MIXED_OPTION) return;
            onApplySelectedNodeStyle({ shape: event.target.value as NodeShape });
          }}
        >
          {nodeStyleSummary.selectedShapeMixed ? (
            <option value={MIXED_OPTION} disabled>
              Mixed
            </option>
          ) : null}
          {NODE_SHAPES.map(shape => (
            <option key={shape.value} value={shape.value}>
              {shape.label}
            </option>
          ))}
        </select>
      </label>
      {selectedStyleEdgeCount > 0 ? (
        <EdgeStyleControls
          title="Related Lines"
          edgeCount={selectedStyleEdgeCount}
          widthValue={edgeStyleSummary.selectedEdgeWidth}
          widthMixed={edgeStyleSummary.selectedEdgeWidthMixed}
          lineTypeValue={edgeStyleSummary.selectedEdgeLineType}
          lineTypeMixed={edgeStyleSummary.selectedEdgeLineTypeMixed}
          colorValue={edgeStyleSummary.selectedEdgeColor}
          colorMixed={edgeStyleSummary.selectedEdgeColorMixed}
          fallback={edgeFallback}
          onPatch={onApplySelectedEdgeStyle}
        />
      ) : null}
      <TagList
        tags={settings.tags}
        newTagColor={newTagColor}
        onApplyTag={tagId => onApplySelectedNodeStyle({ tagId })}
        onSetNewTagColor={onSetNewTagColor}
        onAddCustomTag={onAddCustomTag}
        onRenameTag={onRenameTag}
        onRemoveTag={onRemoveTag}
      />
      <button type="button" onClick={onClearSelectedNodeStyle}>
        Reset Node Style
      </button>
    </>
  );
}

function TagList({
  tags,
  newTagColor,
  onApplyTag,
  onSetNewTagColor,
  onAddCustomTag,
  onRenameTag,
  onRemoveTag
}: {
  tags: FlowTag[];
  newTagColor: string;
  onApplyTag: (tagId: string) => void;
  onSetNewTagColor: (color: string) => void;
  onAddCustomTag: () => void;
  onRenameTag: (tag: FlowTag, name: string) => void;
  onRemoveTag: (tagId: string) => void;
}) {
  return (
    <div className="tag-list">
      <div className="tag-list-create">
        <span>Tag Color</span>
        <details className="color-dropdown tag-color-picker">
          <summary aria-label="New tag color">
            <span className="color-preview" style={{ backgroundColor: newTagColor }} />
            <span className="color-dropdown-label">{newTagColor.toUpperCase()}</span>
          </summary>
          <div className="color-swatch-grid" role="group" aria-label="New tag color options">
            {COLOR_SWATCHES.map(color => (
              <button
                key={color}
                type="button"
                className={
                  newTagColor.toLowerCase() === color.toLowerCase()
                    ? 'color-swatch color-swatch-active'
                    : 'color-swatch'
                }
                style={{ backgroundColor: color }}
                aria-label={`New tag color ${color}`}
                onClick={event => {
                  onSetNewTagColor(color);
                  event.currentTarget.closest('details')?.removeAttribute('open');
                }}
              />
            ))}
          </div>
        </details>
        <button type="button" aria-label="Add tag" title="Add tag" onClick={onAddCustomTag}>
          +
        </button>
      </div>
      {tags.map(tag => (
        <div key={tag.id} className="tag-row">
          <button
            type="button"
            className="tag-color-button"
            aria-label={`Apply tag ${tag.name}`}
            title={`Apply tag ${tag.name}`}
            style={{ backgroundColor: tag.color }}
            onClick={() => onApplyTag(tag.id)}
          />
          <input value={tag.name} onChange={event => onRenameTag(tag, event.target.value)} />
          <button type="button" aria-label={`Delete tag ${tag.name}`} onClick={() => onRemoveTag(tag.id)}>
            x
          </button>
        </div>
      ))}
    </div>
  );
}

function EdgeToolbar({
  selectedStyleEdgeCount,
  edgeStyleSummary,
  settings,
  layoutDirection,
  themeEdgeColor,
  canResetSelectedEdgeBend,
  onSwitchLayoutDirection,
  onApplySelectedEdgeStyle,
  onResetSelectedEdgeBend
}: ToolbarPanelProps) {
  const edgeFallback = getEdgeFallback(settings, themeEdgeColor);
  return (
    <>
      <div className="toolbar-title">Line Style</div>
      <label className="toolbar-field">
        <span>Layout</span>
        <select
          aria-label="Layout"
          value={layoutDirection}
          onChange={event => onSwitchLayoutDirection(event.target.value as LayoutDirection)}
        >
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </select>
      </label>
      <EdgeStyleControls
        title="Selected Line"
        edgeCount={selectedStyleEdgeCount}
        widthValue={edgeStyleSummary.selectedEdgeWidth}
        widthMixed={edgeStyleSummary.selectedEdgeWidthMixed}
        lineTypeValue={edgeStyleSummary.selectedEdgeLineType}
        lineTypeMixed={edgeStyleSummary.selectedEdgeLineTypeMixed}
        colorValue={edgeStyleSummary.selectedEdgeColor}
        colorMixed={edgeStyleSummary.selectedEdgeColorMixed}
        fallback={edgeFallback}
        onPatch={onApplySelectedEdgeStyle}
      />
      <div className="toolbar-button-row">
        <button
          type="button"
          onClick={onResetSelectedEdgeBend}
          aria-label="Reset Bend"
          title="Reset selected line route"
          disabled={!canResetSelectedEdgeBend}
        >
          Reset Bend
        </button>
      </div>
    </>
  );
}
