const waitFlag = 'html5_await_track_decoration_in_load_track';
const dispatchFlag = 'html5_dispatch_tracklist_loaded_event';

export type CaptionDecorationDiagnostic = {
  status: 'applied' | 'already-enabled' | 'prerequisite-disabled' |
    'unsupported-config' | 'unavailable-hook';
  property?: string;
};

const installations = new WeakSet<object>();

/** YouTube may need time to add access tokens to caption URLs. Its code calls
 * this preparation "track decoration". Enable its own wait for that step before
 * the player copies its settings. Only change players using that preparation.
 * Install at document_start on the page's side, before player creation.
 * Tests can supply a stand-in for window through the optional root argument.
 */
export function installAwaitCaptionDecoration(
  diagnostic?: (value: CaptionDecorationDiagnostic) => void,
  root: object = window,
): void {
  if (installations.has(root)) return;
  installations.add(root);
  const report = (status: CaptionDecorationDiagnostic['status'],
    property?: string) => {
    try {
      diagnostic?.({status, property});
    } catch { /* Ignore observer errors. */ }
  };
  const object = (value: unknown): value is object =>
    value !== null &&
      (typeof value === 'object' || typeof value === 'function');
  const configure = (value: unknown) => {
    if (!object(value)) return report('unsupported-config');
    const descriptor = Object.getOwnPropertyDescriptor(
      value, 'serializedExperimentFlags',
    );
    if (!descriptor || typeof descriptor.value !== 'string') {
      return report('unsupported-config');
    }
    const flags = new URLSearchParams(descriptor.value);
    // YouTube treats repeated settings as an array, but enables this feature
    // only for the single string "true". Do not add a duplicate setting.
    const dispatch = flags.getAll(dispatchFlag);
    if (dispatch.length !== 1 || dispatch[0] !== 'true') {
      return report('prerequisite-disabled');
    }
    const wait = flags.getAll(waitFlag);
    if (wait.length === 1 && wait[0] === 'true') {
      return report('already-enabled');
    }
    if (!descriptor.writable) return report('unsupported-config');
    flags.set(waitFlag, 'true');
    if (Reflect.set(value, 'serializedExperimentFlags', flags.toString())) {
      report('applied');
    } else report('unsupported-config');
  };
  const wrappers = new WeakMap<object, object>();
  const wrap = (value: unknown): unknown => {
    if (typeof value !== 'function') return value;
    const cached = wrappers.get(value);
    if (cached) return cached;
    const wrapped = new Proxy(value, {
      apply(target, receiver, args) {
        // YouTube passes the player's settings as the third create() argument.
        try { configure(args[2]); } catch { report('unsupported-config'); }
        // Keep the original function's return value and any error it throws.
        return Reflect.apply(target, receiver, args);
      },
    });
    wrappers.set(value, wrapped);
    wrappers.set(wrapped, wrapped);
    return wrapped;
  };
  const watched = new WeakMap<object, Set<string>>();
  const watch = (owner: object, key: string,
    transform: (value: unknown) => unknown) => {
    let keys = watched.get(owner);
    if (keys?.has(key)) return;
    if (!keys) watched.set(owner, keys = new Set());
    keys.add(key);
    try {
      const descriptor = Object.getOwnPropertyDescriptor(owner, key);
      // Leave existing getters/setters, inherited properties, and read-only
      // properties alone. A read-only object may still have editable children.
      if (descriptor && (!('value' in descriptor) ||
          !descriptor.configurable || !descriptor.writable)) {
        if ('value' in descriptor && object(descriptor.value) &&
            key !== 'create' && key !== 'createAlternate') {
          transform(descriptor.value);
        } else report('unavailable-hook', key);
        return;
      }
      if (!descriptor && key in owner) {
        report('unavailable-hook', key);
        return;
      }
      let value = transform(descriptor?.value);
      // YouTube reads these values before creating missing objects. Keep
      // returning undefined until YouTube assigns a value. Defining our getter
      // makes the property exist for `in`/hasOwnProperty checks; tests cover
      // that difference from an absent property.
      Object.defineProperty(owner, key, {
        configurable: true,
        enumerable: descriptor?.enumerable ?? true,
        get: () => value,
        set: (next: unknown) => { value = transform(next); },
      });
    } catch { report('unavailable-hook', key); }
  };
  const namespace = (owner: object, path: string[]) => {
    const [key, ...rest] = path;
    watch(owner, key, (value) => {
      if (object(value)) {
        if (rest.length) namespace(value, rest);
        else {
          watch(value, 'create', wrap);
          watch(value, 'createAlternate', wrap);
        }
      }
      return value;
    });
  };
  // These objects appear as YouTube's scripts load. Watch their assignments so
  // the settings can be adjusted before the first player is created.
  namespace(root, ['yt', 'player', 'Application']);
}
