import process from "node:process";

// TODO: Add more CDNs
export type CDN = "netlify";

export const ONE_MINUTE = 60;
export const ONE_HOUR = 3600;
export const ONE_DAY = 86400;
export const ONE_WEEK = 604800;
export const ONE_YEAR = 31536000;

// The tiered directive is used by Netlify to indicate that it should use a tiered cache, with a central cache shared by all edge nodes.
const tieredDirective = "tiered";

function detectCDN(): CDN | undefined {
  if (process.env.NETLIFY || process.env.NETLIFY_LOCAL) {
    return "netlify";
  }
  if (process.env.CDN) {
    return process.env.CDN as CDN;
  }
  return undefined;
}

export function parseCacheControlHeader(
  header?: string | null,
): Record<string, string> {
  if (!header) {
    return {};
  }
  return header.split(",").reduce(
    (acc, directive) => {
      const [key, value] = directive.split("=");
      acc[key] = value;
      return acc;
    },
    {} as Record<string, string>,
  );
}

export function serializeCacheControlHeader(
  directives: Record<string, string>,
): string {
  return Object.entries(directives)
    .map(([key, value]) => {
      return value ? `${key}=${value}` : key;
    })
    .join(",");
}

export class CacheHeaders extends Headers {
  #cdn?: CDN;

  public constructor(init?: HeadersInit) {
    super(init);
    this.#cdn = detectCDN();
  }

  public get cacheTagHeaderName(): string {
    switch (this.#cdn) {
      case "netlify":
        return "Netlify-Cache-Tag";
      default:
        return "Cache-Tag";
    }
  }

  public get cdnCacheControlHeaderName(): string {
    switch (this.#cdn) {
      case "netlify":
        return "Netlify-CDN-Cache-Control";
      default:
        return "CDN-Cache-Control";
    }
  }

  /**
   * The parsed cache-control header for the CDN cache.
   */
  public getCdnCacheControl(): Record<string, string> {
    return parseCacheControlHeader(this.get(this.cdnCacheControlHeaderName));
  }
  public setCdnCacheControl(directives: Record<string, string>): void {
    this.set(
      this.cdnCacheControlHeaderName,
      serializeCacheControlHeader(directives),
    );
  }

  /**
   * The parsed cache-control header for the browser cache.
   */
  public getCacheControl(): Record<string, string> {
    return parseCacheControlHeader(this.get("Cache-Control"));
  }

  public setCacheControl(directives: Record<string, string>): void {
    this.set("Cache-Control", serializeCacheControlHeader(directives));
  }

  /**
   * The parsed content of the cache tags header.
   */

  public setCacheTags(tags: Array<string>): void {
    this.set(this.cacheTagHeaderName, tags.join(","));
  }

  public getCacheTags(): Array<string> {
    return this.get(this.cacheTagHeaderName)?.split(",") ?? [];
  }

  /**
   * Adds a cache tag to the cache tags header. Cache tags are used to invalidate the cache for a URL.
   * @param tag The cache tag to add. Can be a string or an array of strings.
   */

  tag(tag: string | Array<string>, ...tags: Array<string>): this {
    if (Array.isArray(tag)) {
      tag = tag.join(",");
    }
    this.setCacheTags([...new Set([...this.getCacheTags(), tag, ...tags])]);
    return this;
  }

  /**
   * Sets stale-while-revalidate directive for the CDN cache. T=By default the browser is sent a must-revalidate
   * directive to ensure that the browser always revalidates the cache with the server.
   * @param value The number of seconds to set the stale-while-revalidate directive to. Defaults to 1 week.
   */

  swr(value: number = ONE_WEEK): this {
    const currentSMaxAge = this.getCdnCacheControl()["s-maxage"];
    this.revalidatable(Number(currentSMaxAge) || 0);
    const cdnDirectives = this.getCdnCacheControl();
    cdnDirectives["stale-while-revalidate"] = value.toString();
    if (this.#cdn === "netlify") {
      cdnDirectives[tieredDirective] = "";
    }
    delete cdnDirectives["must-revalidate"];
    this.setCdnCacheControl(cdnDirectives);
    return this;
  }

  /**
   * Sets cache headers for content that should be cached for a long time, but can be revalidated.
   * The CDN cache will cache the content for the specified time, but the browser will always revalidate
   * the cache with the server to ensure that the content is up to date.
   * @param value The number of seconds to set the CDN cache-control s-maxage directive to. Defaults to 1 year.
   */

  revalidatable(value: number = ONE_YEAR): this {
    const cdnDirectives = parseCacheControlHeader(
      this.get(this.cdnCacheControlHeaderName),
    );
    cdnDirectives.public = "";
    cdnDirectives["s-maxage"] = value.toString();
    cdnDirectives["must-revalidate"] = "";
    if (this.#cdn === "netlify") {
      cdnDirectives[tieredDirective] = "";
    }
    this.setCdnCacheControl(cdnDirectives);

    const directives = parseCacheControlHeader(this.get("Cache-Control"));
    directives.public = "";
    if (!directives["max-age"]) {
      directives["max-age"] = "0";
      directives["must-revalidate"] = "";
    }
    this.setCacheControl(directives);
    return this;
  }

  /**
   * Sets cache headers for content that should be cached for a long time and never revalidated.
   * The CDN cache will cache the content for the specified time, and the browser will cache the content
   * indefinitely without revalidating. Do not use this unless the URL is fingerprinted or otherwise unique.
   * Otherwise, the browser will cache the content indefinitely and never check for updates, including for new deploys.
   * @param value The number of seconds to set the CDN cache-control s-maxage directive to. Defaults to 1 year.
   */

  immutable(value: number = ONE_YEAR): this {
    const cdnDirectives = this.getCdnCacheControl();
    cdnDirectives.public = "";
    cdnDirectives["s-maxage"] = value.toString();
    if (this.#cdn === "netlify") {
      cdnDirectives[tieredDirective] = "";
    }
    cdnDirectives.immutable = "";
    this.setCdnCacheControl(cdnDirectives);

    const directives = this.getCacheControl();
    directives.public = "";
    directives["max-age"] = value.toString();
    directives.immutable = "";
    this.setCacheControl(directives);
    return this;
  }

  /**
   * Returns the headers as a plain object.
   */

  toObject(): Record<string, string> {
    return Object.fromEntries(this.entries());
  }
}
