import type { DisplayMode, SceneQuality, SceneWallsMode, VisibilityTagState } from '@simbo/design-domain';

export type QualityPreset = SceneQuality;
export type WallsMode = SceneWallsMode;

export interface DisplayModeConfig {
  background: string;
  floor: string;
  wall: string;
  faceOverride?: string;
  materialSaturation: number;
  edgeColor: string;
  edgeOpacity: number;
  edgeLineWidth: number;
  selectedEdgeColor: string;
  groupEdgeColor: string;
  hoverEdgeColor: string;
  grid: 'HIDDEN' | 'SUBTLE' | 'FULL';
  axes: boolean;
  shadows: 'OFF' | 'LOW' | 'MEDIUM' | 'HIGH';
  contactShadows: boolean;
  hardware: boolean;
  machining: boolean;
  appliances: boolean;
  countertops: boolean;
  clearances: boolean;
  servicePoints: boolean;
  applianceOpacity: number;
  wallOpacity: number;
  environmentIntensity: number;
  exposure: number;
}

export const DISPLAY_MODE_CONFIG: Record<DisplayMode, DisplayModeConfig> = {
  SHADED: {
    background: '#DCE3E7', floor: '#D5D2CA', wall: '#F0EFEB', materialSaturation: 1,
    edgeColor: '#56636B', edgeOpacity: .52, edgeLineWidth: .85, selectedEdgeColor: '#E69B2B', groupEdgeColor: '#4C86A8', hoverEdgeColor: '#6C9C87',
    grid: 'SUBTLE', axes: true, shadows: 'MEDIUM', contactShadows: false, hardware: false, machining: false, appliances: true, countertops: true, clearances: false, servicePoints: false, applianceOpacity: 1, wallOpacity: .34, environmentIntensity: .52, exposure: 1.0
  },
  TECHNICAL: {
    background: '#F0F3F4', floor: '#E9ECEE', wall: '#FAFAF8', faceOverride: '#DDE2E5', materialSaturation: .48,
    edgeColor: '#3E4A52', edgeOpacity: .9, edgeLineWidth: 1.05, selectedEdgeColor: '#CF8422', groupEdgeColor: '#3B7897', hoverEdgeColor: '#5F8E7B',
    grid: 'FULL', axes: true, shadows: 'LOW', contactShadows: false, hardware: true, machining: true, appliances: true, countertops: true, clearances: true, servicePoints: true, applianceOpacity: 1, wallOpacity: .16, environmentIntensity: .68, exposure: 1.04
  },
  PRESENTATION: {
    background: '#D8D9D4', floor: '#D4CFC5', wall: '#F1EEE7', materialSaturation: 1,
    edgeColor: '#6B716F', edgeOpacity: .22, edgeLineWidth: .65, selectedEdgeColor: '#D88A19', groupEdgeColor: '#567E95', hoverEdgeColor: '#7D9789',
    grid: 'HIDDEN', axes: false, shadows: 'HIGH', contactShadows: true, hardware: false, machining: false, appliances: true, countertops: true, clearances: false, servicePoints: false, applianceOpacity: 1, wallOpacity: .5, environmentIntensity: .44, exposure: .98
  },
  XRAY: {
    background: '#E8EEF1', floor: '#E4E9EB', wall: '#F6F7F5', materialSaturation: .7,
    edgeColor: '#41515B', edgeOpacity: .9, edgeLineWidth: 1.05, selectedEdgeColor: '#D98D23', groupEdgeColor: '#397B9B', hoverEdgeColor: '#61917D',
    grid: 'SUBTLE', axes: true, shadows: 'OFF', contactShadows: false, hardware: true, machining: true, appliances: true, countertops: true, clearances: false, servicePoints: false, applianceOpacity: 1, wallOpacity: .08, environmentIntensity: .7, exposure: 1.03
  },
  HIDDEN_LINE: {
    background: '#FBFBF8', floor: '#F5F5F1', wall: '#FFFFFF', faceOverride: '#FAFAF7', materialSaturation: 0,
    edgeColor: '#252C31', edgeOpacity: 1, edgeLineWidth: 1.2, selectedEdgeColor: '#B87317', groupEdgeColor: '#315E78', hoverEdgeColor: '#607A6D',
    grid: 'SUBTLE', axes: false, shadows: 'OFF', contactShadows: false, hardware: false, machining: false, appliances: true, countertops: true, clearances: false, servicePoints: false, applianceOpacity: 1, wallOpacity: .08, environmentIntensity: .82, exposure: 1.08
  },
  WIREFRAME: {
    background: '#E9EEF0', floor: '#E5E9EB', wall: '#F7F7F5', materialSaturation: 0,
    edgeColor: '#34444E', edgeOpacity: .95, edgeLineWidth: 1, selectedEdgeColor: '#CF8422', groupEdgeColor: '#3D7896', hoverEdgeColor: '#628B79',
    grid: 'FULL', axes: true, shadows: 'OFF', contactShadows: false, hardware: false, machining: false, appliances: true, countertops: true, clearances: false, servicePoints: false, applianceOpacity: 1, wallOpacity: .08, environmentIntensity: .7, exposure: 1.02
  },
  MONOCHROME: {
    background: '#E2E7E9', floor: '#D8DDDF', wall: '#F1F2F0', faceOverride: '#C8CDD0', materialSaturation: 0,
    edgeColor: '#525E65', edgeOpacity: .65, edgeLineWidth: .9, selectedEdgeColor: '#D78B20', groupEdgeColor: '#467B97', hoverEdgeColor: '#668C7B',
    grid: 'SUBTLE', axes: true, shadows: 'MEDIUM', contactShadows: false, hardware: false, machining: false, appliances: true, countertops: true, clearances: false, servicePoints: false, applianceOpacity: 1, wallOpacity: .28, environmentIntensity: .58, exposure: 1.0
  },
  MANUFACTURING: {
    background: '#EEF1F2', floor: '#E6E9EA', wall: '#F8F8F6', faceOverride: '#D5DADD', materialSaturation: .4,
    edgeColor: '#35434C', edgeOpacity: .98, edgeLineWidth: 1.15, selectedEdgeColor: '#C97817', groupEdgeColor: '#2F7597', hoverEdgeColor: '#577F70',
    grid: 'FULL', axes: true, shadows: 'LOW', contactShadows: false, hardware: true, machining: true, appliances: true, countertops: true, clearances: false, servicePoints: false, applianceOpacity: .32, wallOpacity: .12, environmentIntensity: .66, exposure: 1.03
  }
};

