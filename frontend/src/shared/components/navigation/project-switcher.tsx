import { ChevronDown, FolderOpen } from "lucide-react-native";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ProjectSwitcherPanel } from "@/features/projects/components/ProjectSwitcherPanel";
import { useActiveProject } from "@/features/projects/providers/active-project-provider";
import { hrefForAppRoute } from "@/config/navigation";
import { useTranslation } from "@/i18n";
import { AdaptiveOverlay } from "@/shared/components/adaptive/adaptive-overlay";
import { AdaptivePopover } from "@/shared/components/adaptive/adaptive-popover";
import { TOUCH_TARGET_MIN } from "@/shared/constants/layout";
import { useAppTheme } from "@/shared/hooks/use-app-theme";

type Props = {
  collapsed?: boolean;
  onNavigate?: () => void;
  onPrimaryBackground?: boolean;
  sidebarVariant?: boolean;
};

const MENU_WIDTH = 280;

export function ProjectSwitcher({
  collapsed = false,
  onNavigate,
  onPrimaryBackground = false,
  sidebarVariant = false,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const router = useRouter();
  const anchorRef = useRef<View>(null);
  const { projects, activeProject, activeProjectId, loading, switchProject } =
    useActiveProject();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const { t } = useTranslation();
  const useSheet = collapsed || Platform.OS !== "web";
  const projectName = activeProject?.name ?? t("projects.dropdown.switchLabel");
  const projectDescription =
    activeProject?.description ?? t("projects.dropdown.noProjectDescription");
  const triggerBorder = sidebarVariant
    ? colors.border
    : onPrimaryBackground
      ? "rgba(255,255,255,0.2)"
      : colors.border;
  const triggerBackground = sidebarVariant
    ? "transparent"
    : onPrimaryBackground
      ? "transparent"
      : colors.surface;
  const triggerBackgroundPressed = sidebarVariant
    ? colors.surfaceMuted
    : onPrimaryBackground
      ? "rgba(255,255,255,0.1)"
      : colors.surfaceMuted;
  const triggerBackgroundHovered = sidebarVariant
    ? colors.surfaceHover
    : onPrimaryBackground
      ? "rgba(255,255,255,0.06)"
      : colors.surfaceHover;
  const triggerText = sidebarVariant
    ? colors.text
    : onPrimaryBackground
      ? colors.textOnPrimary
      : colors.text;
  const triggerMuted = sidebarVariant
    ? colors.textMuted
    : onPrimaryBackground
      ? colors.textOnPrimary
      : colors.textMuted;
  const triggerAccent = sidebarVariant
    ? colors.primary
    : onPrimaryBackground
      ? colors.textOnPrimary
      : colors.primary;
  const iconWrapBackground = sidebarVariant
    ? colors.surfaceMuted
    : onPrimaryBackground
      ? "rgba(255,255,255,0.12)"
      : colors.surfaceMuted;

  const closeMenus = useCallback(() => {
    setMenuOpen(false);
    setSheetOpen(false);
    setMenuAnchor(null);
  }, []);

  const openPicker = useCallback(() => {
    if (useSheet) {
      setSheetOpen(true);
      return;
    }
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ top: y, left: x, width, height });
      setMenuOpen(true);
    });
  }, [useSheet]);

  const handleSelectProject = useCallback(
    async (projectId: string) => {
      if (projectId === activeProjectId) {
        closeMenus();
        return;
      }
      setSwitchingId(projectId);
      try {
        await switchProject(projectId);
        closeMenus();
        onNavigate?.();
      } catch {
        // error handled in provider
      } finally {
        setSwitchingId(null);
      }
    },
    [activeProjectId, closeMenus, onNavigate, switchProject],
  );

  const handleManageProjects = useCallback(() => {
    closeMenus();
    router.push(hrefForAppRoute("projects"));
    onNavigate?.();
  }, [closeMenus, onNavigate, router]);

  const trigger = collapsed ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        activeProject
          ? t("projects.switch.a11y.current", { name: activeProject.name })
          : t("projects.switch.a11y.trigger")
      }
      accessibilityState={{ expanded: menuOpen || sheetOpen }}
      onPress={openPicker}
      style={({ pressed, hovered }) => [
        styles.collapsedTrigger,
        {
          borderRadius: surfaceRadius.button,
          borderColor: triggerBorder,
          backgroundColor: pressed
            ? triggerBackgroundPressed
            : hovered
              ? triggerBackgroundHovered
              : triggerBackground,
        },
      ]}
    >
      {loading && !activeProject ? (
        <ActivityIndicator color={triggerAccent} />
      ) : (
        <FolderOpen size={18} color={triggerAccent} />
      )}
    </Pressable>
  ) : (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        activeProject
          ? t("projects.switch.a11y.current", { name: activeProject.name })
          : t("projects.switch.a11y.trigger")
      }
      accessibilityState={{ expanded: menuOpen || sheetOpen }}
      onPress={openPicker}
      style={({ pressed, hovered }) => [
        styles.trigger,
        {
          borderRadius: surfaceRadius.button,
          borderColor: triggerBorder,
          backgroundColor: pressed
            ? triggerBackgroundPressed
            : hovered
              ? triggerBackgroundHovered
              : triggerBackground,
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
          gap: spacing.sm,
        },
      ]}
    >
      <View
        style={[
          styles.triggerIcon,
          {
            borderRadius: surfaceRadius.button,
            borderColor: triggerBorder,
            backgroundColor: iconWrapBackground,
          },
        ]}
      >
        {loading && !activeProject ? (
          <ActivityIndicator color={triggerAccent} size="small" />
        ) : (
          <FolderOpen size={16} color={triggerAccent} />
        )}
      </View>
      <View style={styles.triggerText}>
        <Text
          style={[typography.body, styles.triggerName, { color: triggerText }]}
          numberOfLines={1}
        >
          {projectName}
        </Text>
        <Text
          style={[
            typography.caption,
            styles.triggerDescription,
            { color: triggerMuted },
          ]}
          numberOfLines={1}
        >
          {projectDescription}
        </Text>
      </View>
      <ChevronDown size={16} color={triggerMuted} />
    </Pressable>
  );

  return (
    <>
      <View ref={anchorRef} collapsable={false} style={styles.anchor}>
        {trigger}
      </View>

      <AdaptivePopover
        visible={menuOpen}
        onClose={closeMenus}
        anchor={menuAnchor}
        popoverWidth={Math.max(menuAnchor?.width ?? MENU_WIDTH, 240)}
        title={t("projects.switch.title")}
        accessibilityLabel={t("projects.switch.title")}
        contentStyle={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.xs }}
      >
        <ProjectSwitcherPanel
          projects={projects}
          activeProjectId={activeProjectId}
          loading={loading || switchingId != null}
          onSelectProject={(project) => void handleSelectProject(project.id)}
          onManageProjects={handleManageProjects}
        />
      </AdaptivePopover>

      <AdaptiveOverlay
        visible={sheetOpen}
        title={t("projects.switch.title")}
        subtitle={t("projects.switch.subtitle")}
        onClose={closeMenus}
        scrollable={false}
        flushBody
        accessibilityLabel={t("projects.switch.title")}
      >
        <ProjectSwitcherPanel
          projects={projects}
          activeProjectId={activeProjectId}
          loading={loading || switchingId != null}
          onSelectProject={(project) => void handleSelectProject(project.id)}
          onManageProjects={handleManageProjects}
        />
      </AdaptiveOverlay>
    </>
  );
}

const styles = StyleSheet.create({
  anchor: {
    width: "100%",
  },
  trigger: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    minHeight: 56,
  },
  triggerIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderWidth: 1,
  },
  triggerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  triggerName: {},
  triggerDescription: {
    lineHeight: 16,
  },
  collapsedTrigger: {
    width: TOUCH_TARGET_MIN,
    height: TOUCH_TARGET_MIN,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    alignSelf: "center",
  },
});
