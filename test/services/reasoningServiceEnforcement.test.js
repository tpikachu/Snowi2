const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

const enTranslations = require("../../src/locales/en/translation.json");

// Exact localized messages: if a guard call site were removed, these calls
// would surface "No reasoning model selected" or a dispatch error instead.
const HTTPS_REQUIRED = enTranslations.reasoning.custom.httpsRequired;
const CUSTOM_ENDPOINT_INVALID = enTranslations.reasoning.custom.endpointInvalid;

test("ReasoningService entry points enforce endpoint and dispatch guards", async (t) => {
  installBrowserGlobals(t);
  const vite = await createRendererServer(t, {
    cachePrefix: "snowy-reasoning-enforcement-test-",
  });

  const reasoningService = (await vite.ssrLoadModule("/services/ReasoningService.ts")).default;
  t.after(() => reasoningService.destroy());
  const { useSettingsStore } = await vite.ssrLoadModule("/stores/settingsStore.ts");
  const { resolveConfiguredOpenAIBase } = await vite.ssrLoadModule("/services/ai/openaiBase.ts");
  const { default: i18n } = await vite.ssrLoadModule("/i18n.ts");
  await i18n.changeLanguage("en");

  await t.test("a provider selection without a model fails before dispatch", async () => {
    await assert.rejects(reasoningService.processText("hi", "", null, { provider: "openai" }), {
      message: "No reasoning model selected",
    });
  });

  await t.test("invalid Custom endpoints fail closed before inference dispatch", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ error: "must not dispatch" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    };

    try {
      for (const baseUrl of ["", "http://public.example.com/v1", "ftp://192.168.1.20/v1"]) {
        await assert.rejects(
          reasoningService.processText("hi", "gpt-4.1", null, {
            provider: "custom",
            baseUrl,
            customApiKey: "must-not-leak",
          }),
          { message: CUSTOM_ENDPOINT_INVALID }
        );
      }
      assert.equal(fetchCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test("Custom endpoints fail closed instead of falling back to OpenAI", () => {
    for (const baseUrl of [
      "",
      "http://public.example.com/v1",
      "https://api.groq.com/openai/v1",
      "https://inference.tinfoil.sh/v1",
    ]) {
      assert.throws(() => resolveConfiguredOpenAIBase("custom", baseUrl), {
        message: CUSTOM_ENDPOINT_INVALID,
      });
    }
    // HTTP stays allowed for local-network endpoints.
    assert.equal(
      resolveConfiguredOpenAIBase("custom", "http://192.168.1.20:11434/v1"),
      "http://192.168.1.20:11434/v1"
    );
  });

  await t.test("a scope's custom endpoint never borrows the cleanup key", async () => {
    useSettingsStore.setState({
      cleanupMode: "providers",
      cleanupProvider: "custom",
      cleanupCloudBaseUrl: "https://cleanup.example.com/v1",
      cleanupCustomApiKey: "cleanup-secret",
    });

    const originalFetch = globalThis.fetch;
    const requests = [];
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), auth: init?.headers?.Authorization });
      return new Response(JSON.stringify({ error: "expected test stop" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    };

    try {
      await assert.rejects(
        reasoningService.processText("hi", "other-model", null, {
          provider: "custom",
          baseUrl: "https://other-scope.example.com/v1",
          inferenceScope: "chatIntelligence",
        }),
        { message: "expected test stop" }
      );
      assert.ok(requests.length > 0);
      for (const request of requests) {
        assert.ok(request.url.startsWith("https://other-scope.example.com/v1/"));
        assert.equal(
          request.auth,
          undefined,
          "the cleanup key must not ride to another scope's endpoint"
        );
      }

      // The cleanup endpoint itself still gets the shared key.
      requests.length = 0;
      await assert.rejects(
        reasoningService.processText("hi", "cleanup-model", null, {
          provider: "custom",
          baseUrl: "https://cleanup.example.com/v1",
        }),
        { message: "expected test stop" }
      );
      assert.ok(requests.some((request) => request.auth === "Bearer cleanup-secret"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test("normal cleanup uses its saved valid Custom endpoint", async () => {
    useSettingsStore.setState({
      cleanupMode: "providers",
      cleanupProvider: "custom",
      cleanupCloudBaseUrl: "https://custom.example.com/v1",
      cleanupCustomApiKey: "custom-key",
    });

    const originalFetch = globalThis.fetch;
    const requestedUrls = [];
    globalThis.fetch = async (url) => {
      requestedUrls.push(String(url));
      return new Response(JSON.stringify({ error: "expected test stop" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    };

    try {
      await assert.rejects(reasoningService.processText("hi", "custom-model"), {
        message: "expected test stop",
      });
      assert.ok(requestedUrls.length > 0);
      assert.ok(requestedUrls.every((url) => url.startsWith("https://custom.example.com/v1/")));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test("implicit cleanup pins the selected provider instead of inferring from its model", async () => {
    useSettingsStore.setState({
      cleanupMode: "providers",
      cleanupProvider: "openai",
      cleanupModel: "llama-3.3-70b-versatile",
    });
    globalThis.window.electronAPI.getOpenAIKey = async () => "openai-key";

    const originalFetch = globalThis.fetch;
    const requestedUrls = [];
    globalThis.fetch = async (url) => {
      requestedUrls.push(String(url));
      return new Response(JSON.stringify({ error: "expected test stop" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    };

    try {
      await assert.rejects(
        reasoningService.processText("hi", "llama-3.3-70b-versatile"),
        { message: "expected test stop" }
      );
      assert.ok(requestedUrls.length > 0);
      assert.ok(requestedUrls.every((url) => url.startsWith("https://api.openai.com/")));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test("implicit self-hosted cleanup without a URL never infers a cloud provider", async () => {
    useSettingsStore.setState({
      cleanupMode: "self-hosted",
      cleanupRemoteUrl: "",
      cleanupModel: "gpt-4.1",
    });

    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response(null, { status: 500 });
    };

    try {
      await assert.rejects(reasoningService.processText("hi", "gpt-4.1"), {
        message: HTTPS_REQUIRED,
      });
      assert.equal(fetchCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test(
    "self-hosted execution rejects unsafe endpoint schemes before dispatch",
    async () => {
      const originalFetch = globalThis.fetch;
      let fetchCalls = 0;
      globalThis.fetch = async () => {
        fetchCalls += 1;
        return new Response(null, { status: 500 });
      };

      try {
        for (const lanUrl of ["http://public.example.com/v1", "ftp://192.168.1.20/v1"]) {
          await assert.rejects(
            reasoningService.processText("hi", "custom-model", null, { lanUrl }),
            { message: HTTPS_REQUIRED }
          );

          const textStream = reasoningService.processTextStreaming(
            [{ role: "user", content: "hi" }],
            "custom-model",
            "custom",
            { systemPrompt: "s", lanUrl }
          );
          await assert.rejects(textStream.next(), { message: HTTPS_REQUIRED });

          const toolStream = reasoningService.processTextStreamingAI(
            [{ role: "user", content: "hi" }],
            "custom-model",
            "custom",
            { systemPrompt: "s", lanUrl },
            {}
          );
          await assert.rejects(toolStream.next(), { message: HTTPS_REQUIRED });
        }

        assert.equal(fetchCalls, 0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  );
});
