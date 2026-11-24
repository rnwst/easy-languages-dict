import {installAwaitCaptionDecoration} from
  '../content/lib/awaitCaptionDecoration.js';

const wait = 'html5_await_track_decoration_in_load_track';
const dispatch = 'html5_dispatch_tracklist_loaded_event';
type Factory = (...args: unknown[]) => unknown;
type Page = {yt?: {player?: {Application?: {
  create?: Factory; createAlternate?: Factory;
}}}};

/** Reproduce how YouTube creates objects such as yt.player.Application and
 * assigns functions to them, including its check against Object.prototype.
 */
function publish(root: object, address: string, value: unknown) {
  const path = address.split('.');
  let owner = root as Record<string, unknown>;
  let key: string | undefined;
  while (path.length && (key = path.shift())) {
    if (path.length || value === undefined) {
      owner = (owner[key] && owner[key] !==
        (Object.prototype as unknown as Record<string, unknown>)[key] ?
        owner[key] : owner[key] = {}) as Record<string, unknown>;
    } else owner[key] = value;
  }
}

function context(extra = '') {
  return {serializedExperimentFlags: `${dispatch}=true${extra}`};
}

describe('native caption decoration configuration', () => {
  it('intercepts the synchronous exporter before its first call', () => {
    const root: Page = {};
    const diagnostic = jest.fn();
    installAwaitCaptionDecoration(diagnostic, root);
    // Our getters must leave missing objects undefined so YouTube creates them.
    expect(root.yt).toBeUndefined();
    const native = jest.fn((...args: unknown[]) => {
      const config = args[2] as ReturnType<typeof context>;
      return new URLSearchParams(config.serializedExperimentFlags).get(wait);
    });
    publish(root, 'yt.player.Application.create', native);
    const config = context('&other=a%26b&other=two&empty=');
    const args = [{}, {args: {untouched: true}}, config, {}];
    const application = root.yt!.player!.Application!;
    expect(application.create!.apply(application, args)).toBe('true');
    expect(native.mock.contexts[0]).toBe(application);
    args.forEach((arg, index) => expect(native.mock.calls[0][index]).toBe(arg));
    const flags = new URLSearchParams(config.serializedExperimentFlags);
    expect(flags.getAll('other')).toEqual(['a&b', 'two']);
    expect(flags.get('empty')).toBe('');
    expect(flags.get(dispatch)).toBe('true');
    expect(diagnostic).toHaveBeenCalledWith({status: 'applied',
      property: undefined});
  });

  it('handles delayed namespaces and both exported factories', () => {
    const root: Page = {};
    installAwaitCaptionDecoration(undefined, root);
    root.yt = {};
    root.yt.player = {};
    root.yt.player.Application = {};
    const native = jest.fn(() => 'native result');
    publish(root, 'yt.player.Application.create', native);
    publish(root, 'yt.player.Application.createAlternate', native);
    const app = root.yt.player.Application;
    for (const factory of [app.create!, app.createAlternate!]) {
      const config = context();
      expect(factory(null, null, config)).toBe('native result');
      expect(new URLSearchParams(config.serializedExperimentFlags)
        .get(wait)).toBe('true');
    }
    expect(native).toHaveBeenCalledTimes(2);
  });

  it('handles initial globals, later calls, method and namespace replacement',
    () => {
      const first = jest.fn();
      const root: Page = {yt: {player: {Application: {create: first}}}};
      installAwaitCaptionDecoration(undefined, root);
      const invoke = () => {
        const config = context();
        root.yt!.player!.Application!.create!(null, null, config);
        expect(new URLSearchParams(config.serializedExperimentFlags)
          .get(wait)).toBe('true');
      };
      invoke();
      invoke();
      const second = jest.fn();
      root.yt!.player!.Application!.create = second;
      invoke();
      root.yt = {player: {Application: {create: second}}};
      invoke();
      expect(first).toHaveBeenCalledTimes(2);
      expect(second).toHaveBeenCalledTimes(2);
    });

  it.each(['', `${dispatch}=false`, `${dispatch}=1`,
    `${dispatch}=true&${dispatch}=true`])(
    'leaves configuration unchanged without an unambiguous prerequisite: %s',
    (flags) => {
      const root: Page = {};
      installAwaitCaptionDecoration(undefined, root);
      const native = jest.fn();
      publish(root, 'yt.player.Application.create', native);
      const config = {serializedExperimentFlags: flags};
      root.yt!.player!.Application!.create!(null, null, config);
      expect(config.serializedExperimentFlags).toBe(flags);
      expect(native).toHaveBeenCalledTimes(1);
    });

  it('preserves already-enabled flags, including readonly config', () => {
    const root: Page = {};
    const diagnostic = jest.fn();
    installAwaitCaptionDecoration(diagnostic, root);
    publish(root, 'yt.player.Application.create', jest.fn());
    const config = Object.freeze(context(`&${wait}=true&other=a%20b`));
    root.yt!.player!.Application!.create!(null, null, config);
    expect(config.serializedExperimentFlags).toContain('other=a%20b');
    expect(diagnostic).toHaveBeenCalledWith({status: 'already-enabled',
      property: undefined});
  });

  it('deduplicates only the intended flag', () => {
    const root: Page = {};
    installAwaitCaptionDecoration(undefined, root);
    publish(root, 'yt.player.Application.create', jest.fn());
    const config = context(`&${wait}=false&other=1&${wait}=true&other=2`);
    root.yt!.player!.Application!.create!(null, null, config);
    const flags = new URLSearchParams(config.serializedExperimentFlags);
    expect(flags.getAll(wait)).toEqual(['true']);
    expect(flags.getAll('other')).toEqual(['1', '2']);
  });

  it('preserves native results when diagnostics throw', () => {
    const root: Page = {};
    installAwaitCaptionDecoration(() => { throw Error('diagnostic'); }, root);
    const result = Promise.resolve('result');
    publish(root, 'yt.player.Application.create', () => result);
    expect(root.yt!.player!.Application!.create!(null, null, context()))
      .toBe(result);
    const error = new Error('native failure');
    publish(root, 'yt.player.Application.create', () => { throw error; });
    expect(() => root.yt!.player!.Application!.create!(null, null, context()))
      .toThrow(error);
  });

  it('fails open on unsupported contexts without invoking getters', () => {
    const root: Page = {};
    installAwaitCaptionDecoration(undefined, root);
    const native = jest.fn(() => 42);
    publish(root, 'yt.player.Application.create', native);
    const getter = jest.fn(() => { throw new Error('unexpected getter'); });
    const accessor = Object.defineProperty({}, 'serializedExperimentFlags',
      {get: getter});
    const contexts = [null, undefined, {}, {serializedExperimentFlags: 42},
      Object.freeze(context()), accessor];
    for (const config of contexts) {
      const result = root.yt!.player!.Application!.create!(null, null, config);
      expect(result).toBe(42);
    }
    expect(getter).not.toHaveBeenCalled();
    expect(native).toHaveBeenCalledTimes(contexts.length);
  });

  it('leaves existing accessors and immutable factory slots intact', () => {
    const native = jest.fn();
    const app = Object.freeze({create: native});
    const root: Page = {yt: {player: {Application: app}}};
    installAwaitCaptionDecoration(undefined, root);
    expect(root.yt!.player!.Application!.create).toBe(native);
    const getter = jest.fn(() => ({}));
    const other = Object.defineProperty({}, 'yt', {get: getter});
    installAwaitCaptionDecoration(undefined, other);
    expect(Object.getOwnPropertyDescriptor(other, 'yt')!.get).toBe(getter);
    expect(getter).not.toHaveBeenCalled();
  });

  it('is idempotent and retains wrappers across repeated export assignments',
    () => {
      const root: Page = {};
      const diagnostic = jest.fn();
      installAwaitCaptionDecoration(diagnostic, root);
      installAwaitCaptionDecoration(diagnostic, root);
      const native = jest.fn();
      publish(root, 'yt.player.Application.create', native);
      const wrapped = root.yt!.player!.Application!.create;
      publish(root, 'yt.player.Application.create', native);
      expect(root.yt!.player!.Application!.create).toBe(wrapped);
      wrapped!(null, null, context());
      expect(diagnostic).toHaveBeenCalledTimes(1);
    });
});
