import type { ReactElement } from "react";

import { ANTHROPIC_MODEL_OPTIONS, OPENAI_MODEL_OPTIONS } from "@/agent/llm/modelCatalog";
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
import {
  settingBlockClass,
  settingDescriptionClass,
  settingHeadingClass,
  settingLeadClass,
  settingsFieldClassName,
  settingsSelectContentClassName,
  settingsSelectItemClassName,
} from "@/features/settings/settingsStyles";
import { unifiedModelOptionValue } from "@/features/settings/unifiedModelSelection";
import type { SettingsModelProviderModel } from "@/features/settings/useSettingsPageModel";

export type SettingsModelSectionProps = {
  readonly modelProvider: SettingsModelProviderModel;
};

export function SettingsModelSection(props: SettingsModelSectionProps): ReactElement {
  const { settings, updateSettings, modelSelection, providerKeys } = props.modelProvider;

  return (
    <>
      <div className={settingBlockClass}>
        <div className={settingLeadClass}>
          <Label className={settingHeadingClass}>Agent mode</Label>
          <p className={settingDescriptionClass}>
            Demo runs an offline fixture script; Live calls your chosen cloud model with tools.
          </p>
        </div>
        <Select
          value={settings.agentMode}
          onValueChange={(v) => void updateSettings({ agentMode: v })}
        >
          <SelectTrigger id="agent-mode" className={settingsFieldClassName}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className={settingsSelectContentClassName}>
            <SelectGroup>
              <SelectItem value="live" className={settingsSelectItemClassName}>
                Live (cloud API + tools)
              </SelectItem>
              <SelectItem value="demo" className={settingsSelectItemClassName}>
                Demo fixture (offline script)
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className={settingBlockClass}>
        <div className={settingLeadClass}>
          <Label className={settingHeadingClass}>Live model</Label>
          <p className={settingDescriptionClass}>
            One list for Anthropic and OpenAI. Rows stay locked until that provider&apos;s key is
            saved below; picking an unlocked row sets Live mode to that provider.
          </p>
        </div>
        <Select
          disabled={modelSelection.effectiveProvider === null}
          value={modelSelection.unifiedModelSelectValue}
          onValueChange={modelSelection.onUnifiedModelChange}
        >
          <SelectTrigger id="unified-model" className={settingsFieldClassName}>
            <SelectValue placeholder="Save an API key to choose a model" />
          </SelectTrigger>
          <SelectContent position="popper" className={settingsSelectContentClassName}>
            <SelectGroup>
              <SelectLabel className="text-neutral-500 font-medium tracking-normal">
                Anthropic
              </SelectLabel>
              {ANTHROPIC_MODEL_OPTIONS.map((opt) => (
                <SelectItem
                  key={`anthropic:${opt.id}`}
                  value={unifiedModelOptionValue("anthropic", opt.id)}
                  disabled={providerKeys.anthropic.disabled}
                  className={settingsSelectItemClassName}
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
                  disabled={providerKeys.openai.disabled}
                  className={settingsSelectItemClassName}
                >
                  {opt.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
