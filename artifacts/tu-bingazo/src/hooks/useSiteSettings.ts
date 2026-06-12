import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
}

const DEFAULTS: SiteSettings = {
  site_name: "Tu Bingazo",
  site_tagline: "Bingo en Vivo Bolivia",
  site_emoji: "🎱",
  favicon_url: null,
  logo_url: null,
  seo_title: "Tu Bingazo — Bingo en Vivo Bolivia",
  seo_description: "La plataforma de bingo en vivo más grande de Bolivia.",
  seo_keywords: "bingo, bolivia, bingo en vivo, premios",
  primary_color: "#1a0050",
};

async function fetchSiteSettings(): Promise<SiteSettings> {
  const r = await fetch(`${BASE}/api/site-settings`);
  if (!r.ok) return DEFAULTS;
  return r.json();
}

export function useSiteSettings() {
  const { data } = useQuery<SiteSettings>({
    queryKey: ["site-settings"],
    queryFn: fetchSiteSettings,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const s = data ?? DEFAULTS;

  useEffect(() => {
    document.title = s.seo_title;
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
