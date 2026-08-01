export type PortfolioEvent =
  | "project_card_open"
  | "project_live_click"
  | "project_details_click"
  | "experience_workflow_open"
  | "contact_email_click"
  | "mobile_desktop_hint_dismiss";

interface NavigatorWithPrivacy extends Navigator {
  globalPrivacyControl?: boolean;
}

function privacyOptOut(): boolean {
  const navigatorWithPrivacy = navigator as NavigatorWithPrivacy;
  return navigator.doNotTrack === "1" || navigatorWithPrivacy.globalPrivacyControl === true;
}

function viewportClass(): "mobile" | "tablet" | "desktop" {
  if (window.innerWidth <= 768) return "mobile";
  if (window.innerWidth <= 1100) return "tablet";
  return "desktop";
}

export function trackPortfolioEvent(event: PortfolioEvent, target: string): void {
  if (privacyOptOut()) return;

  const payload = JSON.stringify({
    event,
    target,
    lang: document.documentElement.getAttribute("data-site-lang") === "zh" ? "zh" : "en",
    theme: document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark",
    viewport: viewportClass(),
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/events", new Blob([payload], { type: "application/json" }));
    return;
  }

  void fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true,
  });
}

export function installPortfolioAnalytics(): void {
  document.addEventListener("click", (event) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>("[data-analytics-event]");
    if (!target) return;
    trackPortfolioEvent(
      target.dataset.analyticsEvent as PortfolioEvent,
      target.dataset.analyticsTarget || "unknown",
    );
  });
}
