const test = require("node:test");
const assert = require("node:assert/strict");

// Stub electron's globalShortcut before hotkeyManager loads so slot
// registration can run outside Electron.
const registered = new Map();
require.cache[require.resolve("electron")] = {
  exports: {
    globalShortcut: {
      register(accelerator, callback) {
        if (registered.has(accelerator)) return false;
        registered.set(accelerator, callback);
        return true;
      },
      unregister(accelerator) {
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
const { isRegistrableFnCombo } = HotkeyManager;

const noop = () => {};

test.beforeEach(() => {
  registered.clear();
});

test("Fn combines with a function key, with or without other modifiers", () => {
  assert.equal(isRegistrableFnCombo("Fn+F5"), true);
  assert.equal(isRegistrableFnCombo("Fn+Shift+F12"), true);
  assert.equal(isRegistrableFnCombo("Fn+F19"), true);
  // Not an Fn combo at all: nothing to refuse.
  assert.equal(isRegistrableFnCombo("Control+Shift+K"), true);
  assert.equal(isRegistrableFnCombo("GLOBE"), true);
  assert.equal(isRegistrableFnCombo("Fn"), true);
});

test("Fn with anything but a function key is refused — it would register as the bare key", () => {
  for (const hotkey of ["Fn+K", "Fn+Left", "Fn+Space", "Fn+Command+K", "Fn+Backspace"]) {
    assert.equal(isRegistrableFnCombo(hotkey), false, hotkey);
  }
});

test("registerSlot never grabs a bare letter for an Fn+letter binding", async () => {
  // The prefix is stripped at registration, so before the guard this bound
  // the bar to every K typed anywhere on the Mac.
  const manager = new HotkeyManager();

  const result = await manager.registerSlot("agent", "Fn+K", noop, { atomic: true });

  assert.equal(result.success, false);
  assert.deepEqual([...registered.keys()], []);
  assert.deepEqual(manager.getSlotHotkeys("agent"), []);
});

test("registerSlot still binds Fn+F-key as the function key it sends", async () => {
  const manager = new HotkeyManager();

  const result = await manager.registerSlot("agent", "Fn+F5", noop, { atomic: true });

  assert.equal(result.success, true);
  assert.deepEqual([...registered.keys()], ["F5"]);
});
