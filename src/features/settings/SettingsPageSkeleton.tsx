import type { ReactElement } from "react";

import { SettingsRow } from "@/features/settings/SettingsRow";
import { SettingsSection } from "@/features/settings/SettingsSection";
import { isMacOsClient } from "@/lib/runtime/platform";

function SkeletonControl({ className }: { readonly className: string }): ReactElement {
  return <div className={`animate-pulse rounded-md bg-[#252525] ${className}`} aria-hidden />;
}

/** Static placeholders only — no Select/Switch/Input trees or ContentSkeleton measure. */
export function SettingsPageSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-8" aria-hidden>
      <SettingsSection title="General">
        <SettingsRow
          label="Default workspace root"
          description="Starting directory for agent file operations."
        >
          <SkeletonControl className="h-8 w-40" />
        </SettingsRow>
        <SettingsRow label="Log retention" description="Days to keep local log files.">
          <SkeletonControl className="h-8 w-16" />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Permissions">
        <SettingsRow
          label="Permission mode"
          description="How the agent requests approval before tool use."
        >
          <SkeletonControl className="h-8 w-30" />
        </SettingsRow>
        <SettingsRow
          label="Pointer / UI automation"
          description="Allow pointer, click, and type tools."
        >
          <SkeletonControl className="h-5 w-9 rounded-full" />
        </SettingsRow>
      </SettingsSection>

      {isMacOsClient() ? (
        <SettingsSection title="macOS permissions">
          <SettingsRow
            label="Accessibility"
            description="Required for pointer and UI automation tools."
          >
            <SkeletonControl className="h-8 w-16" />
          </SettingsRow>
        </SettingsSection>
      ) : null}

      <SettingsSection title="API keys">
        <SettingsRow label="Anthropic API key" description="Required for Claude models.">
          <SkeletonControl className="h-8 w-56" />
        </SettingsRow>
        <SettingsRow label="OpenAI API key" description="Required for GPT models.">
          <SkeletonControl className="h-8 w-56" />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Guardrails">
        <SettingsRow
          label="Agent mode"
          description="Live uses cloud API and tools. Demo runs offline fixtures."
        >
          <SkeletonControl className="h-8 w-24" />
        </SettingsRow>
        <SettingsRow label="Max steps" description="Maximum agent steps per run.">
          <SkeletonControl className="h-8 w-16" />
        </SettingsRow>
        <SettingsRow
          label="Max cost"
          description="Spending cap per run in USD. Set 0 for no limit."
        >
          <SkeletonControl className="h-8 w-28" />
        </SettingsRow>
        <SettingsRow
          label="Max wall-clock"
          description="Run time limit in minutes. Set 0 for no limit."
        >
          <SkeletonControl className="h-8 w-16" />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Maintenance">
        <SettingsRow
          label="Persistent approvals"
          description="Revoke saved tool approvals stored on this device."
        >
          <SkeletonControl className="h-8 w-16" />
        </SettingsRow>
        <SettingsRow label="Local logs" description="View log files stored on disk.">
          <SkeletonControl className="h-8 w-24" />
        </SettingsRow>
        <SettingsRow label="Clear all logs" description="Permanently delete all local log files.">
          <SkeletonControl className="h-8 w-14" />
        </SettingsRow>
        <SettingsRow label="Session" description="Reset in-memory timeline and execution log.">
          <SkeletonControl className="h-8 w-14" />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
