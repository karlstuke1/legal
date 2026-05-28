import { Helmet } from "react-helmet-async";
import { absoluteUrl } from "@/lib/app-url";

export interface SEOHeadProps {
  title: string;
  description: string;
  path?: string;
  canonical?: string;
  keywords?: string;
  type?: string;
  noindex?: boolean;
}

export function SEOHead({ title, description, path = "/", canonical, keywords, type = "website", noindex = false }: SEOHeadProps) {
  const url = canonical || absoluteUrl(path);
  const fullTitle = title.includes("Legal AI") ? title : `${title} | Legal AI – KI für Anwälte`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {keywords && <meta name="keywords" content={keywords} />}
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
    </Helmet>
  );
}
