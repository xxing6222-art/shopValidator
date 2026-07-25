import assert from "node:assert/strict";
import staticWorker from "./storevalidator-worker.mjs";

const assets = {
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    return new Response(`asset:${pathname}`, {
      headers: pathname.endsWith(".html")
        ? { "Content-Type": "text/html; charset=utf-8" }
        : {}
    });
  }
};

const env = { ASSETS: assets, BACKEND_ORIGIN: "https://shopvalidator.zhangyvjing.com" };

async function fetchPath(path) {
  return staticWorker.fetch(new Request(`https://storevalidator.zhangyvjing.com${path}`), env);
}

const nativeFetch = globalThis.fetch;
globalThis.fetch = async (request) => {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/api/public-cases/public-seed-laojiuguan") {
    return new Response(JSON.stringify({ code: "NOT_FOUND", message: "接口不存在" }), {
      status: 404,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
  if (pathname === "/api/leaderboard") {
    return new Response(JSON.stringify({
      cases: [{
        id: "public-seed-laojiuguan",
        category: "老酒馆",
        location: "江苏 · 扬州",
        decisionTitle: "守住熟客盘，只加一档低风险动作"
      }]
    }), {
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
  return new Response(JSON.stringify({ code: "NOT_FOUND", message: "接口不存在" }), {
    status: 404,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
};

try {
  const seededCase = await fetchPath("/api/public-cases/public-seed-laojiuguan");
  assert.equal(seededCase.status, 200);
  assert.equal((await seededCase.json()).decisionTitle, "守住熟客盘，只加一档低风险动作");
} finally {
  globalThis.fetch = nativeFetch;
}

const ranking = await fetchPath("/ranking");
assert.equal(await ranking.text(), "asset:/ranking.html");
assert.equal(ranking.headers.get("Content-Type"), "text/html; charset=utf-8");

const oldRanking = await fetchPath("/ranking.html");
assert.equal(oldRanking.status, 308);
assert.equal(new URL(oldRanking.headers.get("Location")).pathname, "/ranking");

const noSlashCase = await fetchPath("/case/public_case_123");
assert.equal(noSlashCase.status, 308);
assert.equal(new URL(noSlashCase.headers.get("Location")).pathname, "/case/public_case_123/");

const canonicalCase = await fetchPath("/case/public_case_123/");
assert.equal(await canonicalCase.text(), "asset:/case/public_case_123/");

const index = await (await import("node:fs/promises")).readFile(new URL("./index.html", import.meta.url), "utf8");
for (const rootAsset of ["/styles.css", "/fact-store.js", "/decision-engine.js", "/app.js", "/loading.mp4"]) {
  assert.ok(index.includes(rootAsset), `nested public routes must load ${rootAsset} from the site root`);
}
const buildScript = await (await import("node:fs/promises")).readFile(new URL("./build_site.py", import.meta.url), "utf8");
assert.ok(buildScript.includes('DIST / "ranking"'), "the build must emit an extensionless ranking resource");

const storeConfig = await (await import("node:fs/promises")).readFile(new URL("./wrangler.storevalidator.toml", import.meta.url), "utf8");
assert.ok(storeConfig.includes('"/demo"'), "the extensionless demo route must run through the canonical redirect worker");
assert.ok(storeConfig.includes('"/case/*"'), "shared case routes must run through the canonical redirect worker");

console.log("share routes: canonical slash redirects, root assets, and public case fallback passed");
