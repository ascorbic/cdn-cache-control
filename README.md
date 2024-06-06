# cdn-cache-control

Easy, opinionated CDN cache header handling.

This package provides a subclass of the `Headers` class that makes it easier to set cache control headers for content served through a modern CDN. It provides a simple, chainable API with sensible defaults for common use cases. It works by setting the `Cache-Control` and `CDN-Cache-Control` headers to the appropriate values.

e.g.

```javascript
// Expires in 1 minute, but use stale-while-revalidate to serve stale content after that
const headers = new CacheHeaders().ttl(ONE_MINUTE).swr();
```

## Installation

```bash
npm install cdn-cache-control
```

It is also available in [jsr](https://jsr.io) as `@ascorbic/cdn-cache-control`. If using Deno, you can import it directly without installing:

```javascript
import { CacheHeaders } from "jsr:@ascorbic/cdn-cache-control";
```

## Usage

The module exports a single class, `CacheHeaders`, which is a subclass of the fetch [`Headers`](https://developer.mozilla.org/en-US/docs/Web/API/Headers) class. It provides a chainable API for setting headers.

### Use cases

If you have content that you want to have the CDN cache until it is manually revalidated or purged with a new deploy, you can use the `revalidatable` method. This is sometimes called "on-demand ISR":

```javascript
import { CacheHeaders } from "cdn-cache-control";

const headers = new CacheHeaders().revalidatable();
```

This sets the `CDN-Cache-Control` header to `public,s-maxage=31536000,must-revalidate`, which tells the CDN to cache the content for a year, but to revalidate it after that time. It sets `Cache-Control` to `public, max-age=0, must-revalidate`, which tells the browser to always check with the CDN for a fresh version. You should combine this with an `ETag` header to allow the CDN to serve a `304 Not Modified` response when the content hasn't changed.

You can enable `stale-while-revalidate` with the `swr` method:

```javascript
import { CacheHeaders } from "cdn-cache-control";

const headers = new CacheHeaders().swr();
```

This tells the CDN to serve stale content for up to a year while revalidating the content in the background. It calls `revalidatable` internally, so you don't need to call both.

You can set the time-to-live either by passing a value to `revalidatable`, or with the `ttl` method:

```javascript
import { CacheHeaders, ONE_HOUR } from "cdn-cache-control";

//  These are equivalent:
const headers = new CacheHeaders().revalidatable(ONE_HOUR);
const headers = new CacheHeaders().revalidatable().ttl(ONE_HOUR);
```

## API

<!-- TSDOC_START -->

## :wrench: Constants

- [ONE_MINUTE](#gear-one_minute)
- [ONE_HOUR](#gear-one_hour)
- [ONE_DAY](#gear-one_day)
- [ONE_WEEK](#gear-one_week)
- [ONE_YEAR](#gear-one_year)

### :gear: ONE_MINUTE

Number of seconds in one minute

| Constant     | Type |
| ------------ | ---- |
| `ONE_MINUTE` | `60` |

### :gear: ONE_HOUR

Number of seconds in one hour

| Constant   | Type   |
| ---------- | ------ |
| `ONE_HOUR` | `3600` |

### :gear: ONE_DAY

Number of seconds in one day

| Constant  | Type    |
| --------- | ------- |
| `ONE_DAY` | `86400` |

### :gear: ONE_WEEK

Number of seconds in one week

| Constant   | Type     |
| ---------- | -------- |
| `ONE_WEEK` | `604800` |

### :gear: ONE_YEAR

Number of seconds in one year

| Constant   | Type       |
| ---------- | ---------- |
| `ONE_YEAR` | `31536000` |

## :factory: CacheHeaders

### Methods

- [tag](#gear-tag)
- [swr](#gear-swr)
- [revalidatable](#gear-revalidatable)
- [immutable](#gear-immutable)
- [ttl](#gear-ttl)
- [toObject](#gear-toobject)
- [getCdnCacheControl](#gear-getcdncachecontrol)
- [setCdnCacheControl](#gear-setcdncachecontrol)
- [getCacheControl](#gear-getcachecontrol)
- [setCacheControl](#gear-setcachecontrol)
- [getCacheTags](#gear-getcachetags)
- [setCacheTags](#gear-setcachetags)

#### :gear: tag

Adds a cache tag to the cache tags header. Cache tags are used to invalidate the cache for a URL.

| Method | Type                                                   |
| ------ | ------------------------------------------------------ |
| `tag`  | `(tag: string or string[], ...tags: string[]) => this` |

Parameters:

- `tag`: The cache tag to add. Can be a string or an array of strings.

#### :gear: swr

Sets stale-while-revalidate directive for the CDN cache. T=By default the browser is sent a must-revalidate
directive to ensure that the browser always revalidates the cache with the server.

| Method | Type                       |
| ------ | -------------------------- |
| `swr`  | `(value?: number) => this` |

Parameters:

- `value`: The number of seconds to set the stale-while-revalidate directive to. Defaults to 1 week.

#### :gear: revalidatable

Sets cache headers for content that should be cached for a long time, but can be revalidated.
The CDN cache will cache the content for the specified time, but the browser will always revalidate
the cache with the server to ensure that the content is up to date.

| Method          | Type                     |
| --------------- | ------------------------ |
| `revalidatable` | `(ttl?: number) => this` |

Parameters:

- `ttl`: The number of seconds to set the CDN cache-control s-maxage directive to. Defaults to 1 year.

#### :gear: immutable

Sets cache headers for content that should be cached for a long time and never revalidated.
The CDN cache will cache the content for the specified time, and the browser will cache the content
indefinitely without revalidating. Do not use this unless the URL is fingerprinted or otherwise unique.
Otherwise, the browser will cache the content indefinitely and never check for updates, including for new deploys.

| Method      | Type                       |
| ----------- | -------------------------- |
| `immutable` | `(value?: number) => this` |

Parameters:

- `value`: The number of seconds to set the CDN cache-control s-maxage directive to. Defaults to 1 year.

#### :gear: ttl

Sets the s-maxage for items in the CDN cache. This is the maximum amount of time that the CDN will cache the content.
If used with swr, the content will revalidate in the background after the max age has passed. Otherwise, the content will be
removed from the cache after the max age has passed.

| Method | Type                      |
| ------ | ------------------------- |
| `ttl`  | `(value: number) => this` |

#### :gear: toObject

Returns the headers as a plain object.

| Method     | Type                           |
| ---------- | ------------------------------ |
| `toObject` | `() => Record<string, string>` |

#### :gear: getCdnCacheControl

The parsed cache-control header for the CDN cache.

| Method               | Type                           |
| -------------------- | ------------------------------ |
| `getCdnCacheControl` | `() => Record<string, string>` |

#### :gear: setCdnCacheControl

| Method               | Type                                           |
| -------------------- | ---------------------------------------------- |
| `setCdnCacheControl` | `(directives: Record<string, string>) => void` |

#### :gear: getCacheControl

The parsed cache-control header for the browser cache.

| Method            | Type                           |
| ----------------- | ------------------------------ |
| `getCacheControl` | `() => Record<string, string>` |

#### :gear: setCacheControl

| Method            | Type                                           |
| ----------------- | ---------------------------------------------- |
| `setCacheControl` | `(directives: Record<string, string>) => void` |

#### :gear: getCacheTags

The parsed content of the cache tags header.

| Method         | Type             |
| -------------- | ---------------- |
| `getCacheTags` | `() => string[]` |

#### :gear: setCacheTags

| Method         | Type                       |
| -------------- | -------------------------- |
| `setCacheTags` | `(tags: string[]) => void` |

<!-- TSDOC_END -->
