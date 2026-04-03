import type { BannerProps } from "@nuxt/ui";

export interface SiteConfig {
  dir?: string;
  name?: string;
  description?: string;
  shortDescription?: string;
  url?: string;
  logo?: string;
  lang?: string;
  github?: string;
  socials?: Record<string, string>;
  llms?: {
    full?: {
      title?: string;
      description?: string;
    };
  };
  branch?: string;
  banner?: BannerProps;
  versions?: { label: string; to: string; active?: boolean }[];
  themeColor?: string;
  redirects?: Record<string, string>;
  automd?: unknown;
  buildCache?: boolean;
  sponsors?: { api: string };
  landing?:
    | false
    | {
        title?: string;
        description?: string;
        _heroMdTitle?: string;
        heroTitle?: string;
        heroSubtitle?: string;
        heroDescription?: string;
        heroLinks?: Record<
          string,
          string | { label?: string; icon?: string; to?: string; size?: string; order?: number }
        >;
        heroCode?: string | { content: string; title?: string; lang?: string };
        featuresTitle?: string;
        featuresLayout?: "default" | "hero";
        features?: { title: string; description?: string; icon?: string }[];
        contributors?: boolean;
      };
}

export const siteConfig: SiteConfig = {
  name: "Repostack",
  shortDescription: "Multirepo workflow, monorepo feel.",
  description: "A CLI tool for orchestrating multirepo development directories.",
  github: "hornjs/repostack",
  logo: "/icon.svg",
  url: inferSiteURL(),
  socials: {},
  banner: {},
  versions: [],
  lang: "en",
  landing: {
    contributors: true,
    heroLinks: {
      primary: {
        icon: "i-heroicons-book-open",
        to: "/guide",
      }
    }
  }
}

function inferSiteURL() {
  return (
    process.env.NUXT_PUBLIC_SITE_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_URL && `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`) || // Vercel
    process.env.URL || // Netlify
    process.env.CI_PAGES_URL || // Gitlab Pages
    process.env.CF_PAGES_URL // Cloudflare Pages
  );
}
