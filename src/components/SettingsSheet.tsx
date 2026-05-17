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
import { BROWSER_SAMPLE_WORKSPACE_ROOT } from "@/agent/browserWorkspace";
import {
  clearAllLogs,
  deleteSecretKey,
  loadSecretKey,
  openLogsFolder,
  storeSecretKey,
} from "@/agent/settingsApi";
import { SECRET_ANTHROPIC_API_KEY } from "@/agent/secrets";
import type { PermissionMode } from "@/agent/types";
import { isTauriRuntime } from "@/agent/nativeBridge";
import { useSettings } from "@/providers/settings-provider";
import { Settings2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type SettingsSheetProps = {
  onResetSession: () => void;
};

function parsePermissionMode(value: string): PermissionMode {
  switch (value) {
    case "ask_risky":
    case "ask_all":
    case "session_low_risk":
      return value;
    default:
      return "ask_risky";
  }
}

export function SettingsSheet(props: SettingsSheetProps) {
  const { settings, setPermissionMode, permissionMode, updateSettings, revokePersistedApprovals } =
    useSettings();

  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [confirmClearLogsOpen, setConfirmClearLogsOpen] = useState(false);

  const refreshKeyState = useCallback(async () => {
    try {
      const v = await loadSecretKey(SECRET_ANTHROPIC_API_KEY);
      setHasStoredKey(!!v && v.length > 0);
      setApiKeyError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setApiKeyError(
        isTauriRuntime()
          ? `Could not read key from OS store: ${msg}`
          : `Could not read key from browser storage: ${msg}`,
      );
      setHasStoredKey(false);
    }
  }, []);

  useEffect(() => {
    void refreshKeyState();
  }, [refreshKeyState]);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 bg-stone-900 shrink-0"
          aria-label="Open settings"
        >
          <Settings2 className="size-4" color="#CDCDCD" />
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            BYOK, workspace, logs, and supervision.{" "}
            {isTauriRuntime()
              ? "Desktop: secrets use the OS credential store."
              : "Web: settings and keys stay in this browser only (localStorage), not on a server."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="agent-mode">Agent mode</Label>
            <Select
              value={settings.agentMode}
              onValueChange={(v) => void updateSettings({ agentMode: v })}
            >
              <SelectTrigger id="agent-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="live">Live (Anthropic API + tools)</SelectItem>
                <SelectItem value="demo">Demo fixture (offline script)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model-id">Anthropic model id</Label>
            <Input
              id="model-id"
              value={settings.modelId}
              onChange={(e) => void updateSettings({ modelId: e.currentTarget.value })}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="api-key">
              Anthropic API key ({isTauriRuntime() ? "OS keychain" : "browser localStorage"})
            </Label>
            <Input
              id="api-key"
              type="password"
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.currentTarget.value)}
              placeholder={hasStoredKey ? "Key on file — paste to replace" : "sk-ant-…"}
              autoComplete="off"
            />
            {apiKeyError ? <p className="text-sm text-destructive">{apiKeyError}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  const v = apiKeyDraft.trim();
                  if (!v) return;
                  setApiKeyError(null);
                  try {
                    await storeSecretKey(SECRET_ANTHROPIC_API_KEY, v);
                    setApiKeyDraft("");
                    await refreshKeyState();
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    setApiKeyError(`Save failed: ${msg}`);
                  }
                }}
              >
                Save API key
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  setApiKeyError(null);
                  try {
                    await deleteSecretKey(SECRET_ANTHROPIC_API_KEY);
                    await refreshKeyState();
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    setApiKeyError(`Remove failed: ${msg}`);
                  }
                }}
              >
                Remove key
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="workspace-settings">Default workspace root</Label>
            <Input
              id="workspace-settings"
              value={settings.workspaceRoot ?? ""}
              onChange={(e) =>
                void updateSettings({
                  workspaceRoot:
                    e.currentTarget.value.trim() === "" ? null : e.currentTarget.value.trim(),
                })
              }
              placeholder={isTauriRuntime() ? "Path to repository" : BROWSER_SAMPLE_WORKSPACE_ROOT}
              autoComplete="off"
            />
            <p className="text-sm text-muted-foreground">
              {isTauriRuntime() ? (
                <>
                  Absolute folder path for file tools and default shell cwd. Example:{" "}
                  <code className="text-xs">D:\Projects\actuate</code>.
                </>
              ) : (
                <>
                  Web builds read static files from{" "}
                  <code className="text-xs">/browser-samples</code>. Use{" "}
                  <code className="text-xs">{BROWSER_SAMPLE_WORKSPACE_ROOT}</code> (default) so file
                  and list tools work without a desktop path.
                </>
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="retention">Log retention (days, 0 = keep)</Label>
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
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="permission-mode">Permission mode</Label>
            <Select
              value={permissionMode}
              onValueChange={(value) => void setPermissionMode(parsePermissionMode(value))}
            >
              <SelectTrigger id="permission-mode">
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ask_risky">{PERMISSION_MODE_LABELS.ask_risky}</SelectItem>
                <SelectItem value="ask_all">{PERMISSION_MODE_LABELS.ask_all}</SelectItem>
                <SelectItem value="session_low_risk">
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
              className="size-4 rounded border"
              checked={settings.uiAutomationEnabled}
              onChange={(e) =>
                void updateSettings({ uiAutomationEnabled: e.currentTarget.checked })
              }
            />
            <Label id="ui-auto-label" htmlFor="ui-auto" className="font-normal">
              Allow pointer / click / type tools (dangerous — enable only in trusted setups)
            </Label>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="text-sm font-medium">Persistent approvals</div>
            <p className="text-sm text-muted-foreground">
              Clear &quot;always allow&quot; tool decisions stored in settings.
            </p>
            <Button variant="outline" onClick={() => void revokePersistedApprovals()}>
              Revoke saved tool approvals
            </Button>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="text-sm font-medium">Local logs</div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void openLogsFolder()}>
                Open logs folder
              </Button>
              <Button variant="destructive" onClick={() => setConfirmClearLogsOpen(true)}>
                Clear all logs
              </Button>
            </div>
            <Dialog open={confirmClearLogsOpen} onOpenChange={setConfirmClearLogsOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Clear all local logs?</DialogTitle>
                  <DialogDescription>
                    This deletes local session logs and keyframes from this device.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setConfirmClearLogsOpen(false);
                      void clearAllLogs();
                    }}
                  >
                    Clear logs
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="text-sm font-medium">Session</div>
            <p className="text-sm text-muted-foreground">
              Clear timeline, execution log, and pending permission prompts in the UI.
            </p>
            <Button variant="outline" onClick={props.onResetSession}>
              Reset session
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
