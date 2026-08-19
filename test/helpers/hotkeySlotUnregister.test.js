const test = require("node:test");
const assert = require("node:assert/strict");

// Stub electron's globalShortcut before hotkeyManager loads so slot
// registration can run outside Electron. `unregisterCalls` records every
// accelerator teardown attempts, including ones that were never registered.
const registered = new Map();
const unregisterCalls = [];
require.cache[require.resolve("electron")] = {
  exports: {
    globalShortcut: {
      register(accelerator, callback) {
        if (registered.has(accelerator)) return false;
        registered.set(accelerator, callback);
        return true;
      },
      unregister(accelerator) {
        unregisterCalls.push(accelerator);
        registered.delete(accelerator);
      },
      isRegistered(accelerator) {
        return registered.has(accelerator);
      },
      unregisterAll() {
        registered.clear();
      },
    },
    BrowserWindow: class {},
  },
};

const HotkeyManager = require("../../src/helpers/hotkeyManager.js");

const noop = () => {};

test.beforeEach(() => {
  registered.clear();
  unregisterCalls.length = 0;
});

test("unregisterSlot releases every accelerator the slot registered", async () => {
  const manager = new HotkeyManager();

  // Only Windows diverts modifier-only combos to the native listener, so
  // everywhere else globalShortcut owns "Control+Alt" and must release it.
  await manager.registerSlot("agent", "F7,Control+Alt", noop, { atomic: true });

  manager.unregisterSlot("agent");

  assert.deepEqual([...registered.keys()], []);
  assert.deepEqual(manager.getSlotHotkeys("agent"), []);
});

test("a combo freed by unregisterSlot can be registered again", async () => {
  const manager = new HotkeyManager();

  await manager.registerSlot("agent", "Control+Alt", noop, { atomic: true });
  manager.unregisterSlot("agent");

  const reregistered = await manager.registerSlot("agent", "Control+Alt", noop, { atomic: true });
  assert.equal(reregistered.success, true);
  assert.deepEqual(manager.getSlotHotkeys("agent"), ["Control+Alt"]);
});

test("unregisterSlot never releases an accelerator the slot does not own", async () => {
  const manager = new HotkeyManager();

  await manager.registerSlot("agent", "F7", noop, { atomic: true });
  await manager.registerSlot("cancel", "F8", noop, { atomic: true });
  // Linux registration defensively unregisters first; only teardown is under test.
  unregisterCalls.length = 0;

  manager.unregisterSlot("agent");

  assert.deepEqual(unregisterCalls, ["F7"]);
  assert.deepEqual([...registered.keys()], ["F8"]);
  assert.deepEqual(manager.getSlotHotkeys("cancel"), ["F8"]);
});

test("unregisterSlot skips hotkeys a native listener owns", async () => {
  const manager = new HotkeyManager();

  // "RightShift" gets a null accelerator on every platform.
  await manager.registerSlot("agent", "F7,RightShift", noop, { atomic: true });
  unregisterCalls.length = 0;

  manager.unregisterSlot("agent");

  assert.deepEqual(unregisterCalls, ["F7"]);
});

// Hidden features must not hold a live global accelerator: it would fire into a
// surface the user cannot see and cannot rebind, since its settings row is gone
// too. Registration is refused at the manager so no call site can bypass it.
test("registerSlot refuses slots belonging to a disabled feature", async () => {
  const { DICTATION_ENABLED, DICTATION_HOTKEY_SLOTS } = require("../../src/config/features.js");
  const manager = new HotkeyManager();

  for (const slot of DICTATION_HOTKEY_SLOTS) {
    const result = await manager.registerSlot(slot, "F7", noop, { atomic: true });
    assert.equal(manager.isSlotEnabled(slot), DICTATION_ENABLED, slot);
    if (!DICTATION_ENABLED) {
      assert.equal(result.success, false, slot);
      assert.equal(result.disabled, true, slot);
      // The slot may still carry a default value; what must not happen is a
      // live OS-level accelerator pointing at the hidden feature.
      assert.deepEqual([...registered.keys()], [], slot);
    }
  }

  // Slots outside the flag are untouched.
  assert.equal(manager.isSlotEnabled("meeting"), true);
  assert.equal((await manager.registerSlot("meeting", "F7", noop)).success, true);
});

test("unregisterSlot on an already-cleared slot is a no-op", async () => {
  const manager = new HotkeyManager();

  await manager.registerSlot("agent", "F7", noop, { atomic: true });
  manager.unregisterSlot("agent");
  unregisterCalls.length = 0;

  manager.unregisterSlot("agent");

  assert.deepEqual(unregisterCalls, []);
});
