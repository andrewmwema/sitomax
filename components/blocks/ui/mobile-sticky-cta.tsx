import type { MobileStickyCtaSettings } from "@/lib/theme/presets";
import { Button } from "./button";

export function hasMobileStickyCta(settings?: MobileStickyCtaSettings): settings is MobileStickyCtaSettings {
  return settings?.enabled === true && Boolean(settings.label.trim() && settings.href.trim());
}

export function MobileStickyCTA({ settings }: { settings?: MobileStickyCtaSettings }) {
  if (!hasMobileStickyCta(settings)) return null;

  return (
    <div className="mobile-sticky-cta" data-enabled="true">
      <Button href={settings.href} className="w-full">{settings.label}</Button>
    </div>
  );
}
