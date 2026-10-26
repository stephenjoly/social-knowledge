import posthog from "posthog-js";

const site = "social-knowledge.stephenjoly.net";
const hostname = window.location.hostname.toLowerCase();
const disabled = hostname === "localhost" || hostname === "127.0.0.1" ||
  hostname.endsWith(".local") || hostname.includes("staging") ||
  hostname.includes("preview") || hostname.endsWith("-dev") ||
  hostname.includes(".test");

function safePageUrl(): string {
  const path = window.location.pathname.startsWith("/app") ? "/app" : window.location.pathname;
  return `${window.location.origin}${path}`;
}

if (!disabled && hostname === site) {
  void fetch("/analytics/config.json", { credentials: "omit" })
    .then((response) => response.ok ? response.json() as Promise<{ key: string | null }> : null)
    .then((config) => {
      if (!config?.key) return;
      posthog.init(config.key, {
        api_host: "/ingest",
        ui_host: "https://us.posthog.com",
        person_profiles: "identified_only",
        autocapture: false,
        capture_pageview: window.location.pathname.startsWith("/app") ? "history_change" : true,
        capture_pageleave: true,
        disable_session_recording: true,
        disable_surveys: true,
        persistence: "localStorage+cookie",
        cross_subdomain_cookie: true,
        before_send: (event) => {
          if (!event || (event.event !== "$pageview" && event.event !== "$pageleave")) return null;
          const properties = event.properties;
          event.properties = {
            token: properties.token,
            distinct_id: properties.distinct_id,
            $device_id: properties.$device_id,
            $session_id: properties.$session_id,
            $window_id: properties.$window_id,
            $pageview_id: properties.$pageview_id,
            site,
            $current_url: safePageUrl(),
            $pathname: new URL(safePageUrl()).pathname,
          };
          return event;
        },
      });
      posthog.register({ site });
      posthog.reloadFeatureFlags();
    })
    .catch(() => undefined);
}
