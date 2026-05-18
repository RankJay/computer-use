import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useAgentSessionContext } from "@/features/control-center/AgentSessionProvider";
import { MinimizeWindowButton, TitleBarDragRegion } from "@/features/control-center/windowFrame";
import { PERMISSION_MODE_LABELS } from "@/agent/toolContract";
import { ANTHROPIC_MODEL_OPTIONS, OPENAI_MODEL_OPTIONS } from "@/agent/llm/modelCatalog";
import { resolveEffectiveProvider } from "@/agent/llm/resolveEffectiveProvider";
import type { LlmApiProvider } from "@/agent/native/tauriIpc";
import { BROWSER_SAMPLE_WORKSPACE_ROOT } from "@/agent/workspace/browserWorkspace";
import { SECRET_ANTHROPIC_API_KEY, SECRET_OPENAI_API_KEY } from "@/agent/secrets";
import { parsePermissionMode } from "@/agent/types";
import { isTauriRuntime } from "@/agent/native/nativeBridge";
import {
  useLogSettingsCommands,
  useSecretKeySettings,
} from "@/features/settings/useSettingsCommands";
import { useSettings } from "@/app/providers/SettingsProvider";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { useCallback, useMemo } from "react";

const UNIFIED_MODEL_KEY_SEP = ":";

function unifiedModelOptionValue(provider: LlmApiProvider, modelId: string): string {
  return `${provider}${UNIFIED_MODEL_KEY_SEP}${modelId}`;
}

function parseUnifiedModelOptionValue(
  value: string,
): { provider: LlmApiProvider; modelId: string } | null {
  const i = value.indexOf(UNIFIED_MODEL_KEY_SEP);
  if (i <= 0 || i === value.length - 1) return null;
  const providerRaw = value.slice(0, i);
  const modelId = value.slice(i + UNIFIED_MODEL_KEY_SEP.length);
  const provider: LlmApiProvider = providerRaw === "openai" ? "openai" : "anthropic";
  return { provider, modelId };
}

const fieldClassName =
  "w-full border-white/6 bg-[#121212] text-[#cdcdcd] shadow-none placeholder:text-neutral-500 focus-visible:border-neutral-600 focus-visible:ring-neutral-600/30 dark:bg-[#121212]";
const selectContentClassName =
  "border border-white/6 bg-[#121212] text-[#cdcdcd] shadow-layered ring-0";
const selectItemClassName =
  "text-[#cdcdcd] focus:bg-[#2b2b2b] focus:text-[#fefefe] data-[state=checked]:text-[#fefefe]";
const separatorClassName = "bg-white/6";

/** Section heading — text-sm */
const settingHeadingClass = "block text-sm font-normal text-[#eaeaea] cursor-default select-none";
/** Lead copy under heading — text-xs */
const settingDescriptionClass = "text-xs font-medium leading-snug text-neutral-500";
/** Stack per settings row: spacing above/below groups */
const settingBlockClass = "flex flex-col gap-3";
/** Title + optional description cluster */
const settingLeadClass = "flex flex-col gap-1";
/** Anything below the primary control — captions/errors extra-small */
const ancillaryTextClass = "text-[11px] leading-snug text-neutral-500";
const ancillaryErrorClass = "text-[11px] leading-snug text-destructive";

const primaryButtonClassName =
  "border-0 bg-[#2b2b2b] text-[#fefefe] shadow-none hover:bg-[#363636] focus-visible:ring-neutral-600";
const outlineButtonClassName =
  "border-white/6 bg-[#121212] text-[#cdcdcd] shadow-none hover:bg-[#1c1c1c] hover:text-[#fefefe] focus-visible:ring-neutral-600";
const destructiveButtonClassName =
  "bg-red-500/10 text-red-300 hover:bg-red-500/20 focus-visible:ring-red-500/30";

