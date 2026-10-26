import React from 'react';
import {
  Codi,
  IconArrowLeft,
  IconArrowRight,
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconCode,
  IconExtensions,
  IconFile,
  IconFiles,
  IconFolder,
  IconFolderOpened,
  IconHistory,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSend,
  IconSettings,
  IconSparkle,
} from './codicons';

interface IconProps {
  className?: string;
  size?: number;
}

/* Legacy icon module kept for components that predate the codicon migration. */
export const IconFilesLegacy = IconFiles;
export { IconSearch, IconExtensions, IconSettings, IconFolder, IconFile, IconFiles, IconPlus, IconClose, IconChevronRight, IconChevronDown, IconCode, IconSend, IconHistory, IconRefresh };
export const IconFolderOpen = IconFolderOpened;
export const IconSun: React.FC<IconProps> = (p) => <Codi name="sun" size={p.size ?? 20} className={p.className} />;
export const IconMoon: React.FC<IconProps> = (p) => <Codi name="moon" size={p.size ?? 20} className={p.className} />;
export const IconWand: React.FC<IconProps> = (p) => <Codi name="sparkle" size={p.size ?? 20} className={p.className} />;
export const IconX: React.FC<IconProps> = (p) => <Codi name="close" size={p.size ?? 20} className={p.className} />;
export const IconArrowLeftLegacy = IconArrowLeft;
export const IconArrowRightLegacy = IconArrowRight;
export const IconSparkleLegacy = IconSparkle;
export const IconLoading: React.FC<IconProps> = (p) => (
  <span
    className={`codicon codicon-loading codicon-modifier-spin${p.className ? ` ${p.className}` : ''}`}
    style={{ fontSize: p.size ?? 16, lineHeight: 1 }}
    aria-hidden="true"
  />
);
