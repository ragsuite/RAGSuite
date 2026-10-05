import {
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Download,
  FileText,
  FileType,
  Braces,
  Menu,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { AiAssistantDismissableMenu } from "@/features/ai-assistant/components/AiAssistantDismissableMenu";
import type { AiAssistantSession } from "@/features/ai-assistant/types/ai-assistant.types";
import {
  exportAiAssistantMessages,
  type AiAssistantExportFormat,
} from "@/features/ai-assistant/utils/ai-assistant-export";
import { handleListAiAssistantMessages } from "@/network/actions/ai-assistant.actions";
import { useActiveProject } from "@/features/projects/providers/active-project-provider";
import { useTranslation } from "@/i18n";
import { useAppTheme } from "@/shared/hooks/use-app-theme";
import { useCompactLayout } from "@/shared/hooks/use-compact-layout";
import { useToast } from "@/shared/toast/use-toast";
import { webSuppressInputOutline } from "@/shared/utils/focus-ring-style";
import {
  searchInputAutofillProps,
  useSearchFilterInputProps,
} from "@/shared/utils/search-input-autofill";

const SIDEBAR_MIN = 260;
const SIDEBAR_MAX = 360;
const SIDEBAR_DEFAULT = 280;
const SIDEBAR_COLLAPSED = 56;
const RESIZE_HIT_WIDTH = 8;

function clampSidebarWidth(width: number) {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width));
}


type Props = {
  sessions: AiAssistantSession[];
  activeSessionId: string | null;
  sessionQuery: string;
  onSessionQueryChange: (value: string) => void;
  onNewChat: () => void;
  onSelect: (sessionId: string) => void;
  onRequestRename: (sessionId: string, currentTitle: string) => void;
  onDelete: (sessionId: string) => void;
};