export interface QualityConfig {
  dpr: [number, number];
  shadows: boolean;
  shadowMapSize: 1024 | 1536 | 2048;
  contactShadow: boolean;
  edgeSegments: 1 | 2;
}

export const QUALITY_PRESETS: Record<QualityPreset, QualityConfig> = {
  PERFORMANCE: { dpr: [1, 1], shadows: false, shadowMapSize: 1024, contactShadow: false, edgeSegments: 1 },
  BALANCED: { dpr: [1, 1.5], shadows: true, shadowMapSize: 1536, contactShadow: true, edgeSegments: 1 },
  QUALITY: { dpr: [1, 2], shadows: true, shadowMapSize: 2048, contactShadow: true, edgeSegments: 2 }
};

export interface WorkspacePreferences {
  qualityPreset: QualityPreset;
  wallsMode: WallsMode;
  leftPanelCollapsed: boolean;
  rightPanelCollapsed: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;
  sceneTransitionEnabled: boolean;
  eyeHeightMm: number;
  walkSpeed: number;
  walkCollision: boolean;
}

export const DEFAULT_WORKSPACE_PREFERENCES: WorkspacePreferences = {
  qualityPreset: 'BALANCED',
  wallsMode: 'TRANSPARENT',
  leftPanelCollapsed: false,
  rightPanelCollapsed: false,
  leftPanelWidth: 286,
  rightPanelWidth: 340,
  sceneTransitionEnabled: true,
  eyeHeightMm: 1650,
  walkSpeed: 1400,
  walkCollision: true
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finiteOr = (value: unknown, fallback: number) => { const number = Number(value); return Number.isFinite(number) ? number : fallback; };

export function normalizeWorkspacePreferences(value: Partial<WorkspacePreferences> | null | undefined): WorkspacePreferences {
  const source = value ?? {};
  const qualityPreset = source.qualityPreset && source.qualityPreset in QUALITY_PRESETS ? source.qualityPreset : DEFAULT_WORKSPACE_PREFERENCES.qualityPreset;
  const wallsMode: WallsMode = source.wallsMode === 'VISIBLE' || source.wallsMode === 'TRANSPARENT' || source.wallsMode === 'HIDDEN' || source.wallsMode === 'AUTO' ? source.wallsMode : DEFAULT_WORKSPACE_PREFERENCES.wallsMode;
  return {
    qualityPreset,
    wallsMode,
    leftPanelCollapsed: Boolean(source.leftPanelCollapsed),
    rightPanelCollapsed: Boolean(source.rightPanelCollapsed),
    leftPanelWidth: clamp(finiteOr(source.leftPanelWidth, DEFAULT_WORKSPACE_PREFERENCES.leftPanelWidth), 220, 420),
    rightPanelWidth: clamp(finiteOr(source.rightPanelWidth, DEFAULT_WORKSPACE_PREFERENCES.rightPanelWidth), 260, 440),
    sceneTransitionEnabled: source.sceneTransitionEnabled !== false,
    eyeHeightMm: clamp(finiteOr(source.eyeHeightMm, DEFAULT_WORKSPACE_PREFERENCES.eyeHeightMm), 900, 2200),
    walkSpeed: clamp(finiteOr(source.walkSpeed, DEFAULT_WORKSPACE_PREFERENCES.walkSpeed), 100, 8000),
    walkCollision: source.walkCollision !== false
  };
}

export function gridStepForDistance(distanceMm: number): 1 | 5 | 10 | 25 | 50 | 100 {
  if (distanceMm < 900) return 1;
  if (distanceMm < 1500) return 5;
  if (distanceMm < 2600) return 10;
  if (distanceMm < 4800) return 25;
  if (distanceMm < 9000) return 50;
  return 100;
}

export function gridHierarchy(step: 1 | 5 | 10 | 25 | 50 | 100): { minor: number; major: number } {
  if (step === 1) return { minor: 1, major: 10 };
  if (step === 5) return { minor: 5, major: 25 };
  if (step === 10) return { minor: 10, major: 100 };
  if (step === 25) return { minor: 25, major: 100 };
  if (step === 50) return { minor: 50, major: 500 };
  return { minor: 100, major: 500 };
}

export function parseCadNumericInput(raw: string, unit: 'mm' | 'deg' | 'none' = 'none'): number | null {
  const normalized = raw.trim().replace(',', '.').toLowerCase();
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)\s*(mm|cm|m|deg|°)?$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const explicit = match[2];
  if (unit === 'mm') {
    if (explicit === 'm') return value * 1000;
    if (explicit === 'cm') return value * 10;
    if (!explicit || explicit === 'mm') return value;
    return null;
  }
  if (unit === 'deg') return !explicit || explicit === 'deg' || explicit === '°' ? value : null;
  return explicit ? null : value;
}

export type SelectionVisualState = 'NONE' | 'HOVER' | 'GROUP' | 'SELECTED';
export function selectionVisualState(selectedExact: boolean, selectedGroup: boolean, hovered: boolean): SelectionVisualState {
  if (selectedExact) return 'SELECTED';
  if (selectedGroup) return 'GROUP';
  if (hovered) return 'HOVER';
  return 'NONE';
}


export const DEFAULT_VISIBILITY_TAGS: VisibilityTagState = Object.freeze({
  ROOM:true, PARTS:true, MODULES:true, APPLIANCES:true, COUNTERTOPS:true, HARDWARE:true, MACHINING:true, CLEARANCES:false, SERVICES:true, FUNCTIONAL_ZONES:false, GUIDES:true, SECTIONS:true, DIMENSIONS:true
});

export function normalizeVisibilityTags(value:Partial<VisibilityTagState> | null | undefined):VisibilityTagState {
  return {...DEFAULT_VISIBILITY_TAGS, ...(value ?? {})};
}
