import { useCallback, useMemo, useState } from 'react';
import type { PanelViewId, SideViewId } from './types';

const LAYOUT_KEY = 'purple-layout-v2';

const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 480;
const AI_MIN = 320;
const AI_MAX = 720;
const PANEL_MIN = 120;
const PANEL_MAX = 500;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const SIDE_VIEWS: SideViewId[] = ['explorer', 'search', 'source-control', 'agents'];
const PANEL_VIEWS: PanelViewId[] = ['problems', 'output', 'terminal'];

interface StoredLayout {
  sidebarWidth?: number;
  aiWidth?: number;
  panelHeight?: number;
  sidebarVisible?: boolean;
  aiVisible?: boolean;
  panelVisible?: boolean;
  activeSideView?: SideViewId;
  activePanelView?: PanelViewId;
}

const loadLayout = (): Required<StoredLayout> => {
  let stored: StoredLayout = {};
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) stored = JSON.parse(raw) as StoredLayout;
  } catch {}
  return {
    sidebarWidth: clamp(Number(stored.sidebarWidth) || 280, SIDEBAR_MIN, SIDEBAR_MAX),
    aiWidth: clamp(Number(stored.aiWidth) || 400, AI_MIN, AI_MAX),
    panelHeight: clamp(Number(stored.panelHeight) || 240, PANEL_MIN, PANEL_MAX),
    sidebarVisible: stored.sidebarVisible !== false,
    aiVisible: stored.aiVisible !== false,
    panelVisible: Boolean(stored.panelVisible),
    activeSideView: stored.activeSideView && SIDE_VIEWS.includes(stored.activeSideView)
      ? stored.activeSideView
      : 'explorer',
    activePanelView: stored.activePanelView && PANEL_VIEWS.includes(stored.activePanelView)
      ? stored.activePanelView
      : 'terminal',
  };
};

const persist = (state: Required<StoredLayout>) => {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(state)); } catch {}
};

/**
 * Sole owner of layout state: pane sizes, pane visibility and the active
 * sidebar/panel views. Every component reads these through the store.
 */
export function useLayout() {
  const initial = useMemo(loadLayout, []);
  const [sidebarWidth, setSidebarWidth] = useState(initial.sidebarWidth);
  const [sidebarVisible, setSidebarVisible] = useState(initial.sidebarVisible);
  const [activeSideView, setActiveSideView] = useState<SideViewId>(initial.activeSideView);
  const [aiWidth, setAiWidth] = useState(initial.aiWidth);
  const [aiVisible, setAiVisible] = useState(initial.aiVisible);
  const [panelHeight, setPanelHeight] = useState(initial.panelHeight);
  const [panelVisible, setPanelVisible] = useState(initial.panelVisible);
  const [activePanelView, setActivePanelView] = useState<PanelViewId>(initial.activePanelView);
  const [terminalSignal, setTerminalSignal] = useState(0);

  const save = useCallback((patch: Partial<Required<StoredLayout>>) => {
    persist({
      sidebarWidth, aiWidth, panelHeight, sidebarVisible, aiVisible: aiVisible,
      panelVisible, activeSideView, activePanelView,
      ...patch,
    });
  }, [sidebarWidth, aiWidth, panelHeight, sidebarVisible, aiVisible, panelVisible, activeSideView, activePanelView]);

  const resizeSidebar = useCallback((width: number) => {
    setSidebarWidth(width);
    save({ sidebarWidth: width });
  }, [save]);

  const resizeAi = useCallback((width: number) => {
    setAiWidth(width);
    save({ aiWidth: width });
  }, [save]);

  const resizePanel = useCallback((height: number) => {
    setPanelHeight(height);
    save({ panelHeight: height });
  }, [save]);

  const showPanel = useCallback((view: PanelViewId) => {
    setActivePanelView(view);
    setPanelVisible(true);
    save({ activePanelView: view, panelVisible: true });
  }, [save]);

  const togglePanel = useCallback(() => {
    const next = !panelVisible;
    setPanelVisible(next);
    save({ panelVisible: next });
  }, [panelVisible, save]);

  const toggleSidebar = useCallback(() => {
    const next = !sidebarVisible;
    setSidebarVisible(next);
    save({ sidebarVisible: next });
  }, [sidebarVisible, save]);

  const toggleAi = useCallback(() => {
    const next = !aiVisible;
    setAiVisible(next);
    save({ aiVisible: next });
  }, [aiVisible, save]);

  const setAiPanelVisible = useCallback((visible: boolean) => {
    setAiVisible(visible);
    save({ aiVisible: visible });
  }, [save]);

  const showSideView = useCallback((view: SideViewId) => {
    setActiveSideView(view);
    setSidebarVisible(true);
    save({ activeSideView: view, sidebarVisible: true });
  }, [save]);

  const toggleTerminal = useCallback(() => {
    if (panelVisible && activePanelView === 'terminal') {
      setPanelVisible(false);
      save({ panelVisible: false });
      return;
    }
    showPanel('terminal');
  }, [panelVisible, activePanelView, save, showPanel]);

  const newTerminal = useCallback(() => {
    showPanel('terminal');
    setTerminalSignal((value) => value + 1);
  }, [showPanel]);

  const closePanel = useCallback(() => {
    setPanelVisible(false);
    save({ panelVisible: false });
  }, [save]);

  const setActivePanel = useCallback((view: PanelViewId) => {
    setActivePanelView(view);
    save({ activePanelView: view });
  }, [save]);

  return {
    sidebarWidth,
    sidebarVisible,
    activeSideView,
    aiWidth,
    aiVisible,
    panelHeight,
    panelVisible,
    activePanelView,
    terminalSignal,
    resizeSidebar,
    resizeAi,
    resizePanel,
    showPanel,
    showSideView,
    togglePanel,
    toggleSidebar,
    toggleAi,
    toggleTerminal,
    newTerminal,
    closePanel,
    setActivePanelView: setActivePanel,
    setAiVisible: setAiPanelVisible,
  };
}
