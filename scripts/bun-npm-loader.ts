// Bun preload — rewrites Deno-style `npm:pkg@x` and `https://esm.sh/...`
// imports so the Deno retrieval edge function can load under Bun.
//
// We can't intercept `npm:` via onResolve because Bun's resolver rejects
// unknown protocols before the plugin runs. Instead, we onLoad the Deno
// edge function files and rewrite the imports in-source.
Bun.plugin({
  name: "deno-compat-loader",
  setup(build) {
    build.onLoad(
      { filter: /\/supabase\/functions\/.*\.ts$/ },
      async (args) => {
        const text = await Bun.file(args.path).text();
        const rewritten = text
          .replace(/(["'])npm:([^"']+)\1/g, (_, q, spec) => {
            const pkg = spec.replace(/@\d[^/]*$/, "").replace(/(@[^/]+\/[^@]+)@.*$/, "$1");
            return `${q}${pkg}${q}`;
          })
          .replace(/(["'])https:\/\/esm\.sh\/([^"']+)\1/g, (_, q, spec) => {
            const parts = spec.split("/");
            const head = parts[0];
            const pkg = head.replace(/@\d[^/]*$/, "");
            return `${q}${pkg}${q}`;
          });
        return { contents: rewritten, loader: "ts" };
      },
    );
  },
});
