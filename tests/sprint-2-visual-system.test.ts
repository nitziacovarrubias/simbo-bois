import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WORKSPACE_PREFERENCES,
  DISPLAY_MODE_CONFIG,
  QUALITY_PRESETS,
  gridHierarchy,
  gridStepForDistance,
  normalizeWorkspacePreferences,
  parseCadNumericInput,
  selectionVisualState
} from '../apps/web/src/cadVisualSystem.ts';
import { cameraPreset, focusCamera } from '../packages/editor-engine/src/index.ts';

test('DisplayModeConfig defines a complete professional visual policy for all modes', () => {
  const expected = ['SHADED','TECHNICAL','PRESENTATION','XRAY','HIDDEN_LINE','WIREFRAME','MONOCHROME','MANUFACTURING'];
  assert.deepEqual(Object.keys(DISPLAY_MODE_CONFIG).sort(), expected.sort());
  assert.equal(DISPLAY_MODE_CONFIG.PRESENTATION.grid, 'HIDDEN');
  assert.equal(DISPLAY_MODE_CONFIG.PRESENTATION.contactShadows, true);
  assert.equal(DISPLAY_MODE_CONFIG.TECHNICAL.grid, 'FULL');
  assert.equal(DISPLAY_MODE_CONFIG.HIDDEN_LINE.edgeOpacity, 1);
  assert.equal(DISPLAY_MODE_CONFIG.MANUFACTURING.machining, true);
});

test('QualityPreset scales rendering cost without changing domain data', () => {
  assert.deepEqual(QUALITY_PRESETS.PERFORMANCE.dpr, [1, 1]);
  assert.equal(QUALITY_PRESETS.PERFORMANCE.shadows, false);
  assert.deepEqual(QUALITY_PRESETS.BALANCED.dpr, [1, 1.5]);
  assert.equal(QUALITY_PRESETS.QUALITY.shadowMapSize, 2048);
});

test('workspace panel preferences are clamped and default to BALANCED', () => {
  const normalized = normalizeWorkspacePreferences({ leftPanelWidth: 999, rightPanelWidth: 12, qualityPreset: 'QUALITY', wallsMode: 'HIDDEN' });
  assert.equal(normalized.leftPanelWidth, 420);
  assert.equal(normalized.rightPanelWidth, 260);
  assert.equal(normalized.qualityPreset, 'QUALITY');
  assert.equal(normalized.wallsMode, 'HIDDEN');
  assert.equal(normalizeWorkspacePreferences(null).qualityPreset, DEFAULT_WORKSPACE_PREFERENCES.qualityPreset);
});

test('adaptive CAD grid selects hierarchical millimeter spacing from camera distance', () => {
  assert.equal(gridStepForDistance(500), 1);
  assert.equal(gridStepForDistance(1200), 5);
  assert.equal(gridStepForDistance(2000), 10);
  assert.equal(gridStepForDistance(4000), 25);
  assert.equal(gridStepForDistance(7000), 50);
  assert.equal(gridStepForDistance(12000), 100);
  assert.deepEqual(gridHierarchy(50), { minor: 50, major: 500 });
});

test('CADNumericField parser commits valid units and rejects invalid in-progress values', () => {
  assert.equal(parseCadNumericInput('500', 'mm'), 500);
  assert.equal(parseCadNumericInput('50cm', 'mm'), 500);
  assert.equal(parseCadNumericInput('0.5m', 'mm'), 500);
  assert.equal(parseCadNumericInput('45deg', 'deg'), 45);
  assert.equal(parseCadNumericInput('-', 'mm'), null);
  assert.equal(parseCadNumericInput('10deg', 'mm'), null);
});

test('selection visual state keeps exact selection stronger than assembly/group and hover', () => {
  assert.equal(selectionVisualState(true, true, true), 'SELECTED');
  assert.equal(selectionVisualState(false, true, true), 'GROUP');
  assert.equal(selectionVisualState(false, false, true), 'HOVER');
  assert.equal(selectionVisualState(false, false, false), 'NONE');
});

test('professional camera composition uses a moderate isometric FOV and safe focus margin', () => {
  const camera = cameraPreset('ISOMETRIC', { x: 0, y: 1200, z: 0 }, 5000);
  assert.equal(camera.projection, 'PERSPECTIVE');
  assert.ok(camera.fov >= 34 && camera.fov <= 42);
  assert.ok(camera.position.y > 2500);
  const focused = focusCamera(camera, { min: { x: -350, y: 0, z: -9 }, max: { x: 350, y: 500, z: 9 } });
  assert.equal(focused.target.y, 250);
  const dx = focused.position.x - focused.target.x;
  const dy = focused.position.y - focused.target.y;
  const dz = focused.position.z - focused.target.z;
  assert.ok(Math.hypot(dx, dy, dz) > 700 * 2.4);
});
