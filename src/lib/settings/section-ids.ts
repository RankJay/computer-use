/** Hash targets on `/settings` for deep-links (e.g. onboarding). */
export const SETTINGS_SECTION_IDS = {
  workspace: "workspace",
  apiKeys: "api-keys",
} as const;

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[keyof typeof SETTINGS_SECTION_IDS];

export function settingsSectionHref(section: keyof typeof SETTINGS_SECTION_IDS): string {
  return `/settings#${SETTINGS_SECTION_IDS[section]}`;
}