export function SettingsPage() {
  const { resetSession } = useAgentSessionContext();
  const { settings, setPermissionMode, permissionMode, updateSettings, revokePersistedApprovals } =
    useSettings();
  const anthropicKey = useSecretKeySettings(SECRET_ANTHROPIC_API_KEY);
  const openaiKey = useSecretKeySettings(SECRET_OPENAI_API_KEY);
  const logs = useLogSettingsCommands();
  const isDesktop = isTauriRuntime();

  const effectiveProvider = useMemo(
    () =>
      resolveEffectiveProvider(
        settings.activeApiProvider,
        anthropicKey.hasStoredKey,
        openaiKey.hasStoredKey,
      ),
    [settings.activeApiProvider, anthropicKey.hasStoredKey, openaiKey.hasStoredKey],
  );

  const unifiedModelSelectValue = useMemo((): string | undefined => {
    if (!effectiveProvider) return undefined;
    const modelId =
      effectiveProvider === "anthropic" ? settings.anthropicModelId : settings.openaiModelId;
    return unifiedModelOptionValue(effectiveProvider, modelId);
  }, [effectiveProvider, settings.anthropicModelId, settings.openaiModelId]);

  const onUnifiedModelChange = useCallback(
    (value: string) => {
      const parsed = parseUnifiedModelOptionValue(value);
      if (!parsed) return;
      if (parsed.provider === "anthropic") {
        void updateSettings({ anthropicModelId: parsed.modelId, activeApiProvider: "anthropic" });
      } else {
        void updateSettings({ openaiModelId: parsed.modelId, activeApiProvider: "openai" });
      }
    },
    [updateSettings],
  );

  const storageHint = isDesktop ? "OS keychain" : "browser localStorage";

  const backButtonClassName =
    "size-8 shrink-0 bg-transparent hover:bg-transparent cursor-pointer group [-webkit-app-region:no-drag]";

  return (
    <div className="box-border flex h-full min-h-dvh w-full flex-col gap-0 overflow-hidden rounded-none border-0 bg-[#0E0E0E] p-2 text-[#cdcdcd] shadow-none ring-0">
      <header className="relative flex min-h-[44px] shrink-0 select-none items-center gap-2 border-b border-white/6 px-2">
        <Button type="button" size="icon" variant="ghost" className={backButtonClassName} asChild>
          <Link to="/" aria-label="Back to home">
            <ArrowLeft
              className="size-4 text-[#3F3F3F] group-hover:text-[#9c9c9c] transition-colors"
              strokeWidth={2}
            />
          </Link>
        </Button>
        <h1 className="shrink-0 text-base font-medium tracking-tight text-[#eaeaea] [-webkit-app-region:no-drag]">
          Settings
        </h1>
        <TitleBarDragRegion className="min-h-[44px] min-w-8 flex-1 self-stretch rounded-md" />
        <MinimizeWindowButton />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-8 pt-6 scrollbar-none">
        <div className="mx-auto max-w-2xl space-y-8 px-2 sm:px-4">
          <p className="text-sm text-neutral-500">
            BYOK, workspace, logs, and supervision.{" "}
            {isDesktop
              ? "Desktop: secrets use the OS credential store."
              : "Web: settings and keys stay in this browser only (localStorage), not on a server."}
          </p>

          <div className={settingBlockClass}>
            <div className={settingLeadClass}>
              <Label htmlFor="agent-mode" className={settingHeadingClass}>
                Agent mode
              </Label>
              <p className={settingDescriptionClass}>
                Demo runs an offline fixture script; Live calls your chosen cloud model with tools.
              </p>
            </div>
            <Select
              value={settings.agentMode}
              onValueChange={(v) => void updateSettings({ agentMode: v })}
            >
              <SelectTrigger id="agent-mode" className={fieldClassName}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className={selectContentClassName}>
                <SelectGroup>
                  <SelectItem value="live" className={selectItemClassName}>
                    Live (cloud API + tools)
                  </SelectItem>
                  <SelectItem value="demo" className={selectItemClassName}>
                    Demo fixture (offline script)
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className={settingBlockClass}>
            <div className={settingLeadClass}>
              <Label htmlFor="unified-model" className={settingHeadingClass}>
                Live model
              </Label>
              <p className={settingDescriptionClass}>
                One list for Anthropic and OpenAI. Rows stay locked until that provider&apos;s key
                is saved below; picking an unlocked row sets Live mode to that provider.
              </p>
            </div>
            <Select
              disabled={effectiveProvider === null}
              value={unifiedModelSelectValue}
              onValueChange={onUnifiedModelChange}
            >
              <SelectTrigger id="unified-model" className={fieldClassName}>
                <SelectValue placeholder="Save an API key to choose a model" />
              </SelectTrigger>
              <SelectContent position="popper" className={selectContentClassName}>
                <SelectGroup>
                  <SelectLabel className="text-neutral-500 font-medium tracking-normal">
                    Anthropic
                  </SelectLabel>
                  {ANTHROPIC_MODEL_OPTIONS.map((opt) => (
                    <SelectItem
                      key={`anthropic:${opt.id}`}
                      value={unifiedModelOptionValue("anthropic", opt.id)}
                      disabled={!anthropicKey.hasStoredKey}
                      className={selectItemClassName}
                    >
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectSeparator className="bg-white/6" />
                <SelectGroup>
                  <SelectLabel className="text-neutral-500">OpenAI</SelectLabel>
                  {OPENAI_MODEL_OPTIONS.map((opt) => (
                    <SelectItem
                      key={`openai:${opt.id}`}
                      value={unifiedModelOptionValue("openai", opt.id)}
                      disabled={!openaiKey.hasStoredKey}
                      className={selectItemClassName}
                    >
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className={settingBlockClass}>
            <div className={settingLeadClass}>
              <Label htmlFor="anthropic-api-key" className={settingHeadingClass}>
                Anthropic API key
              </Label>
              <p className={settingDescriptionClass}>Stored in {storageHint}. Paste to replace.</p>
            </div>
            <Input
              id="anthropic-api-key"
              type="password"
              value={anthropicKey.apiKeyDraft}
              onChange={(e) => anthropicKey.setApiKeyDraft(e.currentTarget.value)}
              placeholder={
                anthropicKey.hasStoredKey ? "Key on file — paste to replace" : "sk-ant-api03-…"
              }
              autoComplete="off"
              className={fieldClassName}
            />
            <div className="flex flex-col gap-2">
              {anthropicKey.apiKeyError ? (
                <p className={ancillaryErrorClass}>{anthropicKey.apiKeyError}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className={primaryButtonClassName}
                  onClick={() => void anthropicKey.saveSecret()}
                >
                  Save Anthropic key
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className={outlineButtonClassName}
                  onClick={() => void anthropicKey.removeSecret()}
                >
                  Remove Anthropic key
                </Button>
              </div>
            </div>
          </div>

          <div className={settingBlockClass}>
            <div className={settingLeadClass}>
              <Label htmlFor="openai-api-key" className={settingHeadingClass}>
                OpenAI API key
              </Label>
              <p className={settingDescriptionClass}>Stored in {storageHint}. Paste to replace.</p>
            </div>
            <Input
              id="openai-api-key"
              type="password"
              value={openaiKey.apiKeyDraft}
              onChange={(e) => openaiKey.setApiKeyDraft(e.currentTarget.value)}
              placeholder={openaiKey.hasStoredKey ? "Key on file — paste to replace" : "sk-…"}
              autoComplete="off"
              className={fieldClassName}
            />
            <div className="flex flex-col gap-2">
              {openaiKey.apiKeyError ? (
                <p className={ancillaryErrorClass}>{openaiKey.apiKeyError}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className={primaryButtonClassName}
                  onClick={() => void openaiKey.saveSecret()}
                >
                  Save OpenAI key
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className={outlineButtonClassName}
                  onClick={() => void openaiKey.removeSecret()}
                >
                  Remove OpenAI key
                </Button>
              </div>
            </div>
          </div>

          <Separator className={separatorClassName} />

          <div className={settingBlockClass}>
            <div className={settingLeadClass}>
              <Label htmlFor="workspace-settings" className={settingHeadingClass}>
                Default workspace root
              </Label>
              <p className={settingDescriptionClass}>
                {isDesktop ? (
                  <>
                    Absolute folder for file tools and default shell cwd (example{" "}
                    <code className="rounded bg-[#161616] px-1 py-0.5 font-mono text-[10px] text-[#9ca3af]">
                      D:\Projects\actuate
                    </code>
                    ).
                  </>
                ) : (
                  <>
                    Web builds read from{" "}
                    <code className="rounded bg-[#161616] px-1 py-0.5 font-mono text-[10px] text-[#9ca3af]">
                      /browser-samples
                    </code>
                    ; use{" "}
                    <code className="rounded bg-[#161616] px-1 py-0.5 font-mono text-[10px] text-[#9ca3af]">
                      {BROWSER_SAMPLE_WORKSPACE_ROOT}
                    </code>{" "}
                    unless you override.
                  </>
                )}
              </p>
            </div>
            <Input
              id="workspace-settings"
              value={settings.workspaceRoot ?? ""}
              onChange={(e) =>
                void updateSettings({
                  workspaceRoot:
                    e.currentTarget.value.trim() === "" ? null : e.currentTarget.value.trim(),
                })
              }
              placeholder={isDesktop ? "Path to repository" : BROWSER_SAMPLE_WORKSPACE_ROOT}
              autoComplete="off"
              className={fieldClassName}
            />
          </div>

          <div className={settingBlockClass}>
            <div className={settingLeadClass}>
              <Label htmlFor="retention" className={settingHeadingClass}>
                Log retention (days)
              </Label>
              <p className={settingDescriptionClass}>
                Drop session folders older than this many days; use 0 to keep everything.
              </p>
            </div>
            <Input
              id="retention"
              type="number"
              min={0}
              value={settings.retentionDays}
              onChange={(e) =>
                void updateSettings({
                  retentionDays: Math.max(0, Math.floor(Number(e.currentTarget.value) || 0)),
                })
              }
              className={fieldClassName}
            />
          </div>

          <div className={settingBlockClass}>
            <div className={settingLeadClass}>
              <Label htmlFor="permission-mode" className={settingHeadingClass}>
                Permission mode
              </Label>
              <p className={settingDescriptionClass}>
                How often Actuate asks before risky tools run or UI automation acts.
              </p>
            </div>
            <Select
              value={permissionMode}
              onValueChange={(value) => void setPermissionMode(parsePermissionMode(value))}
            >
              <SelectTrigger id="permission-mode" className={fieldClassName}>
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent position="popper" className={selectContentClassName}>
                <SelectItem value="ask_risky" className={selectItemClassName}>
                  {PERMISSION_MODE_LABELS.ask_risky}
                </SelectItem>
                <SelectItem value="ask_all" className={selectItemClassName}>
                  {PERMISSION_MODE_LABELS.ask_all}
                </SelectItem>
                <SelectItem value="session_low_risk" className={selectItemClassName}>
                  {PERMISSION_MODE_LABELS.session_low_risk}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className={settingBlockClass}>
            <div className={settingLeadClass}>
              <div id="ui-auto-heading" className={settingHeadingClass}>
                Pointer / UI automation
              </div>
              <p className={settingDescriptionClass}>
                Lets the agent drive clicks and typing on screen — only enable on trusted machines.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <input
                id="ui-auto"
                type="checkbox"
                aria-labelledby="ui-auto-heading"
                className="mt-0.5 size-4 shrink-0 rounded border border-white/12 accent-[#3F3F3F]"
                checked={settings.uiAutomationEnabled}
                onChange={(e) =>
                  void updateSettings({ uiAutomationEnabled: e.currentTarget.checked })
                }
              />
              <Label htmlFor="ui-auto" className="text-xs font-normal leading-snug text-[#cdcdcd]">
                Allow pointer, click, and type tools for visible UI.
              </Label>
            </div>
            <p className={ancillaryTextClass}>
              Requires Live mode and careful supervision — misuse can affect other apps.
            </p>
          </div>

          <Separator className={separatorClassName} />

          <div className={settingBlockClass}>
            <div className={settingLeadClass}>
              <div className={settingHeadingClass}>Persistent approvals</div>
              <p className={settingDescriptionClass}>
                Clear &quot;always allow&quot; tool choices saved with settings.
              </p>
            </div>
            <Button
              variant="outline"
              className={outlineButtonClassName}
              onClick={() => void revokePersistedApprovals()}
            >
              Revoke saved tool approvals
            </Button>
          </div>

          <Separator className={separatorClassName} />

          <div className={settingBlockClass}>
            <div className={settingLeadClass}>
              <div className={settingHeadingClass}>Local logs</div>
              <p className={settingDescriptionClass}>
                Session transcripts and keyframes on disk; clearing cannot be undone.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className={outlineButtonClassName}
                onClick={() => void logs.openLogsFolder()}
              >
                Open logs folder
              </Button>
              <Button
                variant="destructive"
                className={destructiveButtonClassName}
                onClick={() => logs.setConfirmClearLogsOpen(true)}
              >
                Clear all logs
              </Button>
            </div>
            <Dialog open={logs.confirmClearLogsOpen} onOpenChange={logs.setConfirmClearLogsOpen}>
              <DialogContent className="border border-white/6 bg-[#0E0E0E] text-[#cdcdcd] shadow-layered ring-0">
                <DialogHeader>
                  <DialogTitle className="text-[#eaeaea]">Clear all local logs?</DialogTitle>
                  <DialogDescription className="text-neutral-500">
                    This deletes local session logs and keyframes from this device.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="border-t border-white/6 bg-[#121212]">
                  <DialogClose asChild>
                    <Button variant="outline" className={outlineButtonClassName}>
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button
                    variant="destructive"
                    className={destructiveButtonClassName}
                    onClick={logs.clearLogs}
                  >
                    Clear logs
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Separator className={separatorClassName} />

          <div className={settingBlockClass}>
            <div className={settingLeadClass}>
              <div className={settingHeadingClass}>Session</div>
              <p className={settingDescriptionClass}>
                Reset only the in-memory timeline and execution log for this window.
              </p>
            </div>
            <Button variant="outline" className={outlineButtonClassName} onClick={resetSession}>
              Reset session
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