function MenuRow({
  label,
  onPress,
  danger,
  Icon,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  Icon?: LucideIcon;
}) {
  const { colors, spacing, typography } = useAppTheme();
  const color = danger ? colors.danger : colors.text;
  const iconColor = danger ? colors.danger : colors.textMuted;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      style={({ pressed, hovered }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        paddingHorizontal: spacing.sm,
        paddingVertical: 6,
        backgroundColor: pressed
          ? colors.surfaceMuted
          : hovered
            ? colors.surfaceHover
            : "transparent",
      })}
    >
      {Icon ? <Icon size={14} color={iconColor} /> : null}
      <Text style={[typography.caption, { color, fontWeight: "500" }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SessionRow({
  session,
  active,
  menuOpen,
  exportSubmenuOpen,
  onSelect,
  onToggleMenu,
  onCloseMenu,
  onToggleExportSubmenu,
  onExport,
  onRename,
  onDelete,
}: {
  session: AiAssistantSession;
  active: boolean;
  menuOpen: boolean;
  exportSubmenuOpen: boolean;
  onSelect: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onToggleExportSubmenu: () => void;
  onExport: (format: AiAssistantExportFormat) => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const menuAnchorRef = useRef<View>(null);

  return (
    <View
      ref={menuAnchorRef}
      collapsable={false}
      style={{ position: "relative" }}
    >
      <Pressable
        onPress={onSelect}
        accessibilityState={{ selected: active }}
        style={({ pressed, hovered }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          minHeight: 44,
          borderRadius: surfaceRadius.button,
          paddingVertical: spacing.xs + 1,
          paddingHorizontal: spacing.sm,
          backgroundColor:
            active || pressed || hovered ? colors.primaryTint : "transparent",
          borderLeftWidth: active ? 2 : 0,
          borderLeftColor: colors.primary,
        })}
      >
        <Text
          numberOfLines={1}
          style={[
            typography.body,
            {
              flex: 1,
              color: active ? colors.onPrimaryTint : colors.sidebarForeground,
              fontWeight: "500",
            },
          ]}
        >
          {session.title}
        </Text>
        <Pressable
          onPress={(e) => {
            // Prevent selecting the session when opening the overflow menu.
            e.stopPropagation?.();
            onToggleMenu();
          }}
          hitSlop={8}
          accessibilityLabel={t("aiAssistant.sessionMenu")}
          accessibilityState={{ expanded: menuOpen }}
          style={({ pressed, hovered }) => ({
            padding: 4,
            borderRadius: surfaceRadius.button,
            backgroundColor:
              pressed || hovered ? colors.primaryTint : "transparent",
          })}
        >
          <MoreHorizontal
            size={16}
            color={active ? colors.onPrimaryTint : colors.iconMuted}
          />
        </Pressable>
      </Pressable>
      <AiAssistantDismissableMenu
        open={menuOpen}
        onClose={onCloseMenu}
        dismissLabel={t("common.close")}
        anchorRef={menuAnchorRef}
      >
        <MenuRow
          label={t("aiAssistant.export.session")}
          Icon={Download}
          onPress={onToggleExportSubmenu}
        />
        {exportSubmenuOpen ? (
          <View style={{ paddingLeft: spacing.sm }}>
            <MenuRow
              label={t("aiAssistant.export.document")}
              Icon={FileText}
              onPress={() => {
                onCloseMenu();
                onExport("markdown");
              }}
            />
            <MenuRow
              label={t("aiAssistant.export.json")}
              Icon={Braces}
              onPress={() => {
                onCloseMenu();
                onExport("json");
              }}
            />
            <MenuRow
              label={t("aiAssistant.export.pdf")}
              Icon={FileType}
              onPress={() => {
                onCloseMenu();
                onExport("pdf");
              }}
            />
          </View>
        ) : null}
        <MenuRow
          label={t("aiAssistant.rename")}
          Icon={Pencil}
          onPress={() => {
            onCloseMenu();
            onRename();
          }}
        />
        <MenuRow
          label={t("aiAssistant.delete")}
          Icon={Trash2}
          danger
          onPress={() => {
            onCloseMenu();
            onDelete();
          }}
        />
      </AiAssistantDismissableMenu>
    </View>
  );
}

export function AiAssistantSidebar({
  sessions,
  activeSessionId,
  sessionQuery,
  onSessionQueryChange,
  onNewChat,
  onSelect,
  onRequestRename,
  onDelete,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, radius } = useAppTheme();
  const isCompact = useCompactLayout();
  const { toast } = useToast();
  const { activeProjectId } = useActiveProject();
  const autofillProps = useSearchFilterInputProps();

  const [menuId, setMenuId] = useState<string | null>(null);
  const [exportSubmenuId, setExportSubmenuId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [railWidth, setRailWidth] = useState(SIDEBAR_DEFAULT);
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (isCompact) {
      setCollapsed(false);
      setOverlayOpen(false);
    }
  }, [isCompact]);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const onMove = (event: MouseEvent) => {
      if (!dragRef.current) return;
      const next = dragRef.current.startWidth + (event.clientX - dragRef.current.startX);
      setRailWidth(clampSidebarWidth(next));
    };

    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startResize = useCallback(
    (clientX: number) => {
      dragRef.current = { startX: clientX, startWidth: clampSidebarWidth(railWidth) };
      setResizing(true);
      if (Platform.OS === "web") {
        document.body.style.cursor = "ew-resize";
        document.body.style.userSelect = "none";
      }
    },
    [railWidth],
  );

  const clampedWidth = clampSidebarWidth(railWidth);

  const exportSession = async (
    sessionId: string,
    title: string,
    format: AiAssistantExportFormat,
  ) => {
    if (!activeProjectId) return;
    try {
      const messages = await handleListAiAssistantMessages(
        activeProjectId,
        sessionId,
      );
      await exportAiAssistantMessages(messages, format, {
        title,
        filenameBase: title,
      });
      toast({ title: t("aiAssistant.toast.exportOk") });
    } catch (error) {
      toast({
        title: t("aiAssistant.toast.exportFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  const renderSessionList = () => (
    <>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          height: 40,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          paddingHorizontal: spacing.sm,
          backgroundColor: colors.surface,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <View style={{ flexGrow: 0, flexShrink: 0, flexBasis: "auto" }}>
          <Search size={16} color={colors.textMuted} />
        </View>
        <TextInput
          value={sessionQuery}
          onChangeText={onSessionQueryChange}
          placeholder={t("aiAssistant.searchChats")}
          placeholderTextColor={colors.textMuted}
          {...autofillProps}
          {...searchInputAutofillProps}
          style={[
            typography.body,
            webSuppressInputOutline(),
            {
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: 0,
              minWidth: 0,
              color: colors.text,
            },
          ]}
          accessibilityLabel={t("aiAssistant.searchChats")}
        />
      </View>

      <Text style={[typography.eyebrow, { color: colors.textMuted }]}>
        {t("aiAssistant.recents")}
      </Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: spacing.xs }}
      >
        {sessions.length === 0 ? (
          <Text
            style={[
              typography.caption,
              { color: colors.textMuted, lineHeight: 18 },
            ]}
          >
            {t("aiAssistant.emptySessions")}
          </Text>
        ) : (
          sessions.map((session) => {
            const active = session.id === activeSessionId;
            return (
              <SessionRow
                key={session.id}
                session={session}
                active={active}
                menuOpen={menuId === session.id}
                exportSubmenuOpen={exportSubmenuId === session.id}
                onSelect={() => {
                  setMenuId(null);
                  setExportSubmenuId(null);
                  onSelect(session.id);
                  if (isCompact) setOverlayOpen(false);
                }}
                onToggleMenu={() => {
                  setExportSubmenuId(null);
                  setMenuId((prev) =>
                    prev === session.id ? null : session.id,
                  );
                }}
                onCloseMenu={() => {
                  setMenuId(null);
                  setExportSubmenuId(null);
                }}
                onToggleExportSubmenu={() =>
                  setExportSubmenuId((prev) =>
                    prev === session.id ? null : session.id,
                  )
                }
                onExport={(format) =>
                  void exportSession(session.id, session.title, format)
                }
                onRename={() => onRequestRename(session.id, session.title)}
                onDelete={() => onDelete(session.id)}
              />
            );
          })
        )}
      </ScrollView>
    </>
  );

  const expandedBody = (
    <View style={{ flex: 1, padding: spacing.md, gap: spacing.md, minWidth: 0 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          minWidth: 0,
        }}
      >
        <Pressable
          onPress={() => {
            onNewChat();
            if (isCompact) setOverlayOpen(false);
          }}
          style={({ pressed, hovered }) => ({
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
            minWidth: 0,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: spacing.xs,
            height: 44,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            backgroundColor:
              pressed || hovered ? colors.primaryPressed : colors.primary,
          })}
          accessibilityRole="button"
          accessibilityLabel={t("aiAssistant.newChat")}
        >
          <MessageSquarePlus size={18} color={colors.textOnPrimary} />
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[
              typography.buttonLabel,
              {
                color: colors.textOnPrimary,
                flexGrow: 0,
                flexShrink: 1,
                flexBasis: "auto",
                minWidth: 0,
              },
            ]}
          >
            {t("aiAssistant.newChat")}
          </Text>
        </Pressable>
        {!isCompact ? (
          <Pressable
            onPress={() => setCollapsed(true)}
            accessibilityLabel={t("aiAssistant.collapseSidebar")}
            style={({ pressed, hovered }) => ({
              height: 44,
              width: 44,
              flexShrink: 0,
              borderRadius: radius.md,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: colors.borderStrong,
              backgroundColor: pressed
                ? colors.surfaceMuted
                : hovered
                  ? colors.surfaceHover
                  : colors.surface,
            })}
          >
            <PanelLeftClose size={18} color={colors.text} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => setOverlayOpen(false)}
            accessibilityLabel={t("common.close")}
            style={({ pressed, hovered }) => ({
              height: 44,
              width: 44,
              flexShrink: 0,
              borderRadius: radius.md,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: colors.borderStrong,
              backgroundColor: pressed
                ? colors.surfaceMuted
                : hovered
                  ? colors.surfaceHover
                  : colors.surface,
            })}
          >
            <X size={18} color={colors.text} />
          </Pressable>
        )}
      </View>
      {renderSessionList()}
    </View>
  );

  if (isCompact) {
    return (
      <>
        <View
          style={{
            width: SIDEBAR_COLLAPSED,
            borderRightWidth: 1,
            borderRightColor: colors.border,
            backgroundColor: colors.surfaceMuted,
            padding: spacing.sm,
            gap: spacing.sm,
            alignItems: "center",
          }}
        >
          <Pressable
            onPress={() => setOverlayOpen(true)}
            accessibilityLabel={t("aiAssistant.expandSidebar")}
            style={({ pressed, hovered }) => ({
              height: 40,
              width: 40,
              borderRadius: radius.md,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: colors.borderStrong,
              backgroundColor: pressed
                ? colors.surfaceMuted
                : hovered
                  ? colors.surfaceHover
                  : colors.surface,
            })}
          >
            <Menu size={18} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={onNewChat}
            accessibilityLabel={t("aiAssistant.newChat")}
            style={({ pressed, hovered }) => ({
              height: 40,
              width: 40,
              borderRadius: radius.md,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor:
                pressed || hovered ? colors.primaryPressed : colors.primary,
            })}
          >
            <MessageSquarePlus size={18} color={colors.textOnPrimary} />
          </Pressable>
        </View>
        <Modal visible={overlayOpen} transparent animationType="fade">
          <View style={{ flex: 1, flexDirection: "row" }}>
            <View
              style={{
                width: Math.min(SIDEBAR_MAX, 320),
                maxWidth: "86%",
                height: "100%",
                backgroundColor: colors.surfaceMuted,
                borderRightWidth: 1,
                borderRightColor: colors.border,
              }}
            >
              {expandedBody}
            </View>
            <Pressable
              style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }}
              onPress={() => setOverlayOpen(false)}
            />
          </View>
        </Modal>
      </>
    );
  }

  if (collapsed) {
    return (
      <View
        style={{
          width: SIDEBAR_COLLAPSED,
          borderRightWidth: 1,
          borderRightColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          padding: spacing.sm,
          gap: spacing.sm,
          alignItems: "center",
        }}
      >
        <Pressable
          onPress={() => setCollapsed(false)}
          accessibilityLabel={t("aiAssistant.expandSidebar")}
          style={({ pressed, hovered }) => ({
            height: 40,
            width: 40,
            borderRadius: radius.md,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: colors.borderStrong,
            backgroundColor: pressed
              ? colors.surfaceMuted
              : hovered
                ? colors.surfaceHover
                : colors.surface,
          })}
        >
          <PanelLeftOpen size={18} color={colors.text} />
        </Pressable>
        <Pressable
          onPress={onNewChat}
          accessibilityLabel={t("aiAssistant.newChat")}
          style={({ pressed, hovered }) => ({
            height: 40,
            width: 40,
            borderRadius: radius.md,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor:
              pressed || hovered ? colors.primaryPressed : colors.primary,
          })}
        >
          <MessageSquarePlus size={18} color={colors.textOnPrimary} />
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={{
        width: clampedWidth,
        borderRightWidth: 1,
        borderRightColor: colors.border,
        backgroundColor: colors.surfaceMuted,
        position: "relative",
      }}
    >
      {expandedBody}
      {Platform.OS === "web" ? (
        <View
          accessibilityRole="adjustable"
          accessibilityLabel={t("aiAssistant.resizeSidebar")}
          // @ts-expect-error web mouse drag
          onMouseDown={(event: { clientX: number; preventDefault?: () => void }) => {
            event.preventDefault?.();
            startResize(event.clientX);
          }}
          style={{
            position: "absolute",
            right: -RESIZE_HIT_WIDTH / 2,
            top: 0,
            bottom: 0,
            width: RESIZE_HIT_WIDTH,
            zIndex: 5,
            alignItems: "center",
            justifyContent: "center",
            cursor: "ew-resize" as never,
          }}
        >
          <View
            style={{
              width: 3,
              height: "100%",
              maxHeight: 64,
              borderRadius: 2,
              backgroundColor: resizing ? colors.primary : colors.borderStrong,
              opacity: resizing ? 1 : 0.55,
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
