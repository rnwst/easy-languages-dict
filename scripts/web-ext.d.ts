// This declaration for web-ext is AI-generated. It may contain mistakes.

declare module 'web-ext' {
  /**
   * Extra config that is not part of the CLI flags, passed as the 2nd argument
   * to most `webExt.cmd.*` functions.
   */
  export interface CmdConfig {
    /**
     * Allow your Node process to continue after the command completes.
     * If not set, web-ext may call `process.exit(...)`.
     */
    shouldExitProgram?: boolean;

    /**
     * Override manifest validation; useful for legacy experiments in scripts.
     * Return a minimal manifest-like object.
     */
    getValidatedManifest?: () => { name: string; version: string; [key: string]: unknown };
  }

  /** Options accepted by `webExt.cmd.run(...)`. */
  export interface RunOptions {
    /** Path to the browser binary (e.g., Firefox). */
    firefox?: string;

    /** Directory containing your extension’s source (defaults to CWD). */
    sourceDir?: string;

    /** Target runtime (e.g., 'firefox-desktop' | 'firefox-android'). */
    target?: string;

    /** Firefox profile name or absolute path. */
    firefoxProfile?: string;

    /** Keep changes made to the chosen profile. */
    keepProfileChanges?: boolean;

    /** Extra args for the browser process. */
    args?: string[];

    /** Open Browser Console on startup. */
    browserConsole?: boolean;

    /** Open DevTools on startup. */
    devtools?: boolean;

    /** URLs to open on startup. */
    startUrl?: string | string[];

    /** Disable live reload behavior. */
    noReload?: boolean;

    /**
     * Set prefs (either raw "key=value" strings or a map). When using an object,
     * values may be string/number/boolean.
     */
    pref?: string[] | Record<string, string | number | boolean>;

    /**
     * Disable the use of stdin (prevents keypress controls). Example appears in README.
     */
    noInput?: boolean;

    /** Additional, undocumented keys (web-ext adds new flags over time). */
    [key: string]: unknown;
  }

  /** Minimal runner API returned by `cmd.run`. */
  export interface ExtensionRunner {
    /** Reload all installed temporary extensions. */
    reloadAllExtensions(): void | Promise<void>;
    /** Exit the spawned browser / runner. */
    exit(): void | Promise<void>;
    /** web-ext may expose more fields in the future. */
    [key: string]: unknown;
  }

  /** Options accepted by `webExt.cmd.build(...)`. */
  export interface BuildOptions {
    /** Directory containing your extension’s source (defaults to CWD). */
    sourceDir?: string;

    /** Output directory for artifacts (defaults to ./web-ext-artifacts). */
    artifactsDir?: string;

    /** Overwrite destination package file if it exists. */
    overwriteDest?: boolean;

    /** Only build when needed (skip if up-to-date). */
    asNeeded?: boolean;

    /** Glob patterns to ignore from the package. */
    ignoreFiles?: string[];

    /** Optional explicit filename for the built artifact. */
    filename?: string;

    [key: string]: unknown;
  }

  export interface BuildResult {
    /** Resolved source directory used. */
    sourceDir: string;
    /** Resolved artifacts directory used. */
    artifactsDir: string;
    /** Paths to generated packages (typically one .zip/.xpi). */
    extensionPaths: string[];
    [key: string]: unknown;
  }

  /** Options accepted by `webExt.cmd.sign(...)`. */
  export interface SignOptions {
    /** Directory to build & sign (mutually exclusive with `xpiPath` on low-level API). */
    sourceDir?: string;

    /** Addons.mozilla.org API key / secret. */
    apiKey?: string;
    apiSecret?: string;

    /** AMO API base URL (defaults to v5 in examples). */
    amoBaseUrl?: string;

    /** Submit channel. */
    channel?: 'listed' | 'unlisted';

    /** Explicit add-on id (if needed). */
    id?: string;

    /** REQUIRED per README example: use your own UA string. */
    userAgentString?: string;

    /** Misc extra flags supported by newer web-ext versions. */
    [key: string]: unknown;
  }

  export interface SignResult {
    /** The signed XPI path if downloaded. */
    xpiPath?: string;
    /** The add-on ID if known. */
    id?: string;
    /** The version that was signed. */
    version?: string;
    /** Additional response metadata. */
    [key: string]: unknown;
  }

  /** Options accepted by `webExt.cmd.lint(...)`. */
  export interface LintOptions {
    sourceDir?: string;
    /** Output format for linter results. */
    output?: 'text' | 'json';
    /** Emit only metadata about the extension in JSON. */
    metadata?: boolean;
    /** Pretty-print JSON output. */
    pretty?: boolean;
    /** Treat warnings as errors (fail the command). */
    warningsAsErrors?: boolean;
    [key: string]: unknown;
  }

  export interface LintResult {
    warnings?: unknown[];
    errors?: unknown[];
    /** Non-zero if failures were found. */
    code?: number;
    /** Raw linter details (when output=json). */
    [key: string]: unknown;
  }

  export interface Cmd {
    run(options?: RunOptions, config?: CmdConfig): Promise<ExtensionRunner>;
    build(options?: BuildOptions, config?: CmdConfig): Promise<BuildResult>;
    sign(options?: SignOptions, config?: CmdConfig): Promise<SignResult>;
    lint(options?: LintOptions, config?: CmdConfig): Promise<LintResult>;
    /** Present in CLI; not generally useful programmatically. */
    docs?(...args: unknown[]): Promise<void>;
  }

  /** Default export object. */
  const webExt: {
    cmd: Cmd;
    /** Future properties may be added; keep it open. */
    [key: string]: unknown;
  };

  export default webExt;
}

/* ------- Submodules shown in README examples ------- */

declare module 'web-ext/util/logger' {
  /** Basic console logger control as shown in README examples. */
  export const consoleStream: {
    /** Enable verbose logging to the console. */
    makeVerbose(): void;
    /** Some builds expose mute/unmute; mark as optional. */
    mute?: () => void;
    unmute?: () => void;
    [key: string]: unknown;
  };

  /** Allow additional helper exports in the future. */
  const _default: {
    consoleStream: typeof consoleStream;
    [key: string]: unknown;
  };

  export default _default;
}

declare module 'web-ext/util/adb' {
  /**
   * List connected Android device IDs (strings). Path to adb is optional
   * and auto-detected if omitted.
   */
  export function listADBDevices(adbBinPath?: string): Promise<string[]>;

  /**
   * List installed Firefox APK package names on a given device ID.
   * `adbBinPath` is optional and auto-detected if omitted.
   */
  export function listADBFirefoxAPKs(deviceId: string, adbBinPath?: string): Promise<string[]>;
}

declare module 'web-ext/util/submit-addon' {
  export interface SignAddonOptions {
    /** REQUIRED per README guidance: use your own UA string. */
    userAgentString: string;

    apiKey: string;
    apiSecret: string;

    /** AMO API base URL (e.g., 'https://addons.mozilla.org/api/v5/'). */
    amoBaseUrl?: string;

    /** Add-on ID to associate (when signing a prebuilt XPI). */
    id?: string;

    /** Path to the XPI file to submit. */
    xpiPath: string;

    /** Where to persist the AMO upload UUID between retries. */
    savedUploadUuidPath?: string;

    channel?: 'listed' | 'unlisted';

    [key: string]: unknown;
  }

  /**
   * Low-level signing submitter used by `cmd.sign` internally.
   * Prefer `webExt.cmd.sign(...)` unless you specifically need to submit an existing XPI.
   */
  export function signAddon(options: SignAddonOptions): Promise<unknown>;
}
