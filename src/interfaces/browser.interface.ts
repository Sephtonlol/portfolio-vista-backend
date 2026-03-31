export interface SearchResponse {
  success: boolean;
  query: string;
  results?: Result[];
}

export interface Result {
  title: string;
  link: string;
  snippet: string;
  site: string;
  favicon: string | null;
}

export interface ImagesResponse {
  success: boolean;
  query: string;
  results?: ImageResult[];
}

export interface ImageResult {
  title: string;
  image: string;
  thumbnail: string;
  source: string;
}
