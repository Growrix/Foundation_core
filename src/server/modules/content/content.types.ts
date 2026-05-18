export type PageSection = {
  id: string;
  kind: "hero" | "value" | "proof" | "conversion" | "footer";
  title: string;
  body: string;
};

export type PageDto = {
  slug: string;
  title: string;
  description: string;
  updatedAt: string;
  sections: PageSection[];
};

export type CollectionRecord = {
  id: string;
  title: string;
  summary: string;
};

export type SiteConfigDto = {
  brand: {
    name: string;
    supportEmail: string;
  };
  navigation: Array<{
    label: string;
    href: string;
  }>;
  footer: {
    attribution: {
      enabled: boolean;
      text: string;
      linkText: string;
      url: string;
    };
  };
};