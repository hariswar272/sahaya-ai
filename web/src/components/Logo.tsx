import { HeartHandshake } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

/** Brand mark: gradient tile with a helping-hands icon (language-neutral). */
export function LogoMark({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  return (
    <span aria-hidden className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-sos text-white shadow-sm", className)}>
      <HeartHandshake aria-hidden="true" className={cn("h-5 w-5", iconClassName)} strokeWidth={2.2} />
    </span>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  const { t } = useLang();
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="leading-tight">
        <span className="block text-[15px] font-extrabold tracking-tight text-ink">Sahaya AI</span>
        {!compact && <span className="te block text-xs font-medium text-slate-500">{t("మీ AI సహాయకుడు", "Your AI helper")}</span>}
      </span>
    </span>
  );
}
