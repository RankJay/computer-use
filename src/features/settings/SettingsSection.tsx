import type { ReactElement, ReactNode } from "react";

type SettingsSectionProps = {
  title: string;
  children: ReactNode;
  id?: string;
};

export function SettingsSection({ title, children, id }: SettingsSectionProps): ReactElement {
  return (
    <section id={id} className="flex flex-col gap-3 scroll-mt-4">
      <h2 className="px-4 text-sm text-foreground">{title}</h2>
      <div className="divide-y divide-[#252525] overflow-hidden rounded-xl shadow-layered text-foreground bg-[#141414]">
        {children}
      </div>
    </section>
  );
}
