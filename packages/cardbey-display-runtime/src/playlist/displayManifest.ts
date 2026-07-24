export type DisplayOrientation = 'LANDSCAPE' | 'PORTRAIT';
export type DisplayFit = 'CONTAIN' | 'COVER';
export type DisplayTransition = 'NONE' | 'FADE';
export type DisplayItemType = 'IMAGE' | 'VIDEO';

export type DisplayManifestItem = {
  id: string;
  type: DisplayItemType;
  url: string;
  mimeType?: string;
  durationMs: number;
  validFrom?: string;
  validUntil?: string;
  checksum?: string;
  fit?: DisplayFit;
  muted?: boolean;
  order?: number;
};

export type DisplayManifest = {
  id: string;
  revision: string | number;
  generatedAt?: string;
  deviceId?: string;
  state?: string;
  bindingStatus?: string;
  playlist: {
    id: string;
    name?: string;
    loop: boolean;
    defaultDurationMs: number;
    items: DisplayManifestItem[];
  };
  settings: {
    orientation?: DisplayOrientation;
    muted: boolean;
    transition: DisplayTransition;
    transitionDurationMs: number;
    fit: DisplayFit;
  };
};

/** Valid empty playlist (device ok, nothing to play). */
export type EmptyPlaylistResult = {
  kind: 'empty';
  deviceId?: string;
  state?: string;
  orientation?: DisplayOrientation;
};

export type NormalizePlaylistResult =
  | { kind: 'manifest'; manifest: DisplayManifest }
  | EmptyPlaylistResult;
