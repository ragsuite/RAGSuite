import type { LucideIcon } from 'lucide-react-native';
import {
  ChartColumn,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  HelpCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
  Unplug,
  Upload,
  UserPlus,
  X,
} from 'lucide-react-native';

/**
 * Canonical Lucide icons for shared actions across every module.
 * Import from here (or use these exact Lucide names) — never parallel variants
 * like SquarePen / Settings2 / ListFilter / FileDown / CircleHelp / UploadCloud.
 *
 * Enforce with: `yarn check-action-icons`
 */
export const ActionIcons = {
  edit: Pencil,
  delete: Trash2,
  disconnect: Unplug,
  view: Eye,
  hide: EyeOff,
  add: Plus,
  invite: UserPlus,
  upload: Upload,
  download: Download,
  copy: Copy,
  refresh: RefreshCw,
  reset: RotateCcw,
  save: Save,
  more: MoreHorizontal,
  close: X,
  settings: Settings,
  filter: SlidersHorizontal,
  search: Search,
  help: HelpCircle,
  externalLink: ExternalLink,
  success: CheckCircle2,
  chart: ChartColumn,
} as const satisfies Record<string, LucideIcon>;

export type ActionIconKey = keyof typeof ActionIcons;

/** Preferred sizes for toolbar / row action glyphs (not status badges). */
export const ACTION_ICON_SIZE = {
  sm: 14,
  md: 16,
  lg: 18,
} as const;
