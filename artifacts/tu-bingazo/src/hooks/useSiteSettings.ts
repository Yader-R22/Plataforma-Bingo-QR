import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const LS_KEY = "site-settings-cache";

export interface SiteSettings {
  site_name: string;
  site_tagline: string;
  site_emoji: string;
  favicon_url: string | null;
  logo_url: string | null;
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
  primary_color: string;
  qr_background_url: string | null;
  support_whatsapp: string | null;
  terms_and_conditions: string | null;
}

const DEFAULTS: SiteSettings = {
  site_name: "",
  site_tagline: "",
  site_emoji: "🎱",
  favicon_url: null,
  logo_url: null,
  seo_title: "",
  seo_description: "",
  seo_keywords: "",
  primary_color: "#1a0050",
  qr_background_url: null,
  support_whatsapp: null,
  terms_and_conditions: null,
};

function loadCached(): SiteSettings | undefined {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as SiteSettings;
  } catch {}
  return undefined;
}

function saveCache(s: SiteSettings) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {}
}

async function fetchSiteSettings(): Promise<SiteSettings> {
  const r = await fetch(`${BASE}/api/site-settings`);
  if (!r.ok) return DEFAULTS;
  const data: SiteSettings = await r.json();
  saveCache(data);
  return data;
}

export function useSiteSettings() {
  const { data } = useQuery<SiteSettings>({
    queryKey: ["site-settings"],
    queryFn: fetchSiteSettings,
    initialData: loadCached,
    staleTime: 1 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const s = data ?? DEFAULTS;

  useEffect(() => {
    if (s.seo_title) document.title = s.seo_title;
  }, [s.seo_title]);

  useEffect(() => {
    let metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.name = "description";
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = s.seo_description;
  }, [s.seo_description]);

  useEffect(() => {
    let metaKw = document.querySelector<HTMLMetaElement>('meta[name="keywords"]');
    if (!metaKw) {
      metaKw = document.createElement("meta");
      metaKw.name = "keywords";
      document.head.appendChild(metaKw);
    }
    metaKw.content = s.seo_keywords;
  }, [s.seo_keywords]);

  useEffect(() => {
    if (!s.favicon_url) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = s.favicon_url;
    link.type = s.favicon_url.startsWith("data:image/svg") ? "image/svg+xml" : "image/png";
  }, [s.favicon_url]);

  useEffect(() => {
    let metaOgTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    if (!metaOgTitle) {
      metaOgTitle = document.createElement("meta");
      metaOgTitle.setAttribute("property", "og:title");
      document.head.appendChild(metaOgTitle);
    }
    metaOgTitle.content = s.seo_title;
  }, [s.seo_title]);

  return s;
}
