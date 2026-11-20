# SEO

Public discovery for **SDA Nerd Dog — System Design All-in-One** on the canonical host `https://sda.nerddog.me`. Only `/` and `/pricing` are indexable. App, auth, admin, billing, and project surfaces are private.

## Public surface

| Route | Purpose | Metadata source |
| --- | --- | --- |
| `/` | Landing page | `app/page.tsx` + root metadata |
| `/pricing` | Plan comparison | `app/pricing/layout.tsx` |
| `/robots.txt` | Crawl rules + sitemap pointer | `app/robots.ts` |
| `/sitemap.xml` | Public URL list | `app/sitemap.ts` |
| `/og.png` | 1200×630 social preview | static asset |
| `/google42a154ff662996d5.html` | Search Console verification | static asset, keep permanently |

## Implementation

- Root metadata in `app/layout.tsx` sets `metadataBase`, the title template, application name, canonical default, Open Graph, Twitter card, and `robots: index, follow`.
- `app/page.tsx` owns the homepage canonical and emits a JSON-LD `@graph` with `WebSite`, `SoftwareApplication`, and `Organization` entities. Brand names include `SDA Nerd Dog` and the alternate names `SDA` and `System Design All-in-One`.
- `app/pricing/layout.tsx` adds its own title, description, canonical, and social metadata. Page-level `openGraph` objects replace rather than merge with the root object, so any page that overrides Open Graph must repeat `type`, `siteName`, and `images`.
- `proxy.ts` (Next.js 16 name for middleware) adds `X-Robots-Tag: noindex, nofollow` to private paths that robots rules also disallow.
- `app/sitemap.ts` lists only the two public routes.

## Verify a deployment

```powershell
curl.exe -sS -o NUL -w "%{http_code}`n" https://sda.nerddog.me/robots.txt
curl.exe -sS -o NUL -w "%{http_code}`n" https://sda.nerddog.me/sitemap.xml
curl.exe -sS -o NUL -w "%{http_code}`n" https://sda.nerddog.me/og.png
curl.exe -sS -I https://sda.nerddog.me/login | Select-String "x-robots-tag"
```

Then inspect the homepage head for `<title>`, canonical, `og:image`, and `application/ld+json`. Submit `https://sda.nerddog.me/sitemap.xml` in Search Console after a metadata change.

## Known limits

- Brand ranking needs public content and backlinks; the technical layer alone only makes the site eligible.
- The old host `https://sda-system-design-for-all.vercel.app` still serves the duplicate site; redirect it at the Vercel domain level, not in application code.
- Search Console access must use the Google account that owns the verified property.

Related: [[Home]]
