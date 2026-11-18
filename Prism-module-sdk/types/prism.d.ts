/** Prism module protocol v1. Native host API; no DOM or Node runtime. */
type PrismJSON = null | boolean | number | string | PrismJSON[] | {[key: string]: PrismJSON};
type PrismParams = Record<string, unknown>;
interface PrismParameter {
  name: string; title?: string; description?: string;
  type?: 'input' | 'enumeration' | 'constant' | 'page' | 'offset' | 'count' | 'number' | 'boolean' | 'language' | 'userId' | 'timezone' | 'configId' | 'folder';
  value?: string | number | boolean; secret?: boolean;
  enumOptions?: {title: string; value: string | number | boolean}[];
  placeholders?: {title: string; value: string}[];
  belongTo?: PrismParameterCondition | PrismParameterCondition[];
  startPage?: number;
  dynamicOptions?: {functionName: string; dependsOn?: string[]};
}
interface PrismParameterCondition {paramName: string; value: (string | number | boolean)[]}
interface PrismFeature {
  id: string; functionName: string; title?: string; description?: string;
  type?: 'media_list' | 'search' | 'stream' | 'subtitle' | 'danmu';
  params?: PrismParameter[]; cacheDuration?: number; sectionMode?: boolean; requiresWebView?: boolean;
}
interface PrismMetadataDeclaration {
  schemaVersion: 1; id: string; title: string; version: string;
  requiredVersion?: string; description?: string; author?: string;
  icon?: string; iconurl?: string; site?: string; updateUrl?: string; changelog?: string;
  capabilities?: ('catalog' | 'search' | 'stream' | 'subtitle' | 'danmaku' | 'library')[];
  globalParams?: PrismParameter[]; modules?: PrismFeature[];
  search?: {title?: string; functionName: string; params?: PrismParameter[]};
  detailFunction?: string; detailCacheDuration?: number;
  library?: {title?: string; homeFunction?: string; browseFunction?: string; allowIntegration?: boolean; sources?: {id: string; title: string}[]};
  i18n?: Record<string, Record<string, string>>;
  compatibility?: {format: string; requiredVersion?: string};
}
interface PrismVideoItem {
  id?: string | number; type?: 'tmdb' | 'url' | 'video' | 'folder'; title?: string;
  mediaType?: 'movie' | 'tv'; tmdbId?: number; link?: string; videoUrl?: string;
  description?: string; subtitle?: string; releaseDate?: string; rating?: number | string;
  posterPath?: string; posterUrl?: string; backdropPath?: string; coverUrl?: string; detailPoster?: string;
  previewUrl?: string; duration?: number; durationText?: string; season?: number; episode?: number;
  childItems?: PrismVideoItem[]; episodeItems?: PrismVideoItem[]; relatedItems?: PrismVideoItem[];
  customHeaders?: Record<string, string>; playerType?: string; size?: number;
  fileName?: string; tags?: string[]; height?: number; videoRange?: string; bitRate?: number;
  genreItems?: {id: string | number; title: string}[];
  peoples?: {id: string | number; title: string; avatar?: string; role?: string}[];
  trailers?: ({url: string; coverUrl?: string} | {videoUrl: string; coverUrl?: string})[]; backdropPaths?: string[]; backdropImageUrls?: string[];
  externalSubtitles?: PrismExternalSubtitle[];
}
interface PrismExternalSubtitle {url: string; title?: string; language?: string; isDefault?: boolean; customHeaders?: Record<string,string>}
/** Optional library extensions require Prism 0.1.1. */
interface PrismBrowseOption {id: string; title: string; value: string; children?: PrismBrowseOption[]}
interface PrismBrowseFilter {parameter: string; title: string; options: PrismBrowseOption[]}
interface PrismSection {
  id: string; title: string; layout?: 'poster' | 'posterRow' | 'landscape' | 'list' | 'hero';
  featureId?: string; parameters?: Record<string, string | number | boolean>;
  items?: PrismVideoItem[]; loadMode?: 'lazy'; previewCount?: number; filters?: PrismBrowseFilter[];
}
interface PrismVideoResource {
  id?: string; name: string; url: string; description?: string; customHeaders?: Record<string,string>; playerType?: string; size?: number;
  fileName?: string; tags?: string[]; height?: number; videoRange?: string; bitRate?: number;
  externalSubtitles?: PrismExternalSubtitle[];
}
interface PrismHTTPOptions {
  url?: string; method?: string; params?: Record<string, string | number | boolean>;
  headers?: Record<string,string>; data?: PrismJSON; body?: PrismJSON;
  timeout?: number; allow_redirects?: boolean; zlibMode?: boolean; base64Data?: boolean; decodable?: boolean;
}
interface PrismHTTPResponse<T = any> {
  data: T; body: string; status: number; statusCode: number; headers: Record<string,string>; toString(): string;
}
type PrismThenableResponse<T = any> = PrismHTTPResponse<T> & PromiseLike<PrismHTTPResponse<T>>;
interface PrismHost {
  server: string;
  http: {
    get<T = any>(url: string, options?: PrismHTTPOptions): PrismThenableResponse<T>;
    post<T = any>(url: string, data: PrismJSON, options?: PrismHTTPOptions): PrismThenableResponse<T>;
    request<T = any>(options: PrismHTTPOptions): PrismThenableResponse<T>;
    getAsync<T = any>(url: string, options?: PrismHTTPOptions): Promise<PrismHTTPResponse<T>>;
    postAsync<T = any>(url: string, data: PrismJSON, options?: PrismHTTPOptions): Promise<PrismHTTPResponse<T>>;
    requestAsync<T = any>(options: PrismHTTPOptions): Promise<PrismHTTPResponse<T>>;
  };
  tmdb: {get<T = any>(path: string, options?: {params?: Record<string, string | number | boolean>}): T};
  storage: {
    get<T extends PrismJSON>(key: string, fallback?: T): T | undefined;
    set(key: string, value: PrismJSON): void; remove(key: string): void; keys(): string[]; clear(): void;
    getAsync<T extends PrismJSON>(key: string, fallback?: T): Promise<T | undefined>;
    setAsync(key: string, value: PrismJSON): Promise<void>;
  };
  sharedCache: {get(namespace: string, key: string): PrismJSON; set(namespace: string, key: string, value: PrismJSON): void; remove(namespace: string, key: string): void};
  /** Cheerio-compatible parser. HTML strings only; no browser/document. */
  html: {load(html: string, options?: Record<string, unknown>): any};
}
declare var PrismMetadata: PrismMetadataDeclaration;
declare const Prism: PrismHost;
/** Read-only URL inspection; no URLSearchParams or mutation contract. */
interface PrismURL {
  readonly href: string; readonly protocol: string; readonly host: string; readonly hostname: string;
  readonly port: string; readonly pathname: string; readonly search: string; readonly hash: string;
  readonly username: string; readonly password: string; readonly origin: string;
  toString(): string; toJSON(): string;
}
declare const URL: {new(value: string, base?: string): PrismURL; canParse(value: string, base?: string): boolean};
declare const console: {log(...values: unknown[]): void; info(...values: unknown[]): void; warn(...values: unknown[]): void; error(...values: unknown[]): void};
