import { useLocation } from "react-router-dom";
import { Compass, Home } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { useLang } from "@/lib/i18n";

const MODULE_PATH = /^\/(console\/)?(sos|arogya|rythu|scam|phone)(\/|$)/;

export default function NotFound() {
  const { pathname } = useLocation();
  const { t } = useLang();
  const isModule = MODULE_PATH.test(pathname);
  return (
    <div className="container-page py-20">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-50 text-primary">
          <Compass aria-hidden="true" className="h-7 w-7" />
        </div>
        <h1 className="te mt-5 text-2xl font-extrabold text-ink">
          {isModule ? t("ఈ విభాగం సిద్ధమవుతోంది", "This section is being set up") : t("పేజీ దొరకలేదు", "Page not found")}
        </h1>
        <p className="te mt-3 text-sm text-slate-500">
          {isModule ? t("కాసేపట్లో మళ్ళీ చూడండి.", "Please check back in a moment.") : t("మీరు వెతుకుతున్న పేజీ లేదు.", "The page you're looking for doesn't exist.")}
        </p>
        <div className="mt-6 flex justify-center">
          <ButtonLink to="/" icon={<Home aria-hidden="true" className="h-4 w-4" />}>
            {t("హోమ్‌కి వెళ్ళండి", "Go home")}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
