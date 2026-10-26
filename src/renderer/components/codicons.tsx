import React from 'react';

export interface IconProps {
  className?: string;
  size?: number;
  color?: string;
  title?: string;
}

interface CodiProps extends IconProps {
  name: string;
}

/**
 * Official VS Code codicons (CC BY 4.0).
 * The icon font ships with @vscode/codicons; see THIRD_PARTY_NOTICES.
 */
export const Codi: React.FC<CodiProps> = ({ name, size = 16, color, className, title }) => (
  <span
    className={`codicon codicon-${name}${className ? ` ${className}` : ''}`}
    style={{ fontSize: size, color, lineHeight: 1 }}
    role={title ? 'img' : undefined}
    aria-label={title}
    title={title}
    aria-hidden={title ? undefined : true}
  />
);

const icon = (name: string): React.FC<IconProps> => {
  const Icon: React.FC<IconProps> = (props) => <Codi name={name} {...props} />;
  Icon.displayName = `Icon(${name})`;
  return Icon;
};

/* Activity bar */
export const IconExplorer = icon('files');
export const IconSearch = icon('search');
export const IconSourceControl = icon('source-control');
export const IconRobot = icon('sparkle');
export const IconAgents = icon('organization');
export const IconAccount = icon('account');
export const IconSettings = icon('settings-gear');

/* Views and files */
export const IconFile = icon('file');
export const IconFileCode = icon('file-code');
export const IconFileSubmodule = icon('new-file');
export const IconFolder = icon('folder');
export const IconFolderOpened = icon('folder-opened');
export const IconFolderActive = IconFolderOpened;
export const IconFileType = icon('file-code');
export const IconCollapseAll = icon('collapse-all');
export const IconGitCompare = icon('git-compare');
export const IconBranch = icon('git-branch');
export const IconComment = icon('comment-discussion');
export const IconCheck = icon('check');
export const IconX = icon('close');
export const IconClose = icon('close');
export const IconCloseDirty = icon('close');
export const IconPlus = icon('add');
export const IconMinus = icon('remove');
export const IconChevronRight = icon('chevron-right');
export const iconChevronRight = IconChevronRight;
export const IconChevronDown = icon('chevron-down');
export const IconChevronLeft = icon('chevron-left');
export const IconRefresh = icon('refresh');
export const IconCopy = icon('copy');
export const IconEdit = icon('edit');
export const IconTrash = icon('trash');
export const IconSave = icon('save');
export const IconDashboard = icon('dashboard');
export const IconExtensions = icon('extensions');
export const IconTerminal = icon('terminal');
export const IconOutput = icon('output');
export const IconProblems = icon('error');
export const IconDebug = icon('debug-alt');
export const IconHistory = icon('history');
export const IconSync = icon('sync');
export const IconCloudUpload = icon('cloud-upload');
export const IconCloudDownload = icon('cloud-download');
export const IconBell = icon('bell');
export const IconBellDot = icon('bell-dot');
export const IconEye = icon('eye');
export const IconEyeDisabled = icon('eye-closed');
export const IconPlay = icon('play');
export const IconStop = icon('debug-stop');
export const IconPin = icon('pin');
export const IconUnpin = icon('pinned');
export const IconStar = icon('star-full');
export const IconStarEmpty = icon('star-empty');
export const IconTriangleUp = icon('triangle-up');
export const IconTriangleDown = icon('triangle-down');
export const IconMore = icon('ellipsis');
export const IconUpload = icon('cloud-upload');
export const IconDownload = icon('cloud-download');
export const IconWelcome = icon('files');
export const IconSparkle = icon('sparkle');
export const IconOrganization = icon('organization');
export const IconArrowLeft = icon('arrow-left');
export const IconArrowRight = icon('arrow-right');
export const IconLayoutSidebar = icon('layout-sidebar-left');
export const IconLayoutPanel = icon('layout-panel');
export const IconLightbulb = icon('lightbulb');
export const IconDiff = icon('diff');
export const IconSend = icon('send');
export const IconScreenFull = icon('screen-full');
export const IconClearAll = icon('clear-all');
export const IconReply = icon('reply');
export const IconNewFile = icon('new-file');
export const IconNewFolder = icon('new-folder');
export const IconGoToFile = icon('go-to-file');
export const IconSymbolClass = icon('symbol-class');
export const IconSymbolMethod = icon('symbol-method');
export const IconSymbolFunction = icon('symbol-function');
export const IconSymbolField = icon('symbol-field');
export const IconSymbolNamespace = icon('symbol-namespace');
export const IconSymbolString = icon('symbol-string');
export const IconCode = icon('code');
export const IconBook = icon('book');
export const IconKeyboard = icon('keyboard');
export const IconFiles = icon('files');
