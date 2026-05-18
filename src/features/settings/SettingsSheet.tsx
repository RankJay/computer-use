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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { PERMISSION_MODE_LABELS } from "@/agent/toolContract";
import { BROWSER_SAMPLE_WORKSPACE_ROOT } from "@/agent/workspace/browserWorkspace";
import { SECRET_ANTHROPIC_API_KEY } from "@/agent/secrets";
import { parsePermissionMode } from "@/agent/types";
import { isTauriRuntime } from "@/agent/native/nativeBridge";
import { useLogSettingsCommands, useSecretKeySettings } from "@/features/settings/useSettingsCommands";
import { useSettings } from "@/app/providers/SettingsProvider";
import { Settings2 } from "lucide-react";

type SettingsSheetProps = {
  onResetSession: () => void;
};

const fieldClassName =
  "w-full border-white/6 bg-[#121212] text-[#CDCDCD] shadow-none placeholder:text-neutral-500 focus-visible:border-neutral-600 focus-visible:ring-neutral-600/30 dark:bg-[#121212]";
const selectContentClassName =
  "border border-white/6 bg-[#121212] text-[#CDCDCD] shadow-layered ring-0";
const selectItemClassName =
  "text-[#CDCDCD] focus:bg-[#2b2b2b] focus:text-white data-[state=checked]:text-white";
const separatorClassName = "bg-white/6";
const labelClassName = "text-[#CDCDCD]";
const helperTextClassName = "text-sm text-[#777]";
const primaryButtonClassName =
  "border-0 bg-[#2b2b2b] text-white shadow-none hover:bg-[#363636] focus-visible:ring-neutral-600";
const outlineButtonClassName =
  "border-white/6 bg-[#121212] text-[#CDCDCD] shadow-none hover:bg-[#1c1c1c] hover:text-white focus-visible:ring-neutral-600";
const destructiveButtonClassName =
  "bg-red-500/10 text-red-300 hover:bg-red-500/20 focus-visible:ring-red-500/30";

