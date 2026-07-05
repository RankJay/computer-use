import type { ReactElement, ReactNode } from "react";

type SettingsSectionProps = {
  title: string;
  children: ReactNode;
};

export function SettingsSection({ title, children }: SettingsSectionProps): ReactElement {
  return (
    <section className="flex flex-col gap-3 [-webkit-app-region:no-drag]">
      <h2 className="px-4 text-sm text-white">{title}</h2>
      <div className="divide-y divide-[#252525] overflow-hidden rounded-lg border border-[#252525] bg-[#141414]">
        {children}
      </div>
    </section>
  );
}