export function SettingsSheet(props: SettingsSheetProps) {
  const { settings, setPermissionMode, permissionMode, updateSettings, revokePersistedApprovals } =
    useSettings();
  const secretKey = useSecretKeySettings(SECRET_ANTHROPIC_API_KEY);
  const logs = useLogSettingsCommands();
  const isDesktop = isTauriRuntime();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 bg-transparent hover:bg-transparent shrink-0 group cursor-pointer"
          aria-label="Open settings"
        >
          <Settings2
            className="size-4 text-[#3F3F3F] group-hover:text-[#9c9c9c] transition-colors"
            strokeWidth={2}
          />
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto border-l border-white/6 bg-[#0E0E0E] text-[#CDCDCD] shadow-layered">
        <SheetHeader className="border-b border-white/6 px-4 py-5">
          <SheetTitle className="text-[#CDCDCD]">Settings</SheetTitle>
          <SheetDescription className="text-[#777]">
            BYOK, workspace, logs, and supervision.{" "}
            {isDesktop
              ? "Desktop: secrets use the OS credential store."
              : "Web: settings and keys stay in this browser only (localStorage), not on a server."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-5">
          <div className="space-y-2">
            <Label htmlFor="agent-mode" className={labelClassName}>
              Agent mode
            </Label>
            <Select
              value={settings.agentMode}
              onValueChange={(v) => void updateSettings({ agentMode: v })}
            >
              <SelectTrigger id="agent-mode" className={fieldClassName}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={selectContentClassName}>
                <SelectItem value="live" className={selectItemClassName}>
                  Live (Anthropic API + tools)
                </SelectItem>
                <SelectItem value="demo" className={selectItemClassName}>
                  Demo fixture (offline script)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model-id" className={labelClassName}>
              Anthropic model id
            </Label>
            <Input
              id="model-id"
              value={settings.modelId}
              onChange={(e) => void updateSettings({ modelId: e.currentTarget.value })}
              autoComplete="off"
              className={fieldClassName}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="api-key" className={labelClassName}>
              Anthropic API key ({isDesktop ? "OS keychain" : "browser localStorage"})
            </Label>
            <Input
              id="api-key"
              type="password"
              value={secretKey.apiKeyDraft}
              onChange={(e) => secretKey.setApiKeyDraft(e.currentTarget.value)}
              placeholder={secretKey.hasStoredKey ? "Key on file — paste to replace" : "sk-ant-…"}
              autoComplete="off"
              className={fieldClassName}
            />
            {secretKey.apiKeyError ? (
              <p className="text-sm text-destructive">{secretKey.apiKeyError}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className={primaryButtonClassName}
                onClick={() => void secretKey.saveSecret()}
              >
                Save API key
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={outlineButtonClassName}
                onClick={() => void secretKey.removeSecret()}
              >
                Remove key
              </Button>
            </div>
          </div>

          <Separator className={separatorClassName} />

          <div className="space-y-2">
            <Label htmlFor="workspace-settings" className={labelClassName}>
              Default workspace root
            </Label>
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
            <p className={helperTextClassName}>
              {isDesktop ? (
                <>
                  Absolute folder path for file tools and default shell cwd. Example:{" "}
                  <code className="text-xs text-[#9c9c9c]">D:\Projects\actuate</code>.
                </>
              ) : (
                <>
                  Web builds read static files from{" "}
                  <code className="text-xs text-[#9c9c9c]">/browser-samples</code>. Use{" "}
                  <code className="text-xs text-[#9c9c9c]">{BROWSER_SAMPLE_WORKSPACE_ROOT}</code>{" "}
                  (default) so file and list tools work without a desktop path.
                </>
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="retention" className={labelClassName}>
              Log retention (days, 0 = keep)
            </Label>
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

          <div className="space-y-2">
            <Label htmlFor="permission-mode" className={labelClassName}>
              Permission mode
            </Label>
            <Select
              value={permissionMode}
              onValueChange={(value) => void setPermissionMode(parsePermissionMode(value))}
            >
              <SelectTrigger id="permission-mode" className={fieldClassName}>
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent className={selectContentClassName}>
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

          <div className="flex items-center gap-2">
            <input
              id="ui-auto"
              type="checkbox"
              aria-labelledby="ui-auto-label"
              className="size-4 rounded border border-white/12 accent-[#3F3F3F]"
              checked={settings.uiAutomationEnabled}
              onChange={(e) =>
                void updateSettings({ uiAutomationEnabled: e.currentTarget.checked })
              }
            />
            <Label id="ui-auto-label" htmlFor="ui-auto" className="font-normal text-[#CDCDCD]">
              Allow pointer / click / type tools (dangerous — enable only in trusted setups)
            </Label>
          </div>

          <Separator className={separatorClassName} />

          <div className="space-y-2">
            <div className="text-sm font-medium text-[#CDCDCD]">Persistent approvals</div>
            <p className={helperTextClassName}>
              Clear &quot;always allow&quot; tool decisions stored in settings.
            </p>
            <Button
              variant="outline"
              className={outlineButtonClassName}
              onClick={() => void revokePersistedApprovals()}
            >
              Revoke saved tool approvals
            </Button>
          </div>

          <Separator className={separatorClassName} />

          <div className="space-y-2">
            <div className="text-sm font-medium text-[#CDCDCD]">Local logs</div>
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
              <DialogContent className="border border-white/6 bg-[#0E0E0E] text-[#CDCDCD] shadow-layered ring-0">
                <DialogHeader>
                  <DialogTitle className="text-[#CDCDCD]">Clear all local logs?</DialogTitle>
                  <DialogDescription className="text-[#777]">
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

          <div className="space-y-2">
            <div className="text-sm font-medium text-[#CDCDCD]">Session</div>
            <p className={helperTextClassName}>
              Clear timeline, execution log, and pending permission prompts in the UI.
            </p>
            <Button
              variant="outline"
              className={outlineButtonClassName}
              onClick={props.onResetSession}
            >
              Reset session
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
